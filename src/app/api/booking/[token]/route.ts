// Public API route — no authentication required.
// Handles interview invite lookup and slot booking for the /book/[token] page.
//
// Data access priority:
//   1. Firebase Admin SDK (if FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY are set in Vercel)
//   2. Firebase REST API (requires Firebase rules to allow public reads — see CLAUDE.md)
//
// Zoom link source:
//   interviewSettings/zoomLink   → custom admin-managed link in Realtime DB
//   interviewSettings/zoomEnabled -> toggle showing Zoom link to applicants
//   INTERVIEW_ZOOM_LINK          → fallback default when custom link is not set

import { NextRequest, NextResponse } from "next/server";
import { getAdminDB } from "@/lib/firebaseAdmin";
import { resolveInterviewZoomSettings } from "@/lib/interviews/config";
import { pickIcsOrganizer, resolveInterviewerContacts } from "@/lib/server/interviewerResolver";
import {
  sendInterviewerBookingNotificationEmail,
  sendInterviewerRescheduledNotificationEmail,
  sendInterviewBookingEmail,
  sendInterviewRescheduledEmail,
} from "@/lib/server/interviewEmail";

type Params = { params: { token: string } };
export const runtime = "nodejs";

// ── DB helpers — Admin SDK preferred, REST API fallback ───────────────────────

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

const THREE_WEEKS_MS = 21 * 24 * 60 * 60 * 1000;

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
  const date = new Date(datetimeIso);
  if (Number.isNaN(date.getTime())) return datetimeIso;
  const datePart = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
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
      const startsAt = new Date(String(row.datetime ?? "")).getTime();
      if (Number.isNaN(startsAt) || startsAt < nowMs || startsAt > windowEnd) return false;
      const ids = getInterviewerMemberIds(row);
      return ids.includes(interviewerMemberId);
    })
    .sort((a, b) => new Date(String(a.datetime ?? "")).getTime() - new Date(String(b.datetime ?? "")).getTime());

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

// ── GET /api/booking/[token] ──────────────────────────────────────────────────
// Returns { invite, slots, zoomLink } for a valid, unexpired booking token.

export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = params;

  let inviteData: unknown;
  try {
    inviteData = await dbGet(`interviewInvites/${token}`);
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (!inviteData) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  type RawInvite = Record<string, unknown> & { id: string };
  const invite: RawInvite = { ...(inviteData as Record<string, unknown>), id: token };

  if (invite["status"] === "cancelled" || invite["status"] === "expired") {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  if (Date.now() > (invite["expiresAt"] as number)) {
    await dbPatch(`interviewInvites/${token}`, { status: "expired" })
      .then(() => writeAuditLog({
        action: "update",
        collection: "interviewInvites",
        recordId: token,
        actorUid: "system",
        actorEmail: "system",
        details: { status: "expired", reason: "invite_expired_on_read" },
      }))
      .catch(() => {});
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  if (!invite["multiUse"] && invite["status"] === "booked") {
    return NextResponse.json({ error: "already_booked", invite }, { status: 409 });
  }

  let slotsData: unknown;
  try {
    slotsData = await dbGet("interviewSlots");
  } catch {
    slotsData = null;
  }

  const now = Date.now();
  type RawSlot = Record<string, unknown> & { id: string };
  const slots: RawSlot[] = slotsData
    ? (Object.entries(slotsData as Record<string, Record<string, unknown>>)
        .map(([id, data]): RawSlot => ({ ...data, id }))
        .filter((s) => s["available"] && !s["bookedBy"] && hasInterviewerMembers(s) && new Date(s["datetime"] as string).getTime() > now)
        .sort((a, b) => new Date(a["datetime"] as string).getTime() - new Date(b["datetime"] as string).getTime()))
    : [];

  let settingsData: unknown = null;
  try {
    settingsData = await dbGet("interviewSettings");
  } catch {
    settingsData = null;
  }
  const zoom = resolveInterviewZoomSettings(settingsData, process.env.INTERVIEW_ZOOM_LINK ?? "");

  return NextResponse.json({
    invite,
    slots,
    zoomLink: zoom.zoomLink,
  });
}

// ── POST /api/booking/[token] ─────────────────────────────────────────────────
// Books a slot. Body: { slotId, bookerName, bookerEmail }

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = params;

  const { slotId, bookerName, bookerEmail } = await req.json() as {
    slotId: string;
    bookerName: string;
    bookerEmail: string;
  };

  if (!slotId) {
    return NextResponse.json({ error: "missing_slot" }, { status: 400 });
  }

  let inviteData: unknown;
  try {
    inviteData = await dbGet(`interviewInvites/${token}`);
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (!inviteData) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const invite = inviteData as { multiUse?: boolean };
  let slotData: unknown;
  try {
    slotData = await dbGet(`interviewSlots/${slotId}`);
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  if (!slotData) {
    return NextResponse.json({ error: "slot_not_found" }, { status: 404 });
  }
  const slot = slotData as Record<string, unknown>;
  const startsAt = new Date((slot.datetime as string) ?? "").getTime();
  if (!slot.available || slot.bookedBy || !hasInterviewerMembers(slot) || Number.isNaN(startsAt) || startsAt <= Date.now()) {
    return NextResponse.json({ error: "slot_unavailable" }, { status: 409 });
  }

  try {
    await dbPatch(`interviewSlots/${slotId}`, {
      available:   false,
      bookedBy:    token,
      bookerName:  bookerName || "",
      bookerEmail: bookerEmail || "",
      reminderSentAt: "",
    });
    await writeAuditLog({
      action: "update",
      collection: "interviewSlots",
      recordId: slotId,
      actorUid: `public:${token}`,
      actorEmail: (bookerEmail || "").trim().toLowerCase() || "public",
      actorName: bookerName || "",
      details: { bookedBy: token, available: false },
    }).catch(() => {});

    if (!invite.multiUse) {
      await dbPatch(`interviewInvites/${token}`, {
        status:       "booked",
        bookedSlotId: slotId,
      });
      await writeAuditLog({
        action: "update",
        collection: "interviewInvites",
        recordId: token,
        actorUid: `public:${token}`,
        actorEmail: (bookerEmail || "").trim().toLowerCase() || "public",
        actorName: bookerName || "",
        details: { status: "booked", bookedSlotId: slotId },
      }).catch(() => {});
    }
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const cleanName = (bookerName || "").trim();
  const cleanEmail = (bookerEmail || "").trim();
  let replacedBookings: ExistingBooking[] = [];
  try {
    replacedBookings = await findExistingBookingsByEmail(cleanEmail, slotId);
    for (const existing of replacedBookings) {
      await clearExistingBooking(existing.id);
      await writeAuditLog({
        action: "update",
        collection: "interviewSlots",
        recordId: existing.id,
        actorUid: `public:${token}`,
        actorEmail: cleanEmail.toLowerCase() || "public",
        actorName: cleanName || "",
        details: { rescheduledTo: slotId, available: true, bookedBy: "" },
      }).catch(() => {});
    }
  } catch {
    // Do not fail the booking if cleanup fails.
  }

  const durationMinutes = Number(slot.durationMinutes ?? 30);
  const datetimeIso = typeof slot.datetime === "string" ? slot.datetime : "";
  const location = typeof slot.location === "string" ? slot.location : "";
  if (cleanEmail && datetimeIso) {
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
    const organizer = pickIcsOrganizer(interviewerContacts, process.env.INTERVIEW_EMAIL_FROM ?? "");
    const payload = {
      to: cleanEmail,
      bookerName: cleanName,
      slotId,
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
          slotId,
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
          slotId,
          scheduleSummaryLines: summary.lines,
          scheduleTotal: summary.total,
        }).catch(() => {});
      }
    }
  }

  return NextResponse.json({ success: true, rescheduled: replacedBookings.length > 0 });
}
