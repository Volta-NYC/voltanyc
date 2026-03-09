type BookingEmailInput = {
  to: string;
  bookerName: string;
  slotId: string;
  datetimeIso: string;
  durationMinutes: number;
  zoomLink: string;
  location?: string;
  organizerName?: string;
  organizerEmail?: string;
};

const ET_TIMEZONE = "America/New_York";
const ISO_NO_TZ_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function sanitizeEmailAddress(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/<([^>]+)>/);
  return (match?.[1] ?? trimmed).trim();
}

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseIsoWithoutTimezone(value: string): DateParts | null {
  const m = value.match(ISO_NO_TZ_RE);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6] ?? "0"),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const val = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUTC = Date.UTC(
    val("year"),
    val("month") - 1,
    val("day"),
    val("hour"),
    val("minute"),
    val("second"),
  );
  return asUTC - date.getTime();
}

// Converts a wall-clock ET datetime (without timezone) into a real UTC instant.
function etWallClockToUtc(parts: DateParts): Date {
  const targetUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let guess = new Date(targetUTC);
  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMs(guess, ET_TIMEZONE);
    const next = new Date(targetUTC - offset);
    if (next.getTime() === guess.getTime()) break;
    guess = next;
  }
  return guess;
}

function getInterviewInstant(datetimeIso: string): Date {
  const trimmed = datetimeIso.trim();
  const naive = parseIsoWithoutTimezone(trimmed);
  if (naive) return etWallClockToUtc(naive);
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function buildIcs(input: BookingEmailInput): string {
  const start = getInterviewInstant(input.datetimeIso);
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const descParts: string[] = [];
  if (input.zoomLink) descParts.push(`Join Zoom: ${input.zoomLink}`);
  const organizerName = (input.organizerName || "Volta NYC").trim();
  const organizerEmail = sanitizeEmailAddress(input.organizerEmail || process.env.INTERVIEW_EMAIL_FROM || "");
  descParts.push(`Interviewer: ${organizerName}`);
  descParts.push("Organized by Volta NYC");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Volta NYC//Interview Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:volta-${input.slotId}@voltanyc.org`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${escapeIcs("Volta interview")}`,
    `DESCRIPTION:${escapeIcs(descParts.join("\n"))}`,
    organizerEmail
      ? `ORGANIZER;CN=${escapeIcs(organizerName)}:mailto:${escapeIcs(organizerEmail)}`
      : `ORGANIZER;CN=${escapeIcs(organizerName)}:mailto:ethan@voltanyc.org`,
    input.location ? `LOCATION:${escapeIcs(input.location)}` : "",
    input.zoomLink ? `URL:${escapeIcs(input.zoomLink)}` : "",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcs("Volta interview starts in 30 minutes.")}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return `${lines.join("\r\n")}\r\n`;
}

function buildGoogleCalendarUrl(input: BookingEmailInput): string {
  const start = getInterviewInstant(input.datetimeIso);
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const dates = `${utcStamp(start)}/${utcStamp(end)}`;
  const details = input.zoomLink
    ? `Join Zoom: ${input.zoomLink}\n\nOrganized by Volta NYC`
    : "Organized by Volta NYC";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: "Volta interview",
    dates,
    details,
    location: input.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

async function sendInterviewEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  ics?: { filename: string; content: string };
}): Promise<void> {
  const smtpUser = process.env.INTERVIEW_EMAIL_SMTP_USER ?? "";
  const smtpPass = process.env.INTERVIEW_EMAIL_SMTP_PASS ?? "";
  if (!smtpUser || !smtpPass) return;

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: process.env.INTERVIEW_EMAIL_SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.INTERVIEW_EMAIL_SMTP_PORT ?? 465),
    secure: (process.env.INTERVIEW_EMAIL_SMTP_SECURE ?? "true").toLowerCase() !== "false",
    auth: { user: smtpUser, pass: smtpPass },
  });

  const from = process.env.INTERVIEW_EMAIL_FROM ?? smtpUser;
  const replyTo = process.env.INTERVIEW_EMAIL_REPLY_TO ?? from;

  await transporter.sendMail({
    from,
    to: input.to,
    replyTo,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.ics
      ? [
          {
            filename: input.ics.filename,
            content: input.ics.content,
            contentType: "text/calendar; charset=utf-8; method=REQUEST",
          },
        ]
      : [],
  });
}

function formatTime(datetimeIso: string): string {
  const start = getInterviewInstant(datetimeIso);
  return start.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: ET_TIMEZONE,
    timeZoneName: "short",
  });
}

export async function sendInterviewBookingEmail(input: BookingEmailInput): Promise<void> {
  const timeText = formatTime(input.datetimeIso);
  const googleCalendarUrl = buildGoogleCalendarUrl(input);
  const ics = buildIcs(input);

  await sendInterviewEmail({
    to: input.to,
    subject: "Volta interview Confirmation",
    text: [
      `Hi ${input.bookerName || "there"},`,
      "",
      "Your Volta interview is confirmed.",
      `Time: ${timeText}`,
      input.zoomLink ? `Zoom: ${input.zoomLink}` : "Zoom: (will be provided separately)",
      "",
      `Add to Google Calendar: ${googleCalendarUrl}`,
      "A calendar invite (.ics) is attached to this email.",
      "",
      "If you need to reschedule, please do so through the booking portal at voltanyc.org/book using the same name and email you signed up for the original time slot with. If you have any trouble, reply to this email and we'll sort it out.",
      "",
      "We look forward to speaking with you.",
      "",
      "Best,",
      "Ethan Zhang",
    ].join("\n"),
    html: `
      <p>Hi ${input.bookerName || "there"},</p>
      <p>Your Volta interview is confirmed.</p>
      <p>
        <strong>Time:</strong> ${timeText}<br/>
        <strong>Zoom:</strong> ${input.zoomLink ? `<a href="${input.zoomLink}">${input.zoomLink}</a>` : "will be provided separately"}
      </p>
      <p>
        <a href="${googleCalendarUrl}">Add to Google Calendar</a><br/>
        A calendar invite (<code>.ics</code>) is attached to this email.
      </p>
      <p>If you need to reschedule, please do so through the booking portal at voltanyc.org/book using the same name and email you signed up for the original time slot with. If you have any trouble, reply to this email and we'll sort it out.<br/><br/>We look forward to speaking with you.</p>
      <p>Best,<br/>Ethan Zhang</p>
    `,
    ics: {
      filename: "volta-nyc-interview.ics",
      content: ics,
    },
  });
}

export async function sendInterviewRescheduledEmail(input: BookingEmailInput & {
  previousDatetimeIso: string;
}): Promise<void> {
  const newTimeText = formatTime(input.datetimeIso);
  const oldTimeText = formatTime(input.previousDatetimeIso);
  const googleCalendarUrl = buildGoogleCalendarUrl(input);
  const ics = buildIcs(input);

  await sendInterviewEmail({
    to: input.to,
    subject: "Volta interview Rescheduled",
    text: [
      `Hi ${input.bookerName || "there"},`,
      "",
      "Your Volta interview has been rescheduled.",
      `Previous time: ${oldTimeText}`,
      `New time: ${newTimeText}`,
      input.zoomLink ? `Zoom: ${input.zoomLink}` : "Zoom: (will be provided separately)",
      "",
      `Google Calendar: ${googleCalendarUrl}`,
      "A fresh calendar invite (.ics) is attached.",
      "",
      "If you need to reschedule again, please do so through the booking portal at voltanyc.org/book using the same name and email you signed up for the original time slot with. If you have any trouble, reply to this email and we'll sort it out.",
      "",
      "We look forward to speaking with you.",
      "",
      "Best,",
      "Ethan Zhang",
    ].join("\n"),
    html: `
      <p>Hi ${input.bookerName || "there"},</p>
      <p>Your <strong>Volta interview</strong> has been rescheduled.</p>
      <p>
        <strong>Previous time:</strong> ${oldTimeText}<br/>
        <strong>New time:</strong> ${newTimeText}<br/>
        <strong>Zoom:</strong> ${input.zoomLink ? `<a href="${input.zoomLink}">${input.zoomLink}</a>` : "will be provided separately"}
      </p>
      <p>
        <a href="${googleCalendarUrl}">Open in Google Calendar</a><br/>
        A fresh calendar invite (<code>.ics</code>) is attached.
      </p>
      <p>If you need to reschedule again, please do so through the booking portal at voltanyc.org/book using the same name and email you signed up for the original time slot with. If you have any trouble, reply to this email and we'll sort it out.<br/><br/>We look forward to speaking with you.</p>
      <p>Best,<br/>Ethan Zhang</p>
    `,
    ics: {
      filename: "volta-nyc-interview-rescheduled.ics",
      content: ics,
    },
  });
}

export async function sendInterviewerBookingNotificationEmail(input: {
  to: string;
  interviewerName: string;
  bookerName: string;
  bookerEmail: string;
  datetimeIso: string;
  durationMinutes: number;
  zoomLink: string;
  location?: string;
  slotId: string;
  scheduleSummaryLines?: string[];
  scheduleTotal?: number;
}): Promise<void> {
  const timeText = formatTime(input.datetimeIso);
  const summaryLines = input.scheduleSummaryLines ?? [];
  const scheduleTotal = Number.isFinite(input.scheduleTotal) ? Number(input.scheduleTotal) : summaryLines.length;
  const summaryTextBlock = [
    "Your upcoming interviews (next 3 weeks):",
    ...summaryLines.map((line) => `- ${line}`),
    `Total: ${scheduleTotal}`,
  ];
  const summaryHtmlLines = summaryLines.length > 0
    ? `<ul>${summaryLines.map((line) => `<li>${line}</li>`).join("")}</ul>`
    : "<ul><li>No upcoming interviews in this window.</li></ul>";
  await sendInterviewEmail({
    to: input.to,
    subject: "New Volta interview Scheduled",
    text: [
      `Hi ${input.interviewerName || "Interviewer"},`,
      "",
      "A new interview has been scheduled for one of your available slots.",
      `Candidate: ${input.bookerName || "Interviewee"}${input.bookerEmail ? ` (${input.bookerEmail})` : ""}`,
      `Time: ${timeText}`,
      input.zoomLink ? `Zoom: ${input.zoomLink}` : "Zoom: (will be provided separately)",
      "",
      ...summaryTextBlock,
      "",
      "You can review details in the member interview panel.",
    ].join("\n"),
    html: `
      <p>Hi ${input.interviewerName || "Interviewer"},</p>
      <p>A new interview has been scheduled for one of your available slots.</p>
      <p>
        <strong>Candidate:</strong> ${input.bookerName || "Interviewee"}${input.bookerEmail ? ` (${input.bookerEmail})` : ""}<br/>
        <strong>Time:</strong> ${timeText}<br/>
        <strong>Zoom:</strong> ${input.zoomLink ? `<a href="${input.zoomLink}">${input.zoomLink}</a>` : "will be provided separately"}
      </p>
      <p><strong>Your upcoming interviews (next 3 weeks):</strong></p>
      ${summaryHtmlLines}
      <p><strong>Total:</strong> ${scheduleTotal}</p>
      <p>You can review details in the member interview panel.</p>
    `,
  });
}

export async function sendInterviewerRescheduledNotificationEmail(input: {
  to: string;
  interviewerName: string;
  bookerName: string;
  bookerEmail: string;
  previousDatetimeIso: string;
  datetimeIso: string;
  durationMinutes: number;
  zoomLink: string;
  location?: string;
  slotId: string;
}): Promise<void> {
  const oldTimeText = formatTime(input.previousDatetimeIso);
  const newTimeText = formatTime(input.datetimeIso);
  await sendInterviewEmail({
    to: input.to,
    subject: "Volta interview Rescheduled to Your Slot",
    text: [
      `Hi ${input.interviewerName || "Interviewer"},`,
      "",
      "An interview has been rescheduled to one of your available slots.",
      `Candidate: ${input.bookerName || "Interviewee"}${input.bookerEmail ? ` (${input.bookerEmail})` : ""}`,
      `Previous time: ${oldTimeText}`,
      `New time: ${newTimeText}`,
      input.zoomLink ? `Zoom: ${input.zoomLink}` : "Zoom: (will be provided separately)",
      "",
      "You can review details in the member interview panel.",
    ].join("\n"),
    html: `
      <p>Hi ${input.interviewerName || "Interviewer"},</p>
      <p>An interview has been rescheduled to one of your available slots.</p>
      <p>
        <strong>Candidate:</strong> ${input.bookerName || "Interviewee"}${input.bookerEmail ? ` (${input.bookerEmail})` : ""}<br/>
        <strong>Previous time:</strong> ${oldTimeText}<br/>
        <strong>New time:</strong> ${newTimeText}<br/>
        <strong>Zoom:</strong> ${input.zoomLink ? `<a href="${input.zoomLink}">${input.zoomLink}</a>` : "will be provided separately"}
      </p>
      <p>You can review details in the member interview panel.</p>
    `,
  });
}
