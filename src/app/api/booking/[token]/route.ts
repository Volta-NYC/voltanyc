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

type Params = { params: { token: string } };

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
        .filter((s) => s["available"] && !s["bookedBy"] && new Date(s["datetime"] as string).getTime() > now)
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

  try {
    await dbPatch(`interviewSlots/${slotId}`, {
      available:   false,
      bookedBy:    token,
      bookerName:  bookerName || "",
      bookerEmail: bookerEmail || "",
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

  return NextResponse.json({ success: true });
}
