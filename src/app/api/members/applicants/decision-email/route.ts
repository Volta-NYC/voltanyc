import { NextRequest, NextResponse } from "next/server";
import { verifyCaller, dbRead, dbPatch } from "@/lib/server/adminApi";
import { createTransportForFrom, resolveFromWithName } from "@/lib/server/smtp";
import { buildAcceptanceTemplate } from "@/lib/server/applicantEmails";

type Decision = "Accepted";

type DecisionEmailBody = {
  applicantName?: string;
  applicantEmail?: string;
  decision?: Decision;
  notes?: string;
  fromAddress?: string;
  role?: string;
  tracks?: string;
};

function buildMessage(name: string, decision: Decision, notes: string, role?: string, tracks?: string): { subject: string; text: string; html: string } {
  const signupLink = process.env.MEMBER_SIGNUP_LINK || "https://voltanyc.org/members/signup?code=VOLTA-8J3UMP";
  return buildAcceptanceTemplate({
    name,
    role: role ?? "Analyst",
    tracks: tracks ?? "",
    signupLink,
  });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  const verified = await verifyCaller(req, ["admin", "project_lead"]);
  if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: verified.status });

  const body = (await req.json()) as DecisionEmailBody;
  const applicantName = (body.applicantName ?? "").trim();
  const applicantEmail = (body.applicantEmail ?? "").trim().toLowerCase();
  const decision = body.decision;
  const notes = (body.notes ?? "").trim();
  const requestedFrom = (body.fromAddress ?? "").trim().toLowerCase();
  const role = (body.role ?? "").trim();
  const tracks = (body.tracks ?? "").trim();

  if (!applicantName || !applicantEmail || !decision) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (decision !== "Accepted") {
    return NextResponse.json({ success: true, skipped: true, reason: "non_acceptance_no_email" });
  }
  if (!/\S+@\S+\.\S+/.test(applicantEmail)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const allowedFrom = Array.from(
    new Set(
      String(process.env.TEAM_EMAIL_ALLOWED_FROM ?? "info@voltanyc.org,ethan@voltanyc.org")
        .split(",")
        .map((value) => normalizeEmail(value))
        .filter(Boolean)
    )
  );
  const defaultFrom = normalizeEmail(process.env.EMAIL_FROM ?? "");
  const from = requestedFrom || defaultFrom || allowedFrom[0] || "";
  if (!from || !allowedFrom.includes(from)) {
    return NextResponse.json({ error: "from_not_allowed" }, { status: 400 });
  }
  let transporter: ReturnType<typeof createTransportForFrom>["transporter"];
  try {
    transporter = createTransportForFrom(from).transporter;
  } catch {
    return NextResponse.json({ error: "smtp_not_configured" }, { status: 500 });
  }
  const replyTo = process.env.EMAIL_REPLY_TO ?? from;
  const content = buildMessage(applicantName, decision, notes, role, tracks);

  await transporter.sendMail({
    from: resolveFromWithName(from),
    replyTo,
    to: applicantEmail,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });

  // Write Accepted status to Firebase application record
  try {
    const appsData = await dbRead("applications", verified.caller.idToken);
    if (appsData && typeof appsData === "object") {
      const apps = appsData as Record<string, Record<string, unknown>>;
      for (const [appId, row] of Object.entries(apps)) {
        const rowEmail = String(row.email ?? "").trim().toLowerCase();
        if (rowEmail === applicantEmail) {
          await dbPatch(`applications/${appId}`, {
            status: "Accepted",
            statusManualOverride: true,
            updatedAt: new Date().toISOString(),
          }, verified.caller.idToken);
          break;
        }
      }
    }
  } catch {
    // Don't fail the request if Firebase write fails
  }

  return NextResponse.json({ success: true });
}
