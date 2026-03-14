import { NextRequest, NextResponse } from "next/server";
import { dbRead, verifyCaller } from "@/lib/server/adminApi";

type ApplicationRow = Record<string, unknown>;
type InterviewSlotRow = Record<string, unknown>;
type TeamRow = Record<string, unknown>;

function readText(row: ApplicationRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeTimestamp(value: unknown, fallbackIso?: string): string {
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value.trim());
    if (!Number.isNaN(ms)) return new Date(ms).toISOString();
    return value.trim();
  }
  return fallbackIso ?? new Date().toISOString();
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeName(value: string): string {
  return normalize(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function canonicalEmail(value: string): string {
  const raw = normalize(value);
  const [local, domain] = raw.split("@");
  if (!local || !domain) return raw;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    const base = local.split("+")[0].replace(/\./g, "");
    return `${base}@gmail.com`;
  }
  return `${local}@${domain}`;
}

function namesLikelyMatch(aRaw: string, bRaw: string): boolean {
  const a = normalizeName(aRaw);
  const b = normalizeName(bRaw);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const left = new Set(a.split(" ").filter(Boolean));
  const right = new Set(b.split(" ").filter(Boolean));
  let overlap = 0;
  left.forEach((token) => {
    if (right.has(token)) overlap += 1;
  });
  return overlap >= 2;
}

function normalizeStatus(raw: string, flags: {
  hasCompletedInterview: boolean;
  hasScheduledInterview: boolean;
  hasInviteSent: boolean;
  isAccepted: boolean;
}): string {
  const key = raw.trim().toLowerCase();
  // Accepted is always terminal — accept button or team membership wins
  if (flags.isAccepted || key === "accepted") return "Accepted";
  // Interview time passed or eval submitted → Completed
  if (flags.hasCompletedInterview) return "Interview Completed";
  // Slot booked → Scheduled
  if (flags.hasScheduledInterview) return "Interview Scheduled";
  // Invite email sent → Invited
  if (flags.hasInviteSent) return "Invited for Interview";
  // Explicit stored status (handles legacy records where status was set manually)
  if (key === "interview completed") return "Interview Completed";
  if (key === "interview scheduled") return "Interview Scheduled";
  if (key === "invited for interview") return "Invited for Interview";
  return "New";
}

function normalizeApplication(
  id: string,
  row: ApplicationRow,
  options: {
    hasCompletedInterview: boolean;
    hasScheduledInterview: boolean;
    hasInviteSent: boolean;
    isAccepted: boolean;
  },
) {
  const createdAt = normalizeTimestamp(row.createdAt ?? row.Timestamp);
  const updatedAt = normalizeTimestamp(row.updatedAt, createdAt);
  const interviewSlotId = readText(row, ["interviewSlotId"]);
  const interviewScheduledAt = readText(row, ["interviewScheduledAt"]);
  return {
    id,
    fullName: readText(row, ["fullName", "Full Name", "name"]),
    email: readText(row, ["email", "Email"]).toLowerCase(),
    schoolName: readText(row, ["schoolName", "School Name", "Education", "school"]),
    grade: readText(row, ["grade", "Grade"]),
    cityState: readText(row, ["cityState", "City, State", "City"]),
    referral: readText(row, ["referral", "How They Heard"]),
    tracksSelected: readText(row, ["tracksSelected", "Tracks Selected"]),
    hasResume: readText(row, ["hasResume", "Has Resume"]),
    resumeUrl: readText(row, ["resumeUrl", "Resume URL"]),
    toolsSoftware: readText(row, ["toolsSoftware", "Tools/Software"]),
    accomplishment: readText(row, ["accomplishment", "Accomplishment"]),
    status: normalizeStatus(readText(row, ["status"]), options),
    notes: readText(row, ["notes", "Notes"]),
    interviewInviteToken: readText(row, ["interviewInviteToken"]),
    interviewInviteSentAt: readText(row, ["interviewInviteSentAt"]),
    interviewReminderSentAt: readText(row, ["interviewReminderSentAt"]),
    interviewSlotId,
    interviewScheduledAt,
    source: readText(row, ["source"]) || undefined,
    sourceTimestampRaw: readText(row, ["sourceTimestampRaw", "Timestamp"]),
    interviewEvaluations: (row.interviewEvaluations && typeof row.interviewEvaluations === "object")
      ? row.interviewEvaluations
      : {},
    finalDecisionRole: readText(row, ["finalDecisionRole"]),
    createdAt,
    updatedAt,
  };
}

export async function GET(req: NextRequest) {
  const verified = await verifyCaller(req, ["admin", "project_lead", "interviewer"]);
  if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: verified.status });

  const [applicationsData, slotsData, teamData] = await Promise.all([
    dbRead("applications", verified.caller.idToken),
    dbRead("interviewSlots", verified.caller.idToken),
    dbRead("team", verified.caller.idToken),
  ]);

  const slots = (slotsData ?? {}) as Record<string, InterviewSlotRow>;
  const team = (teamData ?? {}) as Record<string, TeamRow>;

  const applications = Object.entries((applicationsData ?? {}) as Record<string, ApplicationRow>)
    .map(([id, row]) => {
      const safeRow = row ?? {};
      const appEmail = readText(safeRow, ["email", "Email"]);
      const appName = readText(safeRow, ["fullName", "Full Name", "name"]);
      const appToken = readText(safeRow, ["interviewInviteToken"]);
      const appCanonicalEmail = canonicalEmail(appEmail);
      const hasInviteSent = !!readText(safeRow, ["interviewInviteSentAt"]);
      const rowSlotId = readText(safeRow, ["interviewSlotId"]);
      const rowScheduledAt = readText(safeRow, ["interviewScheduledAt"]);

      let hasPassedInterview = false;
      const hasMatchedBookedSlot = Object.values(slots).some((slot) => {
        const available = !!slot.available;
        if (available) return false;
        const bookedBy = String(slot.bookedBy ?? "").trim();
        const slotEmail = String(slot.bookerEmail ?? "").trim();
        const slotCanonical = canonicalEmail(slotEmail);
        const slotName = String(slot.bookerName ?? "").trim();
        let matched = false;
        if (appToken && bookedBy && appToken === bookedBy) matched = true;
        else if (appEmail && slotEmail && (normalize(appEmail) === normalize(slotEmail) || appCanonicalEmail === slotCanonical)) matched = true;
        else if (appName && slotName && namesLikelyMatch(appName, slotName)) matched = true;
        
        if (matched) {
          if (slot.datetime && new Date(String(slot.datetime)).getTime() < Date.now()) {
            hasPassedInterview = true;
          }
          return true;
        }
        return false;
      });

      const isAcceptedFromTeam = Object.values(team).some((member) => {
        const email = String(member.email ?? "").trim();
        const alternateEmail = String(member.alternateEmail ?? "").trim();
        const name = String(member.name ?? "").trim();
        if (appEmail && email && (normalize(appEmail) === normalize(email) || appCanonicalEmail === canonicalEmail(email))) return true;
        if (appEmail && alternateEmail && (normalize(appEmail) === normalize(alternateEmail) || appCanonicalEmail === canonicalEmail(alternateEmail))) return true;
        return !!(appName && name && namesLikelyMatch(appName, name));
      });

      const hasEvaluations = typeof safeRow.interviewEvaluations === "object" && safeRow.interviewEvaluations !== null && Object.keys(safeRow.interviewEvaluations).length > 0;
      
      return normalizeApplication(id, safeRow, {
        hasCompletedInterview: hasPassedInterview || hasEvaluations,
        hasScheduledInterview: !!(rowSlotId || rowScheduledAt || hasMatchedBookedSlot),
        hasInviteSent,
        isAccepted: isAcceptedFromTeam || normalize(readText(safeRow, ["status"])) === "accepted",
      });
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return NextResponse.json({
    success: true,
    applications,
    slots: slotsData ?? {},
  });
}
