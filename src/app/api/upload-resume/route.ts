import { NextResponse } from "next/server";
import { consumeRateLimit, getClientIp } from "@/lib/server/rateLimit";

// Receives a resume file upload, converts to base64, and forwards to
// Google Apps Script which saves it to Drive and returns a shareable link.
//
// Apps Script responds with a 302 redirect to a googleusercontent.com URL
// that serves the actual JSON response. We use redirect:"manual" to stop
// at the 302 and read the Location header, then follow it manually.
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL;
  if (!url) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const ip = getClientIp(req.headers);
  const limit = Number(process.env.RESUME_UPLOAD_RATE_LIMIT_PER_IP ?? 5);
  const windowSec = Number(process.env.RESUME_UPLOAD_RATE_LIMIT_WINDOW_SEC ?? 3600);
  const rate = await consumeRateLimit({
    bucket: "resume-upload-ip",
    key: ip,
    limit,
    windowSec,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { error: "too_many_requests", retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Convert file to base64 for transport to Apps Script.
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  try {
    // POST to Apps Script; stop before following the redirect.
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        formType: "upload",
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileData: base64,
      }),
      redirect: "manual",
    });

    // Apps Script returns 302 → googleusercontent.com URL that serves the JSON.
    if (response.status === 301 || response.status === 302) {
      const location = response.headers.get("location");

      if (location) {
        const redirected = await fetch(location);
        const text = await redirected.text();
        try {
          const json = JSON.parse(text);
          if (json.url) return NextResponse.json({ url: json.url });
        } catch {
          // Response at redirect URL wasn't JSON.
        }
      }
    }
  } catch {
    // Network error or Apps Script unreachable.
  }

  return NextResponse.json({ url: "" });
}
