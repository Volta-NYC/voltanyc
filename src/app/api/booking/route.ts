import { NextRequest, NextResponse } from "next/server";
import { getAdminDB } from "@/lib/firebaseAdmin";
import { resolveInterviewZoomSettings } from "@/lib/interviews/config";
import { formatInterviewInET, toInterviewTimestamp } from "@/lib/interviews/datetime";
import { pickIcsOrganizer, resolveInterviewerContacts } from "@/lib/server/interviewerResolver";
import {
  sendInterviewerBookingNotificationEmail,
  sendInterviewerRescheduledNotificationEmail,
  sendInterviewBookingEmail,
  sendInterviewRescheduledEmail,
} from "@/lib/server/interviewEmail";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const DB_URL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? "";

async function dbGet(path: string): Promise<unknown> {
  const db = getAdminDB();
  if (db) {
    const snap = await db.ref(path).get();
    return snap.exists() ? snap.val() : null;
  }
  if (!DB_URL) return null;
  const res = await fetch(`${DB_URL}/${path}.json`, { cache: "no-store" });
  if (!res.ok || res.status === 404) return null;
  const data = await res.json() as unknown;
  return data ?? null;
}

async function dbPatch(path: string, data: Record<string, unknown>): Promise<void> {
  const db = getAdminDB();
  if (db) {
    await db.ref(path).update(data);
    return;
  }
  if (!DB_URL) throw new Error("no_db");
  const res = await fetch(`${DB_URL}/${path}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("db_write_failed");
}

async function dbPush(path: string, data: Record<string, unknown>): Promise<void> {
  const db = getAdminDB();
  if (db) {
    await db.ref(path).push(data);
    return;
  }
  if (!DB_URL) throw new Error("no_db");
  const res = await fetch(`${DB_URL}/${path}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("db_write_failed");
}

async function writeAuditLog(entry: {
  action: "update";
  collection: string;
  recordId: string;
  actorUid: string;
  actorEmail: string;
  actorName?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await dbPush("auditLogs", {
    timestamp: new Date().toISOString(),
    ...entry,
  });
}

type ExistingBooking = {
  id: string;
  datetime: string;
};

type ApplicationEntry = {
  id: string;
  row: Record<string, unknown>;
};

const THREE_WEEKS_MS = 21 * 24 * 60 * 60 * 1000;
const TERMINAL_APPLICATION_STATUSES = new Set(["accepted", "waitlisted", "not accepted"]);

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function toTimestamp(value: unknown): number {
  const ms = Date.parse(String(value ?? ""));
  return Number.isNaN(ms) ? 0 : ms;
}

function hasInterviewerMembers(slot: Record<string, unknown>): boolean {
  const ids = slot.interviewerMemberIds;
  return Array.isArray(ids) && ids.some((id) => typeof id === "string" && id.trim().length > 0);
}

function getInterviewerMemberIds(slot: Record<string, unknown>): string[] {
  const ids = slot.interviewerMemberIds;
  if (!Array.isArray(ids)) return [];
  return Array.from(
    new Set(
      ids
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function formatEtShort(datetimeIso: string): string {
  const datePart = formatInterviewInET(datetimeIso, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timePart = formatInterviewInET(datetimeIso, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart}, ${timePart} ET`;
}

function buildInterviewerUpcomingSummary(
  slotsData: unknown,
  interviewerMemberId: string,
  nowMs: number,
): { lines: string[]; total: number } {
  if (!slotsData || !interviewerMemberId) return { lines: [], total: 0 };
  const windowEnd = nowMs + THREE_WEEKS_MS;
  const entries = Object.entries(slotsData as Record<string, Record<string, unknown>>)
    .map(([, raw]) => raw ?? {})
    .filter((slot) => {
      if (!slot || typeof slot !== "object") return false;
      const row = slot as Record<string, unknown>;
      if (!row.bookedBy || row.available) return false;
      const startsAt = toInterviewTimestamp(String(row.datetime ?? ""));
      if (Number.isNaN(startsAt) || startsAt < nowMs || startsAt > windowEnd) return false;
      const ids = getInterviewerMemberIds(row);
      return ids.includes(interviewerMemberId);
    })
    .sort((a, b) => toInterviewTimestamp(String(a.datetime ?? "")) - toInterviewTimestamp(String(b.datetime ?? "")));

  const lines = entries.map((slot) => {
    const row = slot as Record<string, unknown>;
    const whoName = String(row.bookerName ?? "").trim() || "Interviewee";
    const whoEmail = String(row.bookerEmail ?? "").trim();
    const who = whoEmail ? `${whoName} (${whoEmail})` : whoName;
    return `${formatEtShort(String(row.datetime ?? ""))} — ${who}`;
  });
  return { lines, total: lines.length };
}

async function findExistingBookingsByEmail(email: string, excludeSlotId: string): Promise<ExistingBooking[]> {
  if (!email) return [];
  const slotsData = await dbGet("interviewSlots");
  if (!slotsData) return [];
  const now = Date.now();
  const target = email.trim().toLowerCase();
  return Object.entries(slotsData as Record<string, Record<string, unknown>>)
    .map(([id, slot]) => ({ id, slot }))
    .filter(({ id, slot }) => {
      if (id === excludeSlotId) return false;
      const slotEmail = String(slot.bookerEmail ?? "").trim().toLowerCase();
      const startsAt = toInterviewTimestamp(String(slot.datetime ?? ""));
      return !!slot.bookedBy && !slot.available && slotEmail === target && startsAt > now;
    })
    .map(({ id, slot }) => ({
      id,
      datetime: String(slot.datetime ?? ""),
    }))
    .sort((a, b) => toInterviewTimestamp(a.datetime) - toInterviewTimestamp(b.datetime));
}

async function clearExistingBooking(slotId: string): Promise<void> {
  await dbPatch(`interviewSlots/${slotId}`, {
    available: true,
    bookedBy: "",
    bookerName: "",
    bookerEmail: "",
    reminderSentAt: "",
  });
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

async function syncApplicationInterviewScheduled(params: {
  bookingEmail: string;
  bookingName: string;
  newSlotId: string;
  newDatetimeIso: string;
  inviteToken?: string;
  previousSlotIds?: string[];
}): Promise<void> {
  const email = normalizeKey(params.bookingEmail);
  if (!email || !params.newSlotId || !params.newDatetimeIso) return;

  const applicationsData = await dbGet("applications");
  if (!applicationsData || typeof applicationsData !== "object") return;

  const entries = Object.entries(applicationsData as Record<string, Record<string, unknown>>)
    .map(([id, row]) => ({ id, row: row ?? {} }));

  let target: ApplicationEntry | null = null;
  const inviteToken = normalizeKey(params.inviteToken);
  if (inviteToken) {
    target = entries.find(({ row }) => normalizeKey(row.interviewInviteToken) === inviteToken) ?? null;
  }

  if (!target && params.previousSlotIds?.length) {
    const previousIds = new Set(params.previousSlotIds.map((value) => normalizeKey(value)));
    target = entries.find(({ row }) => (
      normalizeKey(row.email) === email
      && previousIds.has(normalizeKey(row.interviewSlotId))
    )) ?? null;
  }

  if (!target) {
    target = pickApplicationByEmailAndName(entries, email, params.bookingName);
  }
  if (!target) return;

  const status = normalizeKey(target.row.status);
  const patch: Record<string, unknown> = {
    interviewSlotId: params.newSlotId,
    interviewScheduledAt: params.newDatetimeIso,
    updatedAt: new Date().toISOString(),
  };
  if (inviteToken) patch.interviewInviteToken = params.inviteToken;
  if (!target.row.statusManualOverride && !TERMINAL_APPLICATION_STATUSES.has(status)) {
    patch.status = "Interview Scheduled";
  }

  await dbPatch(`applications/${target.id}`, patch);
}

export async function GET() {
  let slotsData: unknown;
  try {
    slotsData = await dbGet("interviewSlots");
  } catch {
    slotsData = null;
  }

  const now = Date.now();
  type RawSlot = Record<string, unknown> & { id: string };
  const slots: RawSlot[] = slotsData
    ? Object.entries(slotsData as Record<string, Record<string, unknown>>)
      .map(([id, data]): RawSlot => ({ ...data, id }))
      .filter((s) => !!s["available"] && !s["bookedBy"] && hasInterviewerMembers(s) && toInterviewTimestamp(s["datetime"] as string) > now)
      .sort((a, b) => toInterviewTimestamp(a["datetime"] as string) - toInterviewTimestamp(b["datetime"] as string))
    : [];

  let settingsData: unknown = null;
  try {
    settingsData = await dbGet("interviewSettings");
  } catch {
    settingsData = null;
  }
  const zoom = resolveInterviewZoomSettings(settingsData, process.env.INTERVIEW_ZOOM_LINK ?? "");

  return NextResponse.json({
    slots,
    zoomLink: zoom.zoomLink,
  });
}

export async function POST(req: NextRequest) {
  const { slotId, bookerName, bookerEmail } = await req.json() as {
    slotId?: string;
    bookerName?: string;
    bookerEmail?: string;
  };

  const cleanSlotId = (slotId ?? "").trim();
  const cleanName = (bookerName ?? "").trim();
  const cleanEmail = (bookerEmail ?? "").trim();

  if (!cleanSlotId) {
    return NextResponse.json({ error: "missing_slot" }, { status: 400 });
  }
  if (!cleanName || !cleanEmail) {
    return NextResponse.json({ error: "missing_booker" }, { status: 400 });
  }

  let slotData: unknown;
  try {
    slotData = await dbGet(`interviewSlots/${cleanSlotId}`);
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (!slotData) {
    return NextResponse.json({ error: "slot_not_found" }, { status: 404 });
  }

  const slot = slotData as Record<string, unknown>;
  const isAvailable = !!slot.available;
  const alreadyBooked = !!slot.bookedBy;
  const startsAt = toInterviewTimestamp((slot.datetime as string) ?? "");
  const hasInterviewers = hasInterviewerMembers(slot);

  if (!isAvailable || alreadyBooked || !hasInterviewers || Number.isNaN(startsAt) || startsAt <= Date.now()) {
    return NextResponse.json({ error: "slot_unavailable" }, { status: 409 });
  }

  try {
    await dbPatch(`interviewSlots/${cleanSlotId}`, {
      available: false,
      bookedBy: "public-booking",
      bookerName: cleanName,
      bookerEmail: cleanEmail,
      reminderSentAt: "",
    });
    await writeAuditLog({
      action: "update",
      collection: "interviewSlots",
      recordId: cleanSlotId,
      actorUid: "public:booking",
      actorEmail: cleanEmail.toLowerCase(),
      actorName: cleanName,
      details: { bookedBy: "public-booking", available: false },
    }).catch(() => {});
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  let replacedBookings: ExistingBooking[] = [];
  try {
    replacedBookings = await findExistingBookingsByEmail(cleanEmail, cleanSlotId);
    for (const existing of replacedBookings) {
      await clearExistingBooking(existing.id);
      await writeAuditLog({
        action: "update",
        collection: "interviewSlots",
        recordId: existing.id,
        actorUid: "public:booking",
        actorEmail: cleanEmail.toLowerCase(),
        actorName: cleanName,
        details: { rescheduledTo: cleanSlotId, available: true, bookedBy: "" },
      }).catch(() => {});
    }
  } catch {
    // Do not fail the booking if cleanup fails.
  }

  const durationMinutes = Number(slot.durationMinutes ?? 30);
  const datetimeIso = typeof slot.datetime === "string" ? slot.datetime : "";
  const location = typeof slot.location === "string" ? slot.location : "";
  await syncApplicationInterviewScheduled({
    bookingEmail: cleanEmail,
    bookingName: cleanName,
    newSlotId: cleanSlotId,
    newDatetimeIso: datetimeIso,
    previousSlotIds: replacedBookings.map((booking) => booking.id),
  }).catch(() => {});

  if (datetimeIso) {
    let settingsData: unknown = null;
    let teamData: unknown = null;
    try {
      [settingsData, teamData] = await Promise.all([
        dbGet("interviewSettings"),
        dbGet("team"),
      ]);
    } catch {
      settingsData = null;
      teamData = null;
    }
    const zoom = resolveInterviewZoomSettings(settingsData, process.env.INTERVIEW_ZOOM_LINK ?? "");
    const interviewerContacts = resolveInterviewerContacts(slot, teamData);
    const organizer = pickIcsOrganizer(interviewerContacts, process.env.EMAIL_FROM ?? "");
    const payload = {
      to: cleanEmail,
      bookerName: cleanName,
      slotId: cleanSlotId,
      datetimeIso,
      durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 30,
      zoomLink: zoom.zoomLink,
      location,
      organizerName: organizer.name,
      organizerEmail: organizer.email,
    };
    if (replacedBookings.length > 0 && replacedBookings[0]?.datetime) {
      await sendInterviewRescheduledEmail({
        ...payload,
        previousDatetimeIso: replacedBookings[0].datetime,
      }).catch(() => {});
      const sent = new Set<string>();
      for (const contact of interviewerContacts) {
        const email = contact.email.trim().toLowerCase();
        if (!email || sent.has(email)) continue;
        sent.add(email);
        await sendInterviewerRescheduledNotificationEmail({
          to: contact.email,
          interviewerName: contact.name,
          bookerName: cleanName,
          bookerEmail: cleanEmail,
          previousDatetimeIso: replacedBookings[0].datetime,
          datetimeIso,
          durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 30,
          zoomLink: zoom.zoomLink,
          location,
          slotId: cleanSlotId,
        }).catch(() => {});
      }
    } else {
      await sendInterviewBookingEmail(payload).catch(() => {});
      let allSlotsData: unknown = null;
      try {
        allSlotsData = await dbGet("interviewSlots");
      } catch {
        allSlotsData = null;
      }
      const summaryNow = Date.now();
      const sent = new Set<string>();
      for (const contact of interviewerContacts) {
        const email = contact.email.trim().toLowerCase();
        if (!email || sent.has(email)) continue;
        sent.add(email);
        const summary = buildInterviewerUpcomingSummary(allSlotsData, contact.memberId, summaryNow);
        await sendInterviewerBookingNotificationEmail({
          to: contact.email,
          interviewerName: contact.name,
          bookerName: cleanName,
          bookerEmail: cleanEmail,
          datetimeIso,
          durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 30,
          zoomLink: zoom.zoomLink,
          location,
          slotId: cleanSlotId,
          scheduleSummaryLines: summary.lines,
          scheduleTotal: summary.total,
        }).catch(() => {});
      }
    }
  }

  return NextResponse.json({ success: true, rescheduled: replacedBookings.length > 0 });
}
