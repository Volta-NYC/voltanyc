import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDB } from "@/lib/firebaseAdmin";

function getBearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return "";
  return authHeader.slice("Bearer ".length).trim();
}

function norm(value: string): string {
  return value.trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  const adminAuth = getAdminAuth();
  const db = getAdminDB();
  if (!adminAuth || !db) {
    return NextResponse.json({ error: "admin_not_configured" }, { status: 500 });
  }

  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let uid = "";
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const bodyName = typeof body.name === "string" ? body.name.trim() : "";
  const bodyEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const bodySchool = typeof body.school === "string" ? body.school.trim() : "";
  const bodyGrade = typeof body.grade === "string" ? body.grade.trim() : "";

  const profileSnap = await db.ref(`userProfiles/${uid}`).get();
  const profile = profileSnap.exists() ? (profileSnap.val() as Record<string, unknown>) : {};
  const profileName = typeof profile.name === "string" ? profile.name.trim() : "";
  const profileEmail = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
  const profileSchool = typeof profile.school === "string" ? profile.school.trim() : "";
  const profileGrade = typeof profile.grade === "string" ? profile.grade.trim() : "";

  const name = bodyName || profileName;
  const email = bodyEmail || profileEmail;
  const school = bodySchool || profileSchool;
  const grade = bodyGrade || profileGrade;

  if (!email) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }

  const teamSnap = await db.ref("team").get();
  const team = (teamSnap.exists() ? (teamSnap.val() as Record<string, Record<string, unknown>>) : {}) ?? {};

  let targetId = "";
  const emailKey = norm(email);
  for (const [id, raw] of Object.entries(team)) {
    const memberEmail = typeof raw.email === "string" ? raw.email : "";
    const memberAlt = typeof raw.alternateEmail === "string" ? raw.alternateEmail : "";
    if (norm(memberEmail) === emailKey || norm(memberAlt) === emailKey) {
      targetId = id;
      break;
    }
  }

  const nowIso = new Date().toISOString();
  if (targetId) {
    const patch: Record<string, unknown> = {};
    const target = team[targetId] ?? {};
    if (name && name !== (typeof target.name === "string" ? target.name : "")) patch.name = name;
    if (school && school !== (typeof target.school === "string" ? target.school : "")) patch.school = school;
    if (grade && grade !== (typeof target.grade === "string" ? target.grade : "")) patch.grade = grade;
    if (!target.email) patch.email = email;
    if (Object.keys(patch).length > 0) {
      patch.notes = typeof target.notes === "string" && target.notes ? target.notes : "Synced from website signup";
      await db.ref(`team/${targetId}`).update(patch);
    }
  } else {
    const newRef = db.ref("team").push();
    await newRef.set({
      name: name || email.split("@")[0],
      school,
      grade,
      divisions: [],
      pod: "",
      role: "Member",
      slackHandle: "",
      email,
      alternateEmail: "",
      status: "Active",
      skills: [],
      joinDate: nowIso.split("T")[0],
      notes: "Synced from website signup",
      createdAt: nowIso,
    });
  }

  return NextResponse.json({ success: true });
}
