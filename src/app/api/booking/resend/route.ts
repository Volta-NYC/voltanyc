import { NextRequest, NextResponse } from "next/server";
import { dbRead, verifyCaller } from "@/lib/server/adminApi";
import { resolveInterviewZoomSettings } from "@/lib/interviews/config";
import { pickIcsOrganizer, resolveInterviewerContacts } from "@/lib/server/interviewerResolver";
import { sendInterviewBookingEmail } from "@/lib/server/interviewEmail";

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
  const slotId = normalizeId((body as Record<string, unknown>).slotId);
  if (!slotId) {
    return NextResponse.json({ error: "missing_slot" }, { status: 400 });
  }

  const [slotData, settingsData, teamData] = await Promise.all([
    dbRead(`interviewSlots/${slotId}`, verified.caller.idToken),
    dbRead("interviewSettings", verified.caller.idToken).catch(() => null),
    dbRead("team", verified.caller.idToken).catch(() => null),
  ]);

  if (!slotData) {
    return NextResponse.json({ error: "slot_not_found" }, { status: 404 });
  }

  const slot = slotData as SlotRecord;
  const bookerEmail = String(slot.bookerEmail ?? "").trim();
  const bookerName = String(slot.bookerName ?? "").trim();
  const datetimeIso = String(slot.datetime ?? "").trim();
  if (!slot.bookedBy || !bookerEmail || !datetimeIso) {
    return NextResponse.json({ error: "slot_not_booked" }, { status: 409 });
  }

  const durationMinutes = Number(slot.durationMinutes ?? 30);
  const location = typeof slot.location === "string" ? slot.location : "";
  const zoom = resolveInterviewZoomSettings(settingsData, process.env.INTERVIEW_ZOOM_LINK ?? "");
  const interviewerContacts = resolveInterviewerContacts(slot, teamData);
  const organizer = pickIcsOrganizer(interviewerContacts, process.env.INTERVIEW_EMAIL_FROM ?? "");

  await sendInterviewBookingEmail({
    to: bookerEmail,
    bookerName,
    slotId,
    datetimeIso,
    durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 30,
    zoomLink: zoom.zoomLink,
    location,
    organizerName: organizer.name,
    organizerEmail: organizer.email,
  }).catch(() => {
    throw new Error("email_send_failed");
  });

  return NextResponse.json({ success: true });
}
