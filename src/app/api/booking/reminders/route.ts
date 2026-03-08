import { NextRequest, NextResponse } from "next/server";
import { getAdminDB } from "@/lib/firebaseAdmin";
import { resolveInterviewZoomSettings } from "@/lib/interviews/config";
import { sendInterviewReminderEmail } from "@/lib/server/interviewEmail";

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
  const data = (await res.json()) as unknown;
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

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const windowStart = now + 25 * 60 * 1000;
  const windowEnd = now + 35 * 60 * 1000;
  const reminderStartedAt = new Date().toISOString();

  let slotsData: unknown = null;
  let settingsData: unknown = null;
  try {
    [slotsData, settingsData] = await Promise.all([
      dbGet("interviewSlots"),
      dbGet("interviewSettings"),
    ]);
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const zoom = resolveInterviewZoomSettings(settingsData, process.env.INTERVIEW_ZOOM_LINK ?? "");
  const slots = Object.entries((slotsData ?? {}) as Record<string, Record<string, unknown>>)
    .map(([id, slot]) => ({ id, slot }));

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const { id, slot } of slots) {
    const startsAt = new Date((slot.datetime as string) ?? "").getTime();
    const isBooked = !slot.available && !!slot.bookerEmail;
    const alreadySent = typeof slot.reminderSentAt === "string" && !!slot.reminderSentAt;
    if (!isBooked || alreadySent || Number.isNaN(startsAt) || startsAt < windowStart || startsAt > windowEnd) {
      skipped += 1;
      continue;
    }

    const to = String(slot.bookerEmail ?? "").trim();
    if (!to) {
      skipped += 1;
      continue;
    }

    const durationMinutes = Number(slot.durationMinutes ?? 30);
    const datetimeIso = typeof slot.datetime === "string" ? slot.datetime : "";
    const location = typeof slot.location === "string" ? slot.location : "";
    const bookerName = String(slot.bookerName ?? "").trim();

    try {
      await sendInterviewReminderEmail({
        to,
        bookerName,
        slotId: id,
        datetimeIso,
        durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 30,
        zoomLink: zoom.zoomLink,
        location,
      });
      await dbPatch(`interviewSlots/${id}`, {
        reminderSentAt: reminderStartedAt,
      });
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    skipped,
    checked: slots.length,
    runAt: reminderStartedAt,
  });
}
