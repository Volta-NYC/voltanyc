import { NextRequest, NextResponse } from "next/server";
import { verifyCaller } from "@/lib/server/adminApi";
import { createTransportForFrom, resolveFromWithName } from "@/lib/server/smtp";

type SendBody = {
  fromAddress?: string;
  subject?: string;
  message?: string;
  contentMode?: "plain" | "html";
  recipients?: string[];
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /\S+@\S+\.\S+/.test(email);
}

function stripHtml(input: string): string {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: NextRequest) {
  const verified = await verifyCaller(req, ["admin", "project_lead"]);
  if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: verified.status });

  const body = (await req.json()) as SendBody;
  const requestedFrom = normalizeEmail(String(body.fromAddress ?? ""));
  const subject = (body.subject ?? "").trim();
  const message = (body.message ?? "").trim();
  const contentMode: "plain" | "html" = body.contentMode === "html" ? "html" : "plain";
  const incoming = Array.isArray(body.recipients) ? body.recipients : [];

  if (!subject || !message) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const deduped = Array.from(
    new Set(
      incoming
        .map((email) => normalizeEmail(String(email ?? "")))
        .filter((email) => email && isValidEmail(email))
    )
  );

  if (deduped.length === 0) {
    return NextResponse.json({ error: "no_recipients" }, { status: 400 });
  }
  if (deduped.length > 400) {
    return NextResponse.json({ error: "too_many_recipients" }, { status: 400 });
  }

  const allowedFrom = Array.from(
    new Set(
      String(process.env.TEAM_EMAIL_ALLOWED_FROM ?? "info@voltanyc.org,ethan@voltanyc.org")
        .split(",")
        .map((value) => normalizeEmail(value))
        .filter((value) => value && isValidEmail(value))
    )
  );
  const defaultFrom = normalizeEmail(process.env.EMAIL_FROM ?? "");
  const selectedFrom = requestedFrom || defaultFrom || allowedFrom[0] || "";
  if (!allowedFrom.includes(selectedFrom)) {
    return NextResponse.json({ error: "from_not_allowed" }, { status: 400 });
  }

  let transporter: ReturnType<typeof createTransportForFrom>["transporter"];
  try {
    transporter = createTransportForFrom(selectedFrom).transporter;
  } catch {
    return NextResponse.json({ error: "smtp_not_configured" }, { status: 500 });
  }

  const from = resolveFromWithName(selectedFrom);
  const replyTo = selectedFrom;
  const textBody = contentMode === "html"
    ? stripHtml(message)
    : message;
  const htmlBody = contentMode === "html"
    ? message
    : message.replace(/\n/g, "<br/>");

  const failed: string[] = [];
  for (const recipient of deduped) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await transporter.sendMail({
        from,
        replyTo,
        to: recipient,
        subject,
        text: textBody,
        html: htmlBody,
      });
    } catch {
      failed.push(recipient);
    }
  }

  return NextResponse.json({
    success: true,
    sent: deduped.length - failed.length,
    failed,
  });
}
