import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDB } from "@/lib/firebaseAdmin";
import { resolveInterviewZoomSettings } from "@/lib/interviews/config";

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

function getBearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return "";
  return authHeader.slice("Bearer ".length).trim();
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
  const db = getAdminDB();
  if (db) {
    await db.ref("auditLogs").push({
      timestamp: new Date().toISOString(),
      ...entry,
    });
    return;
  }
  if (!DB_URL) return;
  await fetch(`${DB_URL}/auditLogs.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry,
    }),
    cache: "no-store",
  }).catch(() => {});
}

function parseSettingsPayload(raw: unknown): {
  zoomLink: string;
  zoomEnabled: boolean;
  updatedAt: number;
  updatedBy: string;
} {
  const data = (raw && typeof raw === "object") ? (raw as Record<string, unknown>) : {};
  const zoomLink = typeof data.zoomLink === "string" ? data.zoomLink.trim() : "";
  return {
    zoomLink,
    zoomEnabled: true,
    updatedAt: Date.now(),
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy.trim() : "",
  };
}

export async function GET() {
  let settingsData: unknown = null;
  try {
    settingsData = await dbGet("interviewSettings");
  } catch {
    settingsData = null;
  }

  const effective = resolveInterviewZoomSettings(settingsData, process.env.INTERVIEW_ZOOM_LINK ?? "");
  const settings = (settingsData && typeof settingsData === "object") ? (settingsData as Record<string, unknown>) : {};
  const customZoomLink = typeof settings.zoomLink === "string" ? settings.zoomLink.trim() : "";

  return NextResponse.json({
    zoomLink: effective.zoomLink,
    zoomEnabled: effective.zoomEnabled,
    source: effective.source,
    customZoomLink,
  });
}

export async function POST(req: NextRequest) {
  const adminAuth = getAdminAuth();
  const db = getAdminDB();
  if (!adminAuth || !db) {
    return NextResponse.json({ error: "admin_not_configured" }, { status: 500 });
  }

  const idToken = getBearerToken(req);
  if (!idToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let callerUid = "";
  let callerEmail = "";
  let callerName = "";
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    callerUid = decoded.uid;
    callerEmail = decoded.email ?? "";
    callerName = decoded.name ?? "";

    const callerRoleSnap = await db.ref(`userProfiles/${callerUid}/authRole`).get();
    const callerRole = callerRoleSnap.exists() ? String(callerRoleSnap.val()) : "";
    if (callerRole !== "admin" && callerRole !== "project_lead") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const payload = parseSettingsPayload(body);
  payload.updatedBy = callerUid;

  try {
    await db.ref("interviewSettings").update(payload);
    await writeAuditLog({
      action: "update",
      collection: "interviewSettings",
      recordId: "singleton",
      actorUid: callerUid,
      actorEmail: callerEmail || "unknown",
      actorName: callerName || "",
      details: { fields: Object.keys(payload) },
    });
  } catch {
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  let settingsData: unknown = null;
  try {
    const snap = await db.ref("interviewSettings").get();
    settingsData = snap.exists() ? snap.val() : null;
  } catch {
    settingsData = payload;
  }

  const effective = resolveInterviewZoomSettings(settingsData, process.env.INTERVIEW_ZOOM_LINK ?? "");
  const settings = (settingsData && typeof settingsData === "object") ? (settingsData as Record<string, unknown>) : {};
  const customZoomLink = typeof settings.zoomLink === "string" ? settings.zoomLink.trim() : "";

  return NextResponse.json({
    success: true,
    zoomLink: effective.zoomLink,
    zoomEnabled: effective.zoomEnabled,
    source: effective.source,
    customZoomLink,
  });
}
