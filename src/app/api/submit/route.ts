import { NextResponse } from "next/server";
import { consumeRateLimit, getClientIp } from "@/lib/server/rateLimit";
import { getAdminDB } from "@/lib/firebaseAdmin";

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function upsertBusinessLeadFromContactForm(data: Record<string, unknown>): Promise<void> {
  const db = getAdminDB();
  if (!db) return;

  const businessName = asText(data.businessName);
  const ownerName = asText(data.name);
  const ownerEmail = asText(data.email).toLowerCase();
  const neighborhood = asText(data.neighborhood);
  const services = asText(data.services);
  const message = asText(data.message);
  const language = asText(data.language);

  if (!businessName || !ownerName || !ownerEmail) return;

  const businessesSnap = await db.ref("businesses").get();
  const now = Date.now();
  if (businessesSnap.exists()) {
    const entries = businessesSnap.val() as Record<string, Record<string, unknown>>;
    const duplicateRecent = Object.values(entries).some((entry) => {
      const existingName = asText(entry.name).toLowerCase();
      const existingOwner = asText(entry.ownerName).toLowerCase();
      const existingEmail = asText(entry.ownerEmail).toLowerCase();
      const createdAt = Date.parse(asText(entry.createdAt));
      if (!createdAt) return false;
      const within24h = now - createdAt <= 24 * 60 * 60 * 1000;
      return (
        within24h
        && existingName === businessName.toLowerCase()
        && existingOwner === ownerName.toLowerCase()
        && existingEmail === ownerEmail
      );
    });
    if (duplicateRecent) return;
  }

  const timestamp = new Date(now).toISOString();
  const notesParts = [
    "Website form submission",
    neighborhood ? `Neighborhood: ${neighborhood}` : "",
    services ? `Services requested: ${services}` : "",
    language ? `Language: ${language}` : "",
    message ? `Message: ${message}` : "",
  ].filter(Boolean);

  await db.ref("businesses").push({
    name: businessName,
    bidId: "",
    ownerName,
    ownerEmail,
    ownerAlternateEmail: "",
    phone: "",
    alternatePhone: "",
    address: "",
    website: "",
    projectStatus: "Discovery",
    teamLead: "",
    firstContactDate: timestamp.slice(0, 10),
    notes: notesParts.join("\n"),
    division: "Marketing",
    teamMembers: [],
    sortIndex: now,
    intakeSource: "website_form",
    showcaseEnabled: false,
    showcaseFeaturedOnHome: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function splitToCsv(values: unknown): string {
  if (Array.isArray(values)) {
    return values.map((item) => asText(item)).filter(Boolean).join(", ");
  }
  return asText(values);
}

async function upsertApplicationFromForm(data: Record<string, unknown>): Promise<void> {
  const db = getAdminDB();
  if (!db) return;

  const fullName = asText(data["Full Name"]);
  const email = asText(data.Email).toLowerCase();
  if (!fullName || !email) return;

  const schoolName = asText(data["School Name"]) || asText(data.Education);
  const cityState = asText(data["City, State"]) || asText(data.City);
  const tracks = splitToCsv(data["Tracks Selected"]);
  const createdAt = new Date().toISOString();

  const appsSnap = await db.ref("applications").get();
  if (appsSnap.exists()) {
    const entries = appsSnap.val() as Record<string, Record<string, unknown>>;
    const duplicateRecent = Object.values(entries).some((entry) => {
      const entryEmail = asText(entry.email).toLowerCase();
      const entryName = asText(entry.fullName).toLowerCase();
      const entryCreatedAt = Date.parse(asText(entry.createdAt));
      if (!entryCreatedAt) return false;
      return (
        entryEmail === email
        && entryName === fullName.toLowerCase()
        && Date.now() - entryCreatedAt <= 6 * 60 * 60 * 1000
      );
    });
    if (duplicateRecent) return;
  }

  await db.ref("applications").push({
    fullName,
    email,
    schoolName,
    grade: asText(data.Grade),
    cityState,
    referral: asText(data["How They Heard"]),
    tracksSelected: tracks,
    hasResume: asText(data["Has Resume"]),
    resumeUrl: asText(data["Resume URL"]),
    toolsSoftware: asText(data["Tools/Software"]),
    accomplishment: asText(data.Accomplishment),
    status: "New",
    source: "website_form",
    sourceTimestampRaw: asText(data.Timestamp),
    notes: "",
    createdAt,
    updatedAt: createdAt,
  });
}

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

  if (data.formType === "contact") {
    try {
      await upsertBusinessLeadFromContactForm(data);
    } catch {
      return NextResponse.json({ error: "db_write_failed" }, { status: 502 });
    }
  }

  if (data.formType === "application") {
    try {
      await upsertApplicationFromForm(data);
    } catch {
      return NextResponse.json({ error: "db_write_failed" }, { status: 502 });
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
