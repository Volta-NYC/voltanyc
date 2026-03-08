import { NextRequest, NextResponse } from "next/server";
import { dbPatch, dbPush, dbRead, verifyCaller } from "@/lib/server/adminApi";
import { resolveInterviewZoomSettings } from "@/lib/interviews/config";
import { sendInterviewRescheduledEmail } from "@/lib/server/interviewEmail";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type SlotRecord = Record<string, unknown>;

function normalizeId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

  const [fromData, toData, settingsData] = await Promise.all([
    dbRead(`interviewSlots/${fromSlotId}`, verified.caller.idToken),
    dbRead(`interviewSlots/${toSlotId}`, verified.caller.idToken),
    dbRead("interviewSettings", verified.caller.idToken).catch(() => null),
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

  const toStartsAt = new Date(toDatetime).getTime();
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
    }).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
