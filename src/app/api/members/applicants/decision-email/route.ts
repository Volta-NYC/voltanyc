import { NextRequest, NextResponse } from "next/server";
import { verifyCaller } from "@/lib/server/adminApi";
import { createTransportForFrom } from "@/lib/server/smtp";

type Decision = "Accepted" | "Waitlisted" | "Not Accepted";

type DecisionEmailBody = {
  applicantName?: string;
  applicantEmail?: string;
  decision?: Decision;
  notes?: string;
  fromAddress?: string;
};

function buildMessage(name: string, decision: Decision, notes: string): { subject: string; text: string; html: string } {
  const subject = `Volta application update`;
  const cleanNotes = notes.trim();

  const opening =
    decision === "Accepted"
      ? "We're excited to let you know you've been accepted to Volta."
      : decision === "Waitlisted"
      ? "Thank you again for your interest in Volta. We are placing your application on our waitlist for now."
      : "Thank you for your interest in Volta. After review, we are not moving forward with your application at this time.";

  const notesText = cleanNotes ? `\n\nAdditional note:\n${cleanNotes}` : "";
  const notesHtml = cleanNotes ? `<p><strong>Additional note:</strong><br/>${cleanNotes.replace(/\n/g, "<br/>")}</p>` : "";

  return {
    subject,
    text: `Hi ${name},\n\n${opening}${notesText}\n\nBest,\nVolta NYC`,
    html: `<p>Hi ${name},</p><p>${opening}</p>${notesHtml}<p>Best,<br/>Volta NYC</p>`,
  };
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

  if (!applicantName || !applicantEmail || !decision) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
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
  const defaultFrom = normalizeEmail(process.env.INTERVIEW_EMAIL_FROM ?? "");
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
  const replyTo = process.env.INTERVIEW_EMAIL_REPLY_TO ?? from;
  const content = buildMessage(applicantName, decision, notes);

  await transporter.sendMail({
    from,
    replyTo,
    to: applicantEmail,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });

  return NextResponse.json({ success: true });
}
