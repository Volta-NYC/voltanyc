import { NextRequest, NextResponse } from "next/server";
import { dbPatch, dbPush, dbRead, verifyCaller } from "@/lib/server/adminApi";
import { createTransportForFrom, resolveFromWithName } from "@/lib/server/smtp";
import { getAdminDB } from "@/lib/firebaseAdmin";
import { buildAcceptanceTemplate } from "@/lib/server/applicantEmails";

type FinalizeBody = {
  slotIds?: string[];
  teamRole?: string;
  sendAcceptanceEmail?: boolean;
  fromAddress?: string;
  notes?: string;
};

type SlotRecord = Record<string, unknown>;

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeName(value: unknown): string {
  return normalize(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function canonicalEmail(value: unknown): string {
  const raw = normalize(value);
  const [local, domain] = raw.split("@");
  if (!local || !domain) return raw;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${local.split("+")[0].replace(/\./g, "")}@gmail.com`;
  }
  return `${local}@${domain}`;
}

function namesLikelyMatch(a: unknown, b: unknown): boolean {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const lt = new Set(left.split(" ").filter(Boolean));
  const rt = new Set(right.split(" ").filter(Boolean));
  let overlap = 0;
  lt.forEach((token) => {
    if (rt.has(token)) overlap += 1;
  });
  return overlap >= 2;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function sendAcceptanceEmail(input: {
  fromAddress?: string;
  to: string;
  applicantName: string;
  notes?: string;
  role: string;
  tracks?: string;
}) {
  const allowedFrom = Array.from(
    new Set(
      String(process.env.TEAM_EMAIL_ALLOWED_FROM ?? "info@voltanyc.org,ethan@voltanyc.org")
        .split(",")
        .map((value) => normalizeEmail(value))
        .filter(Boolean)
    )
  );
  const defaultFrom = normalizeEmail(process.env.EMAIL_FROM ?? "");
  const from = normalizeEmail(input.fromAddress ?? "") || defaultFrom || allowedFrom[0] || "";
  if (!from || !allowedFrom.includes(from)) return;
  const transporter = createTransportForFrom(from).transporter;
  const replyTo = process.env.EMAIL_REPLY_TO ?? from;
  const signupLink = process.env.MEMBER_SIGNUP_LINK || "https://voltanyc.org/members/signup?code=VOLTA-8J3UMP";
  const tpl = buildAcceptanceTemplate({
    name: input.applicantName,
    role: input.role,
    tracks: input.tracks ?? "",
    signupLink,
  });
  await transporter.sendMail({
    from: resolveFromWithName(from),
    replyTo,
    to: input.to,
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
  });
}

async function upsertTeamMember(params: {
  idToken: string;
  fullName: string;
  email: string;
  schoolName?: string;
  grade?: string;
  role: string;
}) {
  const teamData = await dbRead("team", params.idToken);
  const team = (teamData ?? {}) as Record<string, Record<string, unknown>>;
  const emailKey = normalize(params.email);
  const nameKey = normalize(params.fullName);
  let targetId = "";

  for (const [id, row] of Object.entries(team)) {
    const primary = normalize(row.email);
    const secondary = normalize(row.alternateEmail);
    if (emailKey && (primary === emailKey || secondary === emailKey)) {
      targetId = id;
      break;
    }
  }
  if (!targetId) {
    for (const [id, row] of Object.entries(team)) {
      if (normalize(row.name) === nameKey) {
        targetId = id;
        break;
      }
    }
  }

  const nowIso = new Date().toISOString();
  if (targetId) {
    const row = team[targetId] ?? {};
    const patch: Record<string, unknown> = {
      updatedAt: nowIso,
    };
    if (!String(row.name ?? "").trim()) patch.name = params.fullName;
    if (!String(row.email ?? "").trim()) patch.email = emailKey;
    else if (normalize(row.email) !== emailKey && !String(row.alternateEmail ?? "").trim()) patch.alternateEmail = emailKey;
    if (!String(row.school ?? "").trim() && params.schoolName) patch.school = params.schoolName;
    if (!String(row.grade ?? "").trim() && params.grade) patch.grade = params.grade;
    if (!String(row.acceptedDate ?? "").trim()) patch.acceptedDate = nowIso.slice(0, 10);
    patch.role = params.role;
    await dbPatch(`team/${targetId}`, patch, params.idToken);
    return targetId;
  }

  const adminDb = getAdminDB();
  if (!adminDb) {
    await dbPush("team", {
      name: params.fullName,
      school: params.schoolName ?? "",
      grade: params.grade ?? "",
      divisions: [],
      pod: "",
      role: params.role,
      slackHandle: "",
      email: emailKey,
      alternateEmail: "",
      status: "Active",
      skills: [],
      joinDate: nowIso.slice(0, 10),
      acceptedDate: nowIso.slice(0, 10),
      notes: "Synced from interviewed applicant",
      createdAt: nowIso,
      updatedAt: nowIso,
    }, params.idToken);
    return "";
  }
  const newRef = adminDb.ref("team").push();
  await newRef.set({
    name: params.fullName,
    school: params.schoolName ?? "",
    grade: params.grade ?? "",
    divisions: [],
    pod: "",
    role: params.role,
    slackHandle: "",
    email: emailKey,
    alternateEmail: "",
    status: "Active",
    skills: [],
    joinDate: nowIso.slice(0, 10),
    acceptedDate: nowIso.slice(0, 10),
    notes: "Synced from interviewed applicant",
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  return newRef.key ?? "";
}

export async function POST(req: NextRequest) {
  const verified = await verifyCaller(req, ["admin", "project_lead"]);
  if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: verified.status });

  const body = (await req.json().catch(() => ({}))) as FinalizeBody;
  const slotIds = Array.isArray(body.slotIds) ? body.slotIds.map((id) => String(id ?? "").trim()).filter(Boolean) : [];
  if (slotIds.length === 0) return NextResponse.json({ error: "missing_slot_ids" }, { status: 400 });

  const teamRole = (body.teamRole ?? "").trim() || "Member";
  const sendEmail = !!body.sendAcceptanceEmail;
  const notes = (body.notes ?? "").trim();

  const [slotsData, applicationsData] = await Promise.all([
    dbRead("interviewSlots", verified.caller.idToken),
    dbRead("applications", verified.caller.idToken),
  ]);
  const slots = (slotsData ?? {}) as Record<string, SlotRecord>;
  const applications = (applicationsData ?? {}) as Record<string, Record<string, unknown>>;

  const appEntries = Object.entries(applications).map(([id, row]) => ({ id, row: row ?? {} }));
  const done: string[] = [];
  const failed: string[] = [];

  for (const slotId of slotIds) {
    const slot = slots[slotId];
    if (!slot || !slot.bookedBy || !slot.bookerEmail) {
      failed.push(slotId);
      continue;
    }
    const slotEmail = normalize(slot.bookerEmail);
    const slotCanonical = canonicalEmail(slot.bookerEmail);
    const slotName = slot.bookerName;
    const slotToken = normalize(slot.bookedBy);

    let target = appEntries.find(({ row }) => normalize(row.interviewSlotId) === normalize(slotId)) ?? null;
    if (!target && slotToken && slotToken !== "public-booking") {
      target = appEntries.find(({ row }) => normalize(row.interviewInviteToken) === slotToken) ?? null;
    }
    if (!target) {
      target = appEntries.find(({ row }) => {
        const em = normalize(row.email);
        return em && (em === slotEmail || canonicalEmail(row.email) === slotCanonical);
      }) ?? null;
    }
    if (!target) {
      target = appEntries.find(({ row }) => namesLikelyMatch(row.fullName, slotName)) ?? null;
    }

    let appId = "";
    let fullName = String(slot.bookerName ?? "").trim() || "Applicant";
    let email = String(slot.bookerEmail ?? "").trim().toLowerCase();
    let schoolName = "";
    let grade = "";
    let tracks = "";
    if (target) {
      appId = target.id;
      fullName = String(target.row.fullName ?? "").trim() || fullName;
      email = String(target.row.email ?? "").trim().toLowerCase() || email;
      schoolName = String(target.row.schoolName ?? "").trim();
      grade = String(target.row.grade ?? "").trim();
      tracks = String(target.row.tracksSelected ?? "").trim();
    } else {
      const createdAt = new Date().toISOString();
      const adminDb = getAdminDB();
      if (!adminDb) {
        failed.push(slotId);
        continue;
      }
      const newRef = adminDb.ref("applications").push();
      await newRef.set({
        fullName,
        email,
        schoolName: "",
        grade: "",
        cityState: "",
        referral: "",
        tracksSelected: "",
        hasResume: "",
        resumeUrl: "",
        toolsSoftware: "",
        accomplishment: "",
        status: "Interview Scheduled",
        notes: "",
        interviewSlotId: slotId,
        interviewScheduledAt: String(slot.datetime ?? ""),
        source: "manual",
        createdAt,
        updatedAt: createdAt,
      });
      appId = newRef.key ?? "";
    }

    if (!appId || !email) {
      failed.push(slotId);
      continue;
    }

    await dbPatch(`applications/${appId}`, {
      status: "Accepted",
      finalDecisionRole: teamRole,
      interviewSlotId: slotId,
      interviewScheduledAt: String(slot.datetime ?? ""),
      notes: notes || String(target?.row.notes ?? ""),
      updatedAt: new Date().toISOString(),
    }, verified.caller.idToken);

    await upsertTeamMember({
      idToken: verified.caller.idToken,
      fullName,
      email,
      schoolName,
      grade,
      role: teamRole,
    });

    if (sendEmail) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await sendAcceptanceEmail({
          fromAddress: body.fromAddress,
          to: email,
          applicantName: fullName,
          notes,
          role: teamRole,
          tracks,
        });
      } catch {
        // continue pipeline even if email fails
      }
    }
    done.push(slotId);
  }

  return NextResponse.json({ success: true, finalized: done.length, failed, finalizedSlotIds: done });
}
