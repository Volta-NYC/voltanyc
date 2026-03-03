import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDB } from "@/lib/firebaseAdmin";

type Params = { params: { uid: string } };

function getBearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return "";
  return authHeader.slice("Bearer ".length).trim();
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const targetUid = params.uid?.trim();
  if (!targetUid) {
    return NextResponse.json({ error: "missing_uid" }, { status: 400 });
  }

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
    if (callerRole !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (targetUid === callerUid) {
    return NextResponse.json({ error: "cannot_delete_self" }, { status: 400 });
  }

  const targetProfileSnap = await db.ref(`userProfiles/${targetUid}`).get();
  const targetProfile = targetProfileSnap.exists() ? (targetProfileSnap.val() as Record<string, unknown>) : null;
  const targetEmail = typeof targetProfile?.email === "string" ? targetProfile.email : "";

  let removedAuthUser = true;
  try {
    await adminAuth.deleteUser(targetUid);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? "";
    if (code === "auth/user-not-found") {
      removedAuthUser = false;
    } else {
      return NextResponse.json({ error: "delete_failed" }, { status: 500 });
    }
  }

  // Remove user profile record.
  await db.ref(`userProfiles/${targetUid}`).remove();

  await db.ref("auditLogs").push({
    timestamp: new Date().toISOString(),
    action: "delete",
    collection: "authUsers",
    recordId: targetUid,
    actorUid: callerUid,
    actorEmail: callerEmail || "unknown",
    actorName: callerName || "",
    details: {
      targetEmail,
      source: "api.members.admin.users.delete",
      removedUserProfile: true,
      removedAuthUser,
    },
  });

  return NextResponse.json({ success: true });
}
