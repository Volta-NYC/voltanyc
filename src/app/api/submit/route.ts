import { NextResponse } from "next/server";
import { consumeRateLimit, getClientIp } from "@/lib/server/rateLimit";

// Server-side proxy to Google Apps Script.
// The browser POSTs to /api/submit (same origin — no CORS).
// This route forwards it to Apps Script server-to-server (no CORS restrictions).
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL;
  if (!url) {
    return NextResponse.json({ error: "Apps Script URL not configured" }, { status: 500 });
  }

  const data = await request.json() as Record<string, unknown>;
  const ip = getClientIp(request.headers);

  const ipLimit = Number(process.env.FORM_RATE_LIMIT_PER_IP ?? 8);
  const ipWindowSec = Number(process.env.FORM_RATE_LIMIT_WINDOW_SEC ?? 3600);
  const ipCheck = await consumeRateLimit({
    bucket: "form-ip",
    key: ip,
    limit: ipLimit,
    windowSec: ipWindowSec,
  });
  if (!ipCheck.ok) {
    return NextResponse.json(
      { error: "too_many_requests", retryAfterSec: ipCheck.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(ipCheck.retryAfterSec) } }
    );
  }

  const email =
    (typeof data.Email === "string" && data.Email)
    || (typeof data.email === "string" && data.email)
    || "";
  if (email) {
    const emailLimit = Number(process.env.FORM_RATE_LIMIT_PER_EMAIL ?? 5);
    const emailWindowSec = Number(process.env.FORM_RATE_LIMIT_WINDOW_SEC ?? 3600);
    const emailCheck = await consumeRateLimit({
      bucket: "form-email",
      key: email.trim().toLowerCase(),
      limit: emailLimit,
      windowSec: emailWindowSec,
    });
    if (!emailCheck.ok) {
      return NextResponse.json(
        { error: "too_many_requests", retryAfterSec: emailCheck.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(emailCheck.retryAfterSec) } }
      );
    }
  }

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      redirect: "follow",
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: "upstream_failed" }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
