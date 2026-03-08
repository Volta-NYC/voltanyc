type BookingEmailInput = {
  to: string;
  bookerName: string;
  slotId: string;
  datetimeIso: string;
  durationMinutes: number;
  zoomLink: string;
  location?: string;
};

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

function buildIcs(input: BookingEmailInput): string {
  const start = new Date(input.datetimeIso);
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const descParts: string[] = [];
  if (input.zoomLink) descParts.push(`Join Zoom: ${input.zoomLink}`);
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
    `SUMMARY:${escapeIcs("Volta NYC Interview")}`,
    `DESCRIPTION:${escapeIcs(descParts.join("\n"))}`,
    input.location ? `LOCATION:${escapeIcs(input.location)}` : "",
    input.zoomLink ? `URL:${escapeIcs(input.zoomLink)}` : "",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcs("Volta NYC interview starts in 30 minutes.")}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return `${lines.join("\r\n")}\r\n`;
}

function buildGoogleCalendarUrl(input: BookingEmailInput): string {
  const start = new Date(input.datetimeIso);
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const dates = `${utcStamp(start)}/${utcStamp(end)}`;
  const details = input.zoomLink
    ? `Join Zoom: ${input.zoomLink}\n\nOrganized by Volta NYC`
    : "Organized by Volta NYC";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: "Volta NYC Interview",
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
  const start = new Date(datetimeIso);
  return start.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export async function sendInterviewBookingEmail(input: BookingEmailInput): Promise<void> {
  const timeText = formatTime(input.datetimeIso);
  const googleCalendarUrl = buildGoogleCalendarUrl(input);
  const ics = buildIcs(input);

  await sendInterviewEmail({
    to: input.to,
    subject: "Volta NYC Interview Confirmation",
    text: [
      `Hi ${input.bookerName || "there"},`,
      "",
      "Your Volta NYC interview is confirmed.",
      `Time: ${timeText}`,
      input.zoomLink ? `Zoom: ${input.zoomLink}` : "Zoom: (will be provided separately)",
      "",
      `Add to Google Calendar: ${googleCalendarUrl}`,
      "A calendar invite (.ics) is attached to this email.",
      "",
      "If you need to reschedule, reply to this email.",
      "",
      "- Volta NYC",
    ].join("\n"),
    html: `
      <p>Hi ${input.bookerName || "there"},</p>
      <p>Your <strong>Volta NYC interview</strong> is confirmed.</p>
      <p>
        <strong>Time:</strong> ${timeText}<br/>
        <strong>Zoom:</strong> ${input.zoomLink ? `<a href="${input.zoomLink}">${input.zoomLink}</a>` : "will be provided separately"}
      </p>
      <p>
        <a href="${googleCalendarUrl}">Add to Google Calendar</a><br/>
        A calendar invite (<code>.ics</code>) is attached to this email.
      </p>
      <p>If you need to reschedule, reply to this email.</p>
      <p>- Volta NYC</p>
    `,
    ics: {
      filename: "volta-nyc-interview.ics",
      content: ics,
    },
  });
}

export async function sendInterviewReminderEmail(input: BookingEmailInput): Promise<void> {
  const timeText = formatTime(input.datetimeIso);
  const googleCalendarUrl = buildGoogleCalendarUrl(input);
  const ics = buildIcs(input);

  await sendInterviewEmail({
    to: input.to,
    subject: "Reminder: Your Volta NYC interview starts in 30 minutes",
    text: [
      `Hi ${input.bookerName || "there"},`,
      "",
      "Reminder: your Volta NYC interview starts in about 30 minutes.",
      `Time: ${timeText}`,
      input.zoomLink ? `Zoom: ${input.zoomLink}` : "Zoom: (will be provided separately)",
      "",
      `Google Calendar: ${googleCalendarUrl}`,
      "A calendar invite (.ics) is attached again for convenience.",
      "",
      "- Volta NYC",
    ].join("\n"),
    html: `
      <p>Hi ${input.bookerName || "there"},</p>
      <p><strong>Reminder:</strong> your Volta NYC interview starts in about 30 minutes.</p>
      <p>
        <strong>Time:</strong> ${timeText}<br/>
        <strong>Zoom:</strong> ${input.zoomLink ? `<a href="${input.zoomLink}">${input.zoomLink}</a>` : "will be provided separately"}
      </p>
      <p>
        <a href="${googleCalendarUrl}">Open in Google Calendar</a><br/>
        A calendar invite (<code>.ics</code>) is attached again for convenience.
      </p>
      <p>- Volta NYC</p>
    `,
    ics: {
      filename: "volta-nyc-interview-reminder.ics",
      content: ics,
    },
  });
}
