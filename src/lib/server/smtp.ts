import nodemailer from "nodemailer";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") return fallback;
  const v = value.trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

function parsePort(value: string | undefined, fallback: number): number {
  const n = Number(value ?? "");
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getSecondaryFromSet(): Set<string> {
  const raw = process.env.SMTP_SECONDARY_FROM_ADDRESSES ?? "";
  return new Set(
    raw
      .split(",")
      .map((item) => normalizeEmail(item))
      .filter(Boolean),
  );
}

export function resolveSmtpProfile(fromAddress?: string): {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  usingSecondary: boolean;
} {
  const normalizedFrom = normalizeEmail(fromAddress ?? "");
  const secondaryFromSet = getSecondaryFromSet();
  const wantsSecondary = normalizedFrom && secondaryFromSet.has(normalizedFrom);

  if (wantsSecondary) {
    const user = process.env.SMTP_USER_SECONDARY ?? "";
    const pass = process.env.SMTP_PASS_SECONDARY ?? "";
    if (!user || !pass) {
      throw new Error("secondary_smtp_not_configured");
    }
    return {
      host: process.env.SMTP_HOST_SECONDARY ?? process.env.SMTP_HOST ?? "smtp.gmail.com",
      port: parsePort(process.env.SMTP_PORT_SECONDARY ?? process.env.SMTP_PORT, 465),
      secure: parseBool(
        process.env.SMTP_SECURE_SECONDARY ?? process.env.SMTP_SECURE,
        true,
      ),
      user,
      pass,
      usingSecondary: true,
    };
  }

  const user = process.env.SMTP_USER ?? "";
  const pass = process.env.SMTP_PASS ?? "";
  if (!user || !pass) {
    throw new Error("primary_smtp_not_configured");
  }
  return {
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: parsePort(process.env.SMTP_PORT, 465),
    secure: parseBool(process.env.SMTP_SECURE, true),
    user,
    pass,
    usingSecondary: false,
  };
}

export function createTransportForFrom(fromAddress?: string) {
  const profile = resolveSmtpProfile(fromAddress);
  const transporter = nodemailer.createTransport({
    host: profile.host,
    port: profile.port,
    secure: profile.secure,
    auth: { user: profile.user, pass: profile.pass },
  });
  return { transporter, profile };
}

