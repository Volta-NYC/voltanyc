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
    const expanded = list
      .flatMap((value) => toTrimmedString(value).split(","))
      .map((name) => name.trim())
      .filter(Boolean);
    return Array.from(new Set(expanded.map((name) => normalizeName(name))))
      .map((normalized) => expanded.find((name) => normalizeName(name) === normalized) ?? normalized);
  }
  return [];
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
  const interviewerNames = parseInterviewerNames(slot);

  if (interviewerIds.length === 0 && interviewerNames.length === 0) return [];

  const byName = new Map<string, InterviewerContact>();
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
    byName.set(normalizeName(name), contact);
    byId.set(id, contact);
  }

  const resolved: InterviewerContact[] = [];
  for (const memberId of interviewerIds) {
    const byMemberId = byId.get(memberId);
    if (byMemberId) {
      resolved.push(byMemberId);
    }
  }

  if (resolved.length > 0) {
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
