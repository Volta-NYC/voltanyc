export type InterviewerContact = {
  name: string;
  email: string;
};

type TeamRecord = {
  name?: unknown;
  email?: unknown;
  alternateEmail?: unknown;
};

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeEmail(value: string): string {
  return value.toLowerCase().trim();
}

function parseInterviewerNames(slot: Record<string, unknown>): string[] {
  const list = slot.interviewerNames;
  if (Array.isArray(list)) {
    return list.map(toTrimmedString).filter(Boolean);
  }

  const single = toTrimmedString(slot.interviewerName);
  if (!single) return [];
  return single
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

export function resolveInterviewerContacts(
  slot: Record<string, unknown>,
  teamData: unknown,
): InterviewerContact[] {
  const interviewerNames = parseInterviewerNames(slot);
  if (interviewerNames.length === 0) return [];

  const team = (teamData ?? {}) as Record<string, TeamRecord>;
  const byName = new Map<string, InterviewerContact>();

  for (const value of Object.values(team)) {
    const name = toTrimmedString(value.name);
    if (!name) continue;

    const primaryEmail = normalizeEmail(toTrimmedString(value.email));
    const alternateEmail = normalizeEmail(toTrimmedString(value.alternateEmail));
    const email = primaryEmail || alternateEmail;

    byName.set(normalizeName(name), {
      name,
      email,
    });
  }

  const resolved: InterviewerContact[] = [];
  for (const rawName of interviewerNames) {
    const normalized = normalizeName(rawName);
    const match = byName.get(normalized);
    if (match) {
      resolved.push(match);
      continue;
    }

    resolved.push({
      name: rawName,
      email: "",
    });
  }

  return resolved;
}

export function pickIcsOrganizer(
  contacts: InterviewerContact[],
  fallbackEmail: string,
): InterviewerContact {
  const named = contacts.find((c) => c.name && c.email);
  if (named) return named;

  const firstNamed = contacts.find((c) => c.name);
  if (firstNamed) {
    return {
      name: firstNamed.name,
      email: firstNamed.email || fallbackEmail,
    };
  }

  return {
    name: "Volta NYC",
    email: fallbackEmail,
  };
}
