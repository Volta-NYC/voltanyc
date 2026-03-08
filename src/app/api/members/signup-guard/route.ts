import { NextResponse } from "next/server";
import { consumeRateLimit, getClientIp } from "@/lib/server/rateLimit";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const ip = getClientIp(req.headers);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  const ipCheck = await consumeRateLimit({
    bucket: "signup-ip",
    key: ip,
    limit: Number(process.env.SIGNUP_RATE_LIMIT_PER_IP ?? 5),
    windowSec: Number(process.env.SIGNUP_RATE_LIMIT_WINDOW_SEC ?? 86400),
  });
  if (!ipCheck.ok) {
    return NextResponse.json(
      { error: "too_many_requests", scope: "ip", retryAfterSec: ipCheck.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(ipCheck.retryAfterSec) } }
    );
  }

  if (email) {
    const emailCheck = await consumeRateLimit({
      bucket: "signup-email",
      key: email,
      limit: Number(process.env.SIGNUP_RATE_LIMIT_PER_EMAIL ?? 3),
      windowSec: Number(process.env.SIGNUP_RATE_LIMIT_WINDOW_SEC ?? 86400),
    });
    if (!emailCheck.ok) {
      return NextResponse.json(
        { error: "too_many_requests", scope: "email", retryAfterSec: emailCheck.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(emailCheck.retryAfterSec) } }
      );
    }
  }

  return NextResponse.json({ success: true });
}
