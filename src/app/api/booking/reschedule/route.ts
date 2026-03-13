import { NextRequest, NextResponse } from "next/server";
import { dbPatch, dbPush, dbRead, verifyCaller } from "@/lib/server/adminApi";
import { resolveInterviewZoomSettings } from "@/lib/interviews/config";
import { toInterviewTimestamp } from "@/lib/interviews/datetime";
import { pickIcsOrganizer, resolveInterviewerContacts } from "@/lib/server/interviewerResolver";
import {
  sendInterviewerRescheduledNotificationEmail,
  sendInterviewRescheduledEmail,
} from "@/lib/server/interviewEmail";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type SlotRecord = Record<string, unknown>;
type ApplicationEntry = { id: string; row: Record<string, unknown> };
const TERMINAL_APPLICATION_STATUSES = new Set(["accepted", "waitlisted", "not accepted"]);

function normalizeId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function toTimestamp(value: unknown): number {
  const ms = Date.parse(String(value ?? ""));
  return Number.isNaN(ms) ? 0 : ms;
}

function pickApplicationByEmailAndName(
  entries: ApplicationEntry[],
  email: string,
  name: string,
): ApplicationEntry | null {
  const targetEmail = normalizeKey(email);
  const targetName = normalizeKey(name);
  const emailMatches = entries.filter(({ row }) => normalizeKey(row.email) === targetEmail);
  if (emailMatches.length === 0) return null;

  const nameMatches = targetName
    ? emailMatches.filter(({ row }) => normalizeKey(row.fullName) === targetName)
    : [];
  const pool = nameMatches.length > 0 ? nameMatches : emailMatches;
  pool.sort((a, b) => {
    const aTime = Math.max(toTimestamp(a.row.updatedAt), toTimestamp(a.row.createdAt));
    const bTime = Math.max(toTimestamp(b.row.updatedAt), toTimestamp(b.row.createdAt));
    return bTime - aTime;
  });
  return pool[0] ?? null;
}

async function syncApplicationAfterReschedule(params: {
  fromSlotId: string;
  toSlotId: string;
  toDatetime: string;
  bookedBy: string;
  bookerEmail: string;
  bookerName: string;
  idToken: string;
}): Promise<void> {
  const applications = await dbRead("applications", params.idToken);
  if (!applications || typeof applications !== "object") return;

  const entries = Object.entries(applications as Record<string, Record<string, unknown>>)
    .map(([id, row]) => ({ id, row: row ?? {} }));

  let target: ApplicationEntry | null = null;
  const bookedBy = normalizeKey(params.bookedBy);
  if (bookedBy && bookedBy !== "public-booking") {
    target = entries.find(({ row }) => normalizeKey(row.interviewInviteToken) === bookedBy) ?? null;
  }
  if (!target) {
    target = entries.find(({ row }) => (
      normalizeKey(row.interviewSlotId) === normalizeKey(params.fromSlotId)
      && normalizeKey(row.email) === normalizeKey(params.bookerEmail)
    )) ?? null;
  }
  if (!target) {
    target = pickApplicationByEmailAndName(entries, params.bookerEmail, params.bookerName);
  }
  if (!target) return;

  const status = normalizeKey(target.row.status);
  const patch: Record<string, unknown> = {
    interviewSlotId: params.toSlotId,
    interviewScheduledAt: params.toDatetime,
    updatedAt: new Date().toISOString(),
  };
  if (bookedBy && bookedBy !== "public-booking") {
    patch.interviewInviteToken = params.bookedBy;
  }
  if (!target.row.statusManualOverride && !TERMINAL_APPLICATION_STATUSES.has(status)) {
    patch.status = "Interview Scheduled";
  }
  await dbPatch(`applications/${target.id}`, patch, params.idToken);
}

export async function POST(req: NextRequest) {
  const verified = await verifyCaller(req, ["admin", "project_lead"]);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }

  const body = await req.json().catch(() => ({}));
  const fromSlotId = normalizeId((body as Record<string, unknown>).fromSlotId);
  const toSlotId = normalizeId((body as Record<string, unknown>).toSlotId);
  if (!fromSlotId || !toSlotId || fromSlotId === toSlotId) {
    return NextResponse.json({ error: "invalid_slots" }, { status: 400 });
  }

  const [fromData, toData, settingsData, teamData] = await Promise.all([
    dbRead(`interviewSlots/${fromSlotId}`, verified.caller.idToken),
    dbRead(`interviewSlots/${toSlotId}`, verified.caller.idToken),
    dbRead("interviewSettings", verified.caller.idToken).catch(() => null),
    dbRead("team", verified.caller.idToken).catch(() => null),
  ]);

  if (!fromData || !toData) {
    return NextResponse.json({ error: "slot_not_found" }, { status: 404 });
  }

  const fromSlot = fromData as SlotRecord;
  const toSlot = toData as SlotRecord;
  const fromBookedBy = String(fromSlot.bookedBy ?? "").trim();
  const fromEmail = String(fromSlot.bookerEmail ?? "").trim();
  const fromName = String(fromSlot.bookerName ?? "").trim();
  const fromDatetime = String(fromSlot.datetime ?? "");
  const toDatetime = String(toSlot.datetime ?? "");

  const toStartsAt = toInterviewTimestamp(toDatetime);
  if (!fromBookedBy || !fromEmail) {
    return NextResponse.json({ error: "source_not_booked" }, { status: 409 });
  }
  if (!toSlot.available || toSlot.bookedBy || Number.isNaN(toStartsAt) || toStartsAt <= Date.now()) {
    return NextResponse.json({ error: "target_unavailable" }, { status: 409 });
  }

  await dbPatch(`interviewSlots/${toSlotId}`, {
    available: false,
    bookedBy: fromBookedBy,
    bookerName: fromName,
    bookerEmail: fromEmail,
    reminderSentAt: "",
  }, verified.caller.idToken);

  await dbPatch(`interviewSlots/${fromSlotId}`, {
    available: true,
    bookedBy: "",
    bookerName: "",
    bookerEmail: "",
    reminderSentAt: "",
  }, verified.caller.idToken);

  await syncApplicationAfterReschedule({
    fromSlotId,
    toSlotId,
    toDatetime,
    bookedBy: fromBookedBy,
    bookerEmail: fromEmail,
    bookerName: fromName,
    idToken: verified.caller.idToken,
  }).catch(() => {});

  const actorName = verified.caller.name || verified.caller.email;
  await dbPush("auditLogs", {
    timestamp: new Date().toISOString(),
    action: "update",
    collection: "interviewSlots",
    recordId: fromSlotId,
    actorUid: verified.caller.uid,
    actorEmail: verified.caller.email,
    actorName,
    details: { rescheduledTo: toSlotId, available: true, bookedBy: "" },
  }, verified.caller.idToken).catch(() => {});

  await dbPush("auditLogs", {
    timestamp: new Date().toISOString(),
    action: "update",
    collection: "interviewSlots",
    recordId: toSlotId,
    actorUid: verified.caller.uid,
    actorEmail: verified.caller.email,
    actorName,
    details: { rescheduledFrom: fromSlotId, available: false, bookedBy: fromBookedBy },
  }, verified.caller.idToken).catch(() => {});

  const zoom = resolveInterviewZoomSettings(settingsData, process.env.INTERVIEW_ZOOM_LINK ?? "");
  const interviewerContacts = resolveInterviewerContacts(toSlot, teamData);
  const organizer = pickIcsOrganizer(interviewerContacts, process.env.EMAIL_FROM ?? "");
  const durationMinutes = Number(toSlot.durationMinutes ?? 30);
  const location = typeof toSlot.location === "string" ? toSlot.location : "";
  if (fromEmail && fromDatetime && toDatetime) {
    await sendInterviewRescheduledEmail({
      to: fromEmail,
      bookerName: fromName,
      slotId: toSlotId,
      datetimeIso: toDatetime,
      previousDatetimeIso: fromDatetime,
      durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 30,
      zoomLink: zoom.zoomLink,
      location,
      organizerName: organizer.name,
      organizerEmail: organizer.email,
    }).catch(() => {});
    const sent = new Set<string>();
    for (const contact of interviewerContacts) {
      const email = contact.email.trim().toLowerCase();
      if (!email || sent.has(email)) continue;
      sent.add(email);
      await sendInterviewerRescheduledNotificationEmail({
        to: contact.email,
        interviewerName: contact.name,
        bookerName: fromName,
        bookerEmail: fromEmail,
        previousDatetimeIso: fromDatetime,
        datetimeIso: toDatetime,
        durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 30,
        zoomLink: zoom.zoomLink,
        location,
        slotId: toSlotId,
      }).catch(() => {});
    }
  }

  return NextResponse.json({ success: true });
}
