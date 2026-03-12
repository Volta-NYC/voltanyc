import { NextRequest, NextResponse } from "next/server";
import { verifyCaller, dbPatch, dbRead } from "@/lib/server/adminApi";
import { generateToken } from "@/lib/interviews";
import {
  sendInterviewInviteLinkEmail,
  sendInterviewInviteReminderEmail,
} from "@/lib/server/interviewEmail";

type Mode = "initial" | "reminder";

type RequestBody = {
  mode?: Mode;
  applicationIds?: string[];
  allowAlreadyInvited?: boolean;
};

type ApplicationRow = {
  fullName?: string;
  email?: string;
  status?: string;
  interviewInviteToken?: string;
  interviewInviteSentAt?: string;
};

type InterviewSlotRow = {
  available?: boolean;
  bookedBy?: string;
  bookerName?: string;
  bookerEmail?: string;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeName(value: string): string {
  return normalize(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function canonicalEmail(value: string): string {
  const raw = normalize(value);
  const [local, domain] = raw.split("@");
  if (!local || !domain) return raw;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    const base = local.split("+")[0].replace(/\./g, "");
    return `${base}@gmail.com`;
  }
  return `${local}@${domain}`;
}

function namesLikelyMatch(a: string, b: string): boolean {
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

function hasBookedSlotForApplicant(
  app: ApplicationRow,
  slotsMap: Record<string, InterviewSlotRow>,
): boolean {
  const email = normalize(app.email ?? "");
  const canonical = canonicalEmail(email);
  const name = app.fullName ?? "";
  const inviteToken = normalize(app.interviewInviteToken ?? "");
  return Object.values(slotsMap).some((slot) => {
    if (slot.available) return false;
    const slotEmail = normalize(slot.bookerEmail ?? "");
    const slotCanonical = canonicalEmail(slotEmail);
    const slotName = slot.bookerName ?? "";
    const bookedBy = normalize(slot.bookedBy ?? "");
    if (inviteToken && bookedBy && inviteToken === bookedBy) return true;
    if (email && slotEmail && (email === slotEmail || canonical === slotCanonical)) return true;
    if (name && slotName && namesLikelyMatch(name, slotName)) return true;
    return false;
  });
}

export async function POST(req: NextRequest) {
  const verified = await verifyCaller(req, ["admin", "project_lead"]);
  if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: verified.status });

  const body = (await req.json()) as RequestBody;
  const mode = body.mode ?? "initial";
  const allowAlreadyInvited = !!body.allowAlreadyInvited;
  const applicationIds = Array.isArray(body.applicationIds) ? body.applicationIds.filter(Boolean) : [];
  if (applicationIds.length === 0) {
    return NextResponse.json({ error: "missing_application_ids" }, { status: 400 });
  }
  if (mode !== "initial" && mode !== "reminder") {
    return NextResponse.json({ error: "invalid_mode" }, { status: 400 });
  }

  const [applicationsData, invitesData, slotsData] = await Promise.all([
    dbRead("applications", verified.caller.idToken),
    dbRead("interviewInvites", verified.caller.idToken),
    dbRead("interviewSlots", verified.caller.idToken),
  ]);
  const appsMap = (applicationsData ?? {}) as Record<string, ApplicationRow>;
  const inviteMap = (invitesData ?? {}) as Record<string, Record<string, unknown>>;
  const slotsMap = (slotsData ?? {}) as Record<string, InterviewSlotRow>;

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];
  const nowIso = new Date().toISOString();
  const expiresAt = Date.now() + 120 * 24 * 60 * 60 * 1000;

  for (const appId of applicationIds) {
    const row = appsMap[appId];
    if (!row) {
      skipped += 1;
      continue;
    }
    const email = normalize(row.email ?? "");
    const fullName = (row.fullName ?? "").trim();
    if (!email || !fullName) {
      skipped += 1;
      continue;
    }

    let token = (row.interviewInviteToken ?? "").trim();
    if (!token) token = generateToken(16);

    const alreadyInvited = !!String(row.interviewInviteSentAt ?? "").trim();
    const alreadyBooked = hasBookedSlotForApplicant(row, slotsMap);
    if (alreadyBooked) {
      skipped += 1;
      continue;
    }
    if (mode === "initial" && alreadyInvited && !allowAlreadyInvited) {
      skipped += 1;
      continue;
    }

    if (mode === "reminder" && alreadyBooked) {
      skipped += 1;
      continue;
    }

    try {
      if (!inviteMap[token]) {
        await dbPatch(`interviewInvites/${token}`, {
          applicantName: fullName,
          applicantEmail: email,
          role: "applicant",
          expiresAt,
          status: "pending",
          createdBy: verified.caller.uid,
          createdAt: Date.now(),
          multiUse: false,
          note: "Generated from applicants pipeline",
        }, verified.caller.idToken);
      }

      if (mode === "reminder") {
        await sendInterviewInviteReminderEmail({
          to: email,
          applicantName: fullName,
          bookingToken: token,
          fallbackOrigin: req.nextUrl.origin,
        });
      } else {
        await sendInterviewInviteLinkEmail({
          to: email,
          applicantName: fullName,
          bookingToken: token,
          fallbackOrigin: req.nextUrl.origin,
        });
      }

      const nextStatus = normalize(row.status ?? "");
      const patch: Record<string, unknown> = {
        interviewInviteToken: token,
        updatedAt: nowIso,
      };
      if (mode === "reminder") patch.interviewReminderSentAt = nowIso;
      else patch.interviewInviteSentAt = nowIso;
      if (!nextStatus || nextStatus === "new" || nextStatus === "reviewing") {
        patch.status = "Interview Pending";
      }
      await dbPatch(`applications/${appId}`, patch, verified.caller.idToken);
      sent += 1;
    } catch {
      errors.push(appId);
    }
  }

  return NextResponse.json({
    success: true,
    mode,
    sent,
    skipped,
    failed: errors.length,
    failedIds: errors,
  });
}
