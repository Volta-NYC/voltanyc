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

function parseInterviewerMemberIds(slot: Record<string, unknown>): string[] {
  const list = slot.interviewerMemberIds;
  if (!Array.isArray(list)) return [];
  const cleaned = list.map(toTrimmedString).filter(Boolean);
  return Array.from(new Set(cleaned));
}

export function resolveInterviewerContacts(
  slot: Record<string, unknown>,
  teamData: unknown,
): InterviewerContact[] {
  const team = (teamData ?? {}) as Record<string, TeamRecord>;
  const interviewerIds = parseInterviewerMemberIds(slot);
  if (interviewerIds.length === 0) return [];

  const byId = new Map<string, InterviewerContact>();

  for (const [id, value] of Object.entries(team)) {
    const name = toTrimmedString(value.name);
    if (!name) continue;

    const primaryEmail = normalizeEmail(toTrimmedString(value.email));
    const alternateEmail = normalizeEmail(toTrimmedString(value.alternateEmail));
    const email = primaryEmail || alternateEmail;

    const contact = {
      name,
      email,
    };
    byId.set(id, contact);
  }

  const resolved: InterviewerContact[] = [];
  for (const memberId of interviewerIds) {
    const byMemberId = byId.get(memberId);
    if (byMemberId) {
      resolved.push(byMemberId);
    }
  }

  const deduped: InterviewerContact[] = [];
  const seen = new Set<string>();
  for (const contact of resolved) {
    const key = `${normalizeName(contact.name)}|${normalizeEmail(contact.email)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(contact);
  }
  return deduped;
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
