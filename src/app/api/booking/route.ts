import { NextRequest, NextResponse } from "next/server";
import { getAdminDB } from "@/lib/firebaseAdmin";
import { resolveInterviewZoomSettings } from "@/lib/interviews/config";
import { sendInterviewBookingEmail, sendInterviewRescheduledEmail } from "@/lib/server/interviewEmail";

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
      const startsAt = new Date(String(slot.datetime ?? "")).getTime();
      return !!slot.bookedBy && !slot.available && slotEmail === target && startsAt > now;
    })
    .map(({ id, slot }) => ({
      id,
      datetime: String(slot.datetime ?? ""),
    }))
    .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
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
      .filter((s) => !!s["available"] && !s["bookedBy"] && new Date(s["datetime"] as string).getTime() > now)
      .sort((a, b) => new Date(a["datetime"] as string).getTime() - new Date(b["datetime"] as string).getTime())
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
  const startsAt = new Date((slot.datetime as string) ?? "").getTime();

  if (!isAvailable || alreadyBooked || Number.isNaN(startsAt) || startsAt <= Date.now()) {
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
  if (datetimeIso) {
    let settingsData: unknown = null;
    try {
      settingsData = await dbGet("interviewSettings");
    } catch {
      settingsData = null;
    }
    const zoom = resolveInterviewZoomSettings(settingsData, process.env.INTERVIEW_ZOOM_LINK ?? "");
    const payload = {
      to: cleanEmail,
      bookerName: cleanName,
      slotId: cleanSlotId,
      datetimeIso,
      durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 30,
      zoomLink: zoom.zoomLink,
      location,
    };
    if (replacedBookings.length > 0 && replacedBookings[0]?.datetime) {
      await sendInterviewRescheduledEmail({
        ...payload,
        previousDatetimeIso: replacedBookings[0].datetime,
      }).catch(() => {});
    } else {
      await sendInterviewBookingEmail(payload).catch(() => {});
    }
  }

  return NextResponse.json({ success: true, rescheduled: replacedBookings.length > 0 });
}
