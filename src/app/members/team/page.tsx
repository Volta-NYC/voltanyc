"use client";

import { useRef, useState, useEffect } from "react";
import MembersLayout from "@/components/members/MembersLayout";
import {
  PageHeader, SearchBar, Btn, Modal, Field, Input, TextArea, Empty, useConfirm, AutocompleteTagInput,
} from "@/components/members/ui";
import {
  subscribeTeam, createTeamMember, updateTeamMember, deleteTeamMember, type TeamMember,
} from "@/lib/members/storage";
import { useAuth } from "@/lib/members/authContext";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

// Blank form values for creating a new team member.
const BLANK_FORM: Omit<TeamMember, "id" | "createdAt"> = {
  grade: "",
  acceptedDate: "",
  name: "", school: "", divisions: [], pod: "", role: "Member", slackHandle: "",
  email: "", alternateEmail: "", status: "Active", skills: [], joinDate: "", notes: "",
};

const GRADE_OPTIONS = ["Freshman", "Sophomore", "Junior", "Senior", "College"];

type TrackKey = "Tech" | "Marketing" | "Finance" | "Other" | "—";

function getMemberTrack(member: TeamMember): TrackKey {
  const divisions = member.divisions ?? [];
  if (divisions.includes("Tech")) return "Tech";
  if (divisions.includes("Marketing")) return "Marketing";
  if (divisions.includes("Finance")) return "Finance";
  if (divisions.includes("Other") || divisions.includes("Outreach")) return "Other";
  return "—";
}

function getTrackAvatarStyles(track: TrackKey): { bg: string; text: string } {
  switch (track) {
    case "Tech":
      return { bg: "#DBEAFE", text: "#1E3A8A" };
    case "Marketing":
      return { bg: "#ECFCCB", text: "#365314" };
    case "Finance":
      return { bg: "#FEF3C7", text: "#92400E" };
    case "Other":
      return { bg: "#F3F4F6", text: "#374151" };
    default:
      return { bg: "rgba(133,204,23,0.15)", text: "#85CC17" };
  }
}

const TEAM_CODE_BY_EMAIL: Record<string, string> = {
  // Finance sub-teams
  "iamalvinjiang@gmail.com": "Reports",
  "shafeen873@gmail.com": "Reports",
  "bruceweng374@gmail.com": "Reports",
  "tsundrukn@gmail.com": "Reports",
  "yubabhatta1@gmail.com": "Reports",
  "peytonsyuen@gmail.com": "Reports",

  "nafismahimofficial@gmail.com": "Grants",
  "tylert4645@gmail.com": "Grants",
  "joseph.long.nyc@gmail.com": "Grants",
  "walterrz1230@gmail.com": "Grants",
  "madaniremichaela@gmail.com": "Grants",
  "ash28mui@gmail.com": "Grants",
  "thakkar.jay2009@gmail.com": "Grants",

  "linkevin246@gmail.com": "Outreach",
  "jackywang397@gmail.com": "Outreach",
  "angelinec085@gmail.com": "Outreach",
  "tiffanyxu1294@gmail.com": "Outreach",
  "ryanliu.contact@gmail.com": "Outreach",
};

const TEAM_CODE_BY_NAME: Record<string, string> = {
  // Tech team sets
  "eddie shah": "T1",
  "maahika chitagi": "T1",
  "shokhjakhon samiev": "T1",

  "aarav sharma": "T2",
  "arnob paul": "T2",
  "batuhan sekeroglu": "T2",

  "ronghe guo": "T3",
  "peter predolac": "T3",
  "xiang li": "T3",

  "akhil rao": "T4",
  "mohammad ehan khan": "T4",
  "nelson guo": "T4",
};

const TRACK_SORT_ORDER: Record<TrackKey, number> = {
  Finance: 0,
  Marketing: 1,
  Other: 2,
  Tech: 3,
  "—": 4,
};

type ImportedMember = {
  name: string;
  email: string;
  school: string;
  grade: string;
  track: TrackKey;
};

const TEAM_EMAIL_FROM_OPTIONS = [
  { value: "info@voltanyc.org", label: "info@voltanyc.org" },
  { value: "ethan@voltanyc.org", label: "ethan@voltanyc.org" },
];

function normalizeText(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

function normalizeKey(v: string): string {
  return normalizeText(v).toLowerCase();
}

function getMemberTeamCode(member: TeamMember): string {
  const email = normalizeKey(member.email ?? "");
  const altEmail = normalizeKey(member.alternateEmail ?? "");
  const name = normalizeKey(member.name ?? "");
  if (email && TEAM_CODE_BY_EMAIL[email]) return TEAM_CODE_BY_EMAIL[email];
  if (altEmail && TEAM_CODE_BY_EMAIL[altEmail]) return TEAM_CODE_BY_EMAIL[altEmail];
  if (name && TEAM_CODE_BY_NAME[name]) return TEAM_CODE_BY_NAME[name];
  return "—";
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }

  cells.push(current);
  return cells.map((c) => c.trim());
}

function countDelimiterOutsideQuotes(line: string, delimiter: string): number {
  let inQuotes = false;
  let count = 0;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delimiter) count += 1;
  }
  return count;
}

function detectDelimiter(headerLine: string): string {
  const delimiters = [",", "\t", ";"];
  let best = ",";
  let bestCount = -1;
  for (const d of delimiters) {
    const count = countDelimiterOutsideQuotes(headerLine, d);
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

function parseCsv(csvText: string): string[][] {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines[0]);
  return lines.map((line) => parseDelimitedLine(line, delimiter));
}

function headerKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findHeaderIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map(headerKey);
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseTrack(raw: string): TrackKey {
  const key = normalizeKey(raw);
  if (!key) return "—";
  if (key.includes("tech") || key.includes("digital")) return "Tech";
  if (key.includes("market")) return "Marketing";
  if (key.includes("finance") || key.includes("operation")) return "Finance";
  if (key.includes("outreach") || key.includes("other")) return "Other";
  return "—";
}

// ── PAGE COMPONENT ────────────────────────────────────────────────────────────

export default function TeamPage() {
  const [team, setTeam]               = useState<TeamMember[]>([]);
  const [search, setSearch]           = useState("");
  const [modal, setModal]             = useState<"create" | "edit" | null>(null);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [form, setForm]               = useState(BLANK_FORM);
  const [sortRules, setSortRules]     = useState<{ col: number; dir: "asc" | "desc" }[]>([{ col: 0, dir: "asc" }]);
  const [showSortPanel, setShowSortPanel] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [commsOpen, setCommsOpen] = useState(false);
  const [commsDivisions, setCommsDivisions] = useState<string[]>([]);
  const [commsSchools, setCommsSchools] = useState<string[]>([]);
  const [commsRoles, setCommsRoles] = useState<string[]>([]);
  const [commsTeams, setCommsTeams] = useState<string[]>([]);
  const [commsFrom, setCommsFrom] = useState<string>("info@voltanyc.org");
  const [commsSelectedIds, setCommsSelectedIds] = useState<string[]>([]);
  const [commsSubject, setCommsSubject] = useState("");
  const [commsMessage, setCommsMessage] = useState("");
  const [commsContentMode, setCommsContentMode] = useState<"plain" | "html">("plain");
  const [commsSending, setCommsSending] = useState(false);
  const [commsStatus, setCommsStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { ask, Dialog } = useConfirm();
  const { authRole, user } = useAuth();
  const canEdit = authRole === "admin" || authRole === "project_lead";

  // Subscribe to real-time team updates; unsubscribe on unmount.
  useEffect(() => subscribeTeam(setTeam), []);

  // Generic field updater used by all form inputs.
  const setField = (key: string, value: unknown) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const openCreate = () => {
    setForm(BLANK_FORM);
    setEditingMember(null);
    setModal("create");
  };

  const handleImportCsv = async (file: File) => {
    setImportingCsv(true);
    setImportMessage(null);
    try {
      const csvText = await file.text();
      const rows = parseCsv(csvText);
      if (rows.length < 2) {
        setImportMessage("CSV must include a header row and at least one data row.");
        return;
      }

      const headers = rows[0];
      const nameIdx = findHeaderIndex(headers, ["name", "full name", "student name"]);
      const emailIdx = findHeaderIndex(headers, ["email", "email address", "student email"]);
      const schoolIdx = findHeaderIndex(headers, ["school", "school name", "high school", "high school name"]);
      const gradeIdx = findHeaderIndex(headers, ["grade", "year", "class year"]);
      const trackIdx = findHeaderIndex(headers, ["track", "division"]);
      const hasAnySupportedHeader = [nameIdx, emailIdx, schoolIdx, gradeIdx, trackIdx].some((idx) => idx !== -1);

      if (!hasAnySupportedHeader) {
        setImportMessage("CSV must include at least one supported header: Name, Email, School, Grade, or Track.");
        return;
      }

      if (nameIdx === -1 && emailIdx === -1) {
        setImportMessage("CSV must include Name or Email so rows can be matched to members.");
        return;
      }

      const rawEntries: ImportedMember[] = [];
      let invalidRows = 0;

      for (const row of rows.slice(1)) {
        const name = nameIdx === -1 ? "" : normalizeText(row[nameIdx] ?? "");
        const email = emailIdx === -1 ? "" : normalizeText(row[emailIdx] ?? "");
        const school = schoolIdx === -1 ? "" : normalizeText(row[schoolIdx] ?? "");
        const grade = gradeIdx === -1 ? "" : normalizeText(row[gradeIdx] ?? "");
        const track = trackIdx === -1 ? "—" : parseTrack(row[trackIdx] ?? "");
        if (!name && !email) {
          invalidRows += 1;
          continue;
        }
        rawEntries.push({ name, email, school, grade, track });
      }

      const deduped: ImportedMember[] = [];
      const seenEmail = new Map<string, ImportedMember>();
      const seenName = new Map<string, ImportedMember>();

      for (const entry of rawEntries) {
        const emailKey = normalizeKey(entry.email);
        const nameKey = normalizeKey(entry.name);

        if (emailKey) {
          const existing = seenEmail.get(emailKey);
          if (existing) {
            if (!existing.school && entry.school) existing.school = entry.school;
            if (!existing.name && entry.name) existing.name = entry.name;
            if (!existing.grade && entry.grade) existing.grade = entry.grade;
            if (existing.track === "—" && entry.track !== "—") existing.track = entry.track;
            continue;
          }
          seenEmail.set(emailKey, { ...entry });
          deduped.push(seenEmail.get(emailKey)!);
          if (nameKey && !seenName.has(nameKey)) seenName.set(nameKey, seenEmail.get(emailKey)!);
          continue;
        }

        if (nameKey && seenName.has(nameKey)) continue;
        if (nameKey) seenName.set(nameKey, entry);
        deduped.push(entry);
      }

      const existingByEmail = new Map<string, TeamMember>();
      const existingByName = new Map<string, TeamMember[]>();

      for (const member of team) {
        const memberEmailKey = normalizeKey(member.email ?? "");
        const memberAltEmailKey = normalizeKey(member.alternateEmail ?? "");
        const memberNameKey = normalizeKey(member.name ?? "");
        if (memberEmailKey) existingByEmail.set(memberEmailKey, member);
        if (memberAltEmailKey) existingByEmail.set(memberAltEmailKey, member);
        if (memberNameKey) {
          const arr = existingByName.get(memberNameKey) ?? [];
          arr.push(member);
          existingByName.set(memberNameKey, arr);
        }
      }

      let added = 0;
      let updated = 0;
      let skipped = 0;
      let ambiguous = 0;
      const today = new Date().toISOString().split("T")[0];

      for (const entry of deduped) {
        const emailKey = normalizeKey(entry.email);
        const nameKey = normalizeKey(entry.name);
        const nameMatches = nameKey ? (existingByName.get(nameKey) ?? []) : [];
        const emailMatch = emailKey ? existingByEmail.get(emailKey) : undefined;
        const candidateMap = new Map<string, TeamMember>();
        if (emailMatch) candidateMap.set(emailMatch.id, emailMatch);
        nameMatches.forEach((m) => candidateMap.set(m.id, m));
        const candidates = Array.from(candidateMap.values());
        let target: TeamMember | undefined;

        if (candidates.length === 1) {
          [target] = candidates;
        } else if (candidates.length > 1) {
          const exact = candidates.filter((m) => {
            const mName = normalizeKey(m.name ?? "");
            const mPrimaryEmail = normalizeKey(m.email ?? "");
            const mAltEmail = normalizeKey(m.alternateEmail ?? "");
            const nameHit = !!nameKey && mName === nameKey;
            const emailHit = !!emailKey && (mPrimaryEmail === emailKey || mAltEmail === emailKey);
            return nameHit && emailHit;
          });
          if (exact.length === 1) {
            [target] = exact;
          } else {
            ambiguous += 1;
            continue;
          }
        }

        if (target) {
          const patch: Partial<TeamMember> = {};
          if (!normalizeText(target.name ?? "") && entry.name) patch.name = entry.name;
          if (entry.email) {
            const entryEmailKey = normalizeKey(entry.email);
            const primaryEmailKey = normalizeKey(target.email ?? "");
            const altEmailKey = normalizeKey(target.alternateEmail ?? "");
            if (entryEmailKey !== primaryEmailKey && entryEmailKey !== altEmailKey) {
              if (!normalizeText(target.email ?? "")) patch.email = entry.email;
              else if (!normalizeText(target.alternateEmail ?? "")) patch.alternateEmail = entry.email;
            }
          }
          if (!normalizeText(target.school ?? "") && entry.school) patch.school = entry.school;
          if (!normalizeText(target.grade ?? "") && entry.grade) patch.grade = entry.grade;
          if ((target.divisions ?? []).length === 0 && entry.track !== "—") {
            patch.divisions = [entry.track];
          }
          if (Object.keys(patch).length > 0) {
            // eslint-disable-next-line no-await-in-loop
            await updateTeamMember(target.id, patch);
            if (patch.email) {
              existingByEmail.set(normalizeKey(patch.email), { ...target, ...patch } as TeamMember);
            }
            if (patch.alternateEmail) {
              existingByEmail.set(normalizeKey(patch.alternateEmail), { ...target, ...patch } as TeamMember);
            }
            updated += 1;
          } else {
            skipped += 1;
          }
          continue;
        }

        // eslint-disable-next-line no-await-in-loop
        await createTeamMember({
          name: entry.name || (entry.email ? entry.email.split("@")[0] : "New Member"),
          email: entry.email,
          alternateEmail: "",
          school: entry.school,
          grade: entry.grade,
          acceptedDate: "",
          divisions: entry.track === "—" ? [] : [entry.track],
          pod: "",
          role: "Member",
          slackHandle: "",
          status: "Active",
          skills: [],
          joinDate: today,
          notes: "",
        });
        added += 1;
      }

      setImportMessage(
        `Imported ${rows.length - 1} rows: ${added} added, ${updated} updated, ${skipped} skipped${ambiguous ? `, ${ambiguous} ambiguous name matches` : ""}${invalidRows ? `, ${invalidRows} invalid` : ""}.`
      );
    } catch {
      setImportMessage("Could not import CSV. Check formatting and try again.");
    } finally {
      setImportingCsv(false);
    }
  };

  const onCsvInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleImportCsv(file);
    e.target.value = "";
  };

  const openEdit = (member: TeamMember) => {
    setForm({
      name:        member.name,
      school:      member.school,
      grade:       member.grade ?? "",
      // Guard against undefined: Firebase omits empty arrays when storing.
      divisions:   member.divisions ?? [],
      pod:         member.pod,
      role:        member.role,
      slackHandle: member.slackHandle,
      email:       member.email,
      alternateEmail: member.alternateEmail ?? "",
      status:      member.status,
      skills:      member.skills ?? [],
      joinDate:    member.joinDate,
      acceptedDate: member.acceptedDate ?? "",
      notes:       member.notes,
    });
    setEditingMember(member);
    setModal("edit");
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (editingMember) {
      await updateTeamMember(editingMember.id, form as Partial<TeamMember>);
    } else {
      await createTeamMember(form as Omit<TeamMember, "id" | "createdAt">);
    }
    setModal(null);
  };

  // Filter by search text.
  const filtered = team.filter(member => {
    const matchesSearch = !search
      || member.name.toLowerCase().includes(search.toLowerCase())
      || member.email.toLowerCase().includes(search.toLowerCase())
      || (member.alternateEmail ?? "").toLowerCase().includes(search.toLowerCase())
      || member.school.toLowerCase().includes(search.toLowerCase())
      || (member.grade ?? "").toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const SORT_COLUMNS = ["Track", "Team", "Name", "Email", "School", "Grade", "Date Accepted"];

  const compareMemberByCol = (a: TeamMember, b: TeamMember, col: number): number => {
    switch (col) {
      case 0: {
        const trackCmp = TRACK_SORT_ORDER[getMemberTrack(a)] - TRACK_SORT_ORDER[getMemberTrack(b)];
        if (trackCmp !== 0) return trackCmp;
        const teamCmp = getMemberTeamCode(a).localeCompare(getMemberTeamCode(b));
        return teamCmp !== 0 ? teamCmp : a.name.localeCompare(b.name);
      }
      case 1: return getMemberTeamCode(a).localeCompare(getMemberTeamCode(b));
      case 2: return a.name.localeCompare(b.name);
      case 3: return (a.email || "").localeCompare(b.email || "");
      case 4: return (a.school || "").localeCompare(b.school || "");
      case 5: return (a.grade || "").localeCompare(b.grade || "");
      case 6: return (a.acceptedDate || "").localeCompare(b.acceptedDate || "");
      default: return 0;
    }
  };

  const handleSort = (i: number) => {
    // Click on column header = reset to single-column sort
    const current = sortRules[0];
    if (current && current.col === i) {
      setSortRules([{ col: i, dir: current.dir === "asc" ? "desc" : "asc" }]);
    } else {
      setSortRules([{ col: i, dir: "asc" }]);
    }
  };

  const addSortRule = () => {
    const usedCols = new Set(sortRules.map((r) => r.col));
    const nextCol = SORT_COLUMNS.findIndex((_, i) => !usedCols.has(i));
    if (nextCol === -1) return;
    setSortRules((prev) => [...prev, { col: nextCol, dir: "asc" }]);
  };

  const removeSortRule = (idx: number) => {
    setSortRules((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length === 0 ? [{ col: 0, dir: "asc" }] : next;
    });
  };

  const updateSortRule = (idx: number, field: "col" | "dir", value: number | string) => {
    setSortRules((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      if (field === "col") return { ...r, col: value as number };
      return { ...r, dir: value as "asc" | "desc" };
    }));
  };

  const sorted = [...filtered].sort((a, b) => {
    for (const rule of sortRules) {
      const cmp = compareMemberByCol(a, b, rule.col);
      if (cmp !== 0) return rule.dir === "asc" ? cmp : -cmp;
    }
    return 0;
  });

  const commsDivisionOptions = ["Tech", "Marketing", "Finance", "Other"];
  const commsSchoolOptions = Array.from(
    new Set(team.map((member) => (member.school ?? "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  const commsRoleOptions = Array.from(
    new Set(team.map((member) => (member.role ?? "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  const commsTeamOptions = Array.from(
    new Set(team.map((member) => getMemberTeamCode(member)).filter((value) => value && value !== "—"))
  ).sort((a, b) => a.localeCompare(b));

  const commsFilteredMembers = team.filter((member) => {
    const divisions = member.divisions ?? [];
    const teamCode = getMemberTeamCode(member);
    const divisionMatch = commsDivisions.length === 0 || divisions.some((d) => commsDivisions.includes(d));
    const schoolMatch = commsSchools.length === 0 || commsSchools.includes((member.school ?? "").trim());
    const roleMatch = commsRoles.length === 0 || commsRoles.includes((member.role ?? "").trim());
    const teamMatch = commsTeams.length === 0 || commsTeams.includes(teamCode);
    return divisionMatch && schoolMatch && roleMatch && teamMatch;
  });

  const commsSelectedEmails = Array.from(
    new Set(
      commsFilteredMembers
        .filter((member) => commsSelectedIds.includes(member.id))
        .map((member) => (member.email ?? "").trim().toLowerCase())
        .filter(Boolean)
    )
  );

  const openCommsModal = () => {
    setCommsOpen(true);
    setCommsDivisions([]);
    setCommsSchools([]);
    setCommsRoles([]);
    setCommsTeams([]);
    setCommsFrom("info@voltanyc.org");
    setCommsContentMode("plain");
    setCommsSelectedIds(team.map((member) => member.id));
    setCommsSubject("");
    setCommsMessage("");
    setCommsStatus(null);
  };

  const toggleCommsMember = (id: string, checked: boolean) => {
    setCommsSelectedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((value) => value !== id);
    });
  };

  const selectAllCommsFiltered = () => {
    setCommsSelectedIds((prev) => {
      const set = new Set(prev);
      commsFilteredMembers.forEach((member) => set.add(member.id));
      return Array.from(set);
    });
  };

  const clearCommsFiltered = () => {
    const removeSet = new Set(commsFilteredMembers.map((member) => member.id));
    setCommsSelectedIds((prev) => prev.filter((id) => !removeSet.has(id)));
  };

  const sendCommsEmail = async () => {
    if (!commsSubject.trim() || !commsMessage.trim()) {
      setCommsStatus("Please add a subject and message.");
      return;
    }
    if (commsSelectedEmails.length === 0) {
      setCommsStatus("No recipients selected.");
      return;
    }
    setCommsSending(true);
    setCommsStatus("Sending…");
    try {
      if (!user) {
        setCommsStatus("Not authenticated.");
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/members/team-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fromAddress: commsFrom,
          subject: commsSubject.trim(),
          message: commsMessage.trim(),
          contentMode: commsContentMode,
          recipients: commsSelectedEmails,
        }),
      });
      if (!res.ok) {
        setCommsStatus("Could not send email.");
        return;
      }
      const payload = await res.json() as { sent?: number; failed?: string[] };
      const sentCount = payload.sent ?? 0;
      const failedCount = payload.failed?.length ?? 0;
      setCommsStatus(
        failedCount > 0
          ? `Sent to ${sentCount}. Failed: ${failedCount}.`
          : `Sent to ${sentCount} members.`
      );
    } catch {
      setCommsStatus("Could not send email.");
    } finally {
      setCommsSending(false);
    }
  };

  const setTrack = (track: TrackKey) => {
    if (track === "—") {
      setField("divisions", []);
      return;
    }
    setField("divisions", [track]);
  };

  return (
    <MembersLayout>
      <Dialog />
      {canEdit && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={onCsvInputChange}
        />
      )}

      <PageHeader
        title="Team Directory"
        subtitle={`${team.length} members tracked`}
        action={canEdit ? (
          <div className="flex gap-2">
            <Btn variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={importingCsv}>
              {importingCsv ? "Importing..." : "Import CSV"}
            </Btn>
            <Btn variant="primary" onClick={openCreate}>+ Add Member</Btn>
          </div>
        ) : undefined}
      />
      {importMessage && (
        <p className="text-xs text-white/55 mb-4">{importMessage}</p>
      )}

      {/* Search controls */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by name, email, school, or grade…" />
        {canEdit && <Btn variant="primary" onClick={openCommsModal}>Send Emails</Btn>}
        <div className="relative">
          <Btn size="sm" variant="ghost" onClick={() => setShowSortPanel((v) => !v)}>
            Sort{sortRules.length > 1 ? ` (${sortRules.length})` : ""}
          </Btn>
          {showSortPanel && (
            <div className="absolute top-full left-0 mt-1 bg-[#1C1F26] border border-white/10 rounded-lg shadow-xl z-50 p-3 min-w-[320px]">
              <p className="text-[10px] text-white/40 uppercase tracking-wide mb-2">Sort Rules</p>
              {sortRules.map((rule, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] text-white/40 w-[48px]">{idx === 0 ? "Sort by" : "Then by"}</span>
                  <select
                    value={rule.col}
                    onChange={(e) => updateSortRule(idx, "col", Number(e.target.value))}
                    className="flex-1 bg-[#0F1014] border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#85CC17]/45"
                  >
                    {SORT_COLUMNS.map((name, i) => (
                      <option key={i} value={i}>{name}</option>
                    ))}
                  </select>
                  <select
                    value={rule.dir}
                    onChange={(e) => updateSortRule(idx, "dir", e.target.value)}
                    className="bg-[#0F1014] border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#85CC17]/45 w-[60px]"
                  >
                    <option value="asc">A→Z</option>
                    <option value="desc">Z→A</option>
                  </select>
                  {sortRules.length > 1 && (
                    <button onClick={() => removeSortRule(idx)} className="text-white/30 hover:text-white/60 text-xs">✕</button>
                  )}
                </div>
              ))}
              {sortRules.length < SORT_COLUMNS.length && (
                <button onClick={addSortRule} className="text-[10px] text-[#85CC17]/70 hover:text-[#85CC17] transition-colors">
                  + Add sort level
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Team member list */}
      <div
        className="relative bg-[#1C1F26] border border-white/8 rounded-xl overflow-x-auto select-text"
      >
        <table className="w-full min-w-[1060px] text-[11px] leading-4 table-fixed">
          <thead className="bg-[#0F1014] border-b border-white/8">
            <tr>
              {["Track", "Team", "Name", "Email", "School", "Grade", "Date Accepted", "Actions"].map((col, idx) => {
                const sortable = [0, 1, 2, 3, 4, 5, 6].includes(idx);
                const primaryRule = sortRules[0];
                const isActive = primaryRule?.col === idx;
                const dir = isActive ? primaryRule.dir : "asc";
                return (
                  <th
                    key={col}
                    className={`px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-white/45 whitespace-nowrap ${sortable ? "cursor-pointer select-none" : ""} ${col === "Track" || col === "Team" ? "w-[56px]" : ""} ${col === "Actions" ? "w-[120px]" : ""}`}
                    onClick={() => sortable && handleSort(idx)}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      {col}
                      {sortable && (
                        <span className="inline-flex flex-col ml-0.5 -space-y-[3px] leading-none align-middle">
                          <span className={`text-[8px] ${isActive && dir === "asc" ? "text-white/80" : "text-white/20"}`}>▲</span>
                          <span className={`text-[8px] ${isActive && dir === "desc" ? "text-white/80" : "text-white/20"}`}>▼</span>
                        </span>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sorted.map((member) => {
              const track = getMemberTrack(member);
              const avatar = getTrackAvatarStyles(track);
              return (
                <tr
                  key={member.id}
                  className="hover:bg-white/3 transition-colors align-top"
                >
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className="text-white/65 text-[10px] font-semibold">{track}</span>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className="text-white/65 text-[10px] font-semibold">{getMemberTeamCode(member)}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: avatar.bg }}>
                        <span className="text-[10px] font-bold" style={{ color: avatar.text }}>{member.name[0]?.toUpperCase()}</span>
                      </div>
                      <span className="text-white/90 font-medium truncate whitespace-nowrap" title={member.name}>{member.name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span
                      className="font-mono text-white/50 block truncate"
                      title={member.alternateEmail ? `${member.email || "—"}, ${member.alternateEmail}` : (member.email || "—")}
                    >
                      {member.email || "—"}
                      {member.alternateEmail ? `, ${member.alternateEmail}` : ""}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className="text-white/50 block truncate" title={member.school || ""}>{member.school || "—"}</span>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className="text-white/50">{member.grade || "—"}</span>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className="text-white/50">{member.acceptedDate || "—"}</span>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <div className="flex gap-1 flex-nowrap">
                      {canEdit && <Btn size="sm" variant="secondary" className="!px-2 !py-0.5 !text-[10px] leading-none whitespace-nowrap" onClick={() => openEdit(member)}>Edit</Btn>}
                      {canEdit && <Btn size="sm" variant="danger" className="!px-2 !py-0.5 !text-[10px] leading-none whitespace-nowrap" onClick={() => ask(async () => deleteTeamMember(member.id))}>Delete</Btn>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <Empty
          message="No team members."
          action={canEdit ? <Btn variant="primary" onClick={openCreate}>Add first member</Btn> : undefined}
        />
      )}

      <Modal open={commsOpen} onClose={() => setCommsOpen(false)} title="Send Member Email">
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Division">
              <AutocompleteTagInput
                values={commsDivisions}
                onChange={setCommsDivisions}
                options={commsDivisionOptions}
                placeholder="Type division…"
              />
            </Field>
            <Field label="School">
              <AutocompleteTagInput
                values={commsSchools}
                onChange={setCommsSchools}
                options={commsSchoolOptions}
                placeholder="Type school…"
              />
            </Field>
            <Field label="Role">
              <AutocompleteTagInput
                values={commsRoles}
                onChange={setCommsRoles}
                options={commsRoleOptions}
                placeholder="Type role…"
              />
            </Field>
            <Field label="Team">
              <AutocompleteTagInput
                values={commsTeams}
                onChange={setCommsTeams}
                options={commsTeamOptions}
                placeholder="Type team code…"
              />
            </Field>
          </div>

          <div className="bg-[#0F1014] border border-white/10 rounded-xl p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-xs text-white/55">
                {commsSelectedEmails.length} selected · {commsFilteredMembers.length} in current filter
              </p>
              <div className="flex gap-2">
                <Btn size="sm" variant="secondary" onClick={selectAllCommsFiltered}>Select filtered</Btn>
                <Btn size="sm" variant="ghost" onClick={clearCommsFiltered}>Clear filtered</Btn>
              </div>
            </div>
            <div className="max-h-44 overflow-y-auto border border-white/8 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-[#141821] sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-white/45 w-10">#</th>
                    <th className="text-left px-3 py-2 text-white/45">Name</th>
                    <th className="text-left px-3 py-2 text-white/45">Primary Email</th>
                    <th className="text-left px-3 py-2 text-white/45">School</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {commsFilteredMembers.map((member) => {
                    const checked = commsSelectedIds.includes(member.id);
                    return (
                      <tr key={member.id} className="hover:bg-white/5">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleCommsMember(member.id, e.target.checked)}
                            className="accent-[#85CC17]"
                          />
                        </td>
                        <td className="px-3 py-2 text-white/75">{member.name}</td>
                        <td className="px-3 py-2 text-white/65 font-mono">{member.email || "—"}</td>
                        <td className="px-3 py-2 text-white/45">{member.school || "—"}</td>
                      </tr>
                    );
                  })}
                  {commsFilteredMembers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-white/35">No members in this filter.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <Field label="Subject" required>
            <Input value={commsSubject} onChange={(e) => setCommsSubject(e.target.value)} />
          </Field>
          <Field label="Send from" required>
            <select
              value={commsFrom}
              onChange={(e) => setCommsFrom(e.target.value)}
              className="w-full bg-[#0F1014] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#85CC17]/45"
            >
              {TEAM_EMAIL_FROM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Message Format" required>
            <select
              value={commsContentMode}
              onChange={(e) => setCommsContentMode(e.target.value === "html" ? "html" : "plain")}
              className="w-full bg-[#0F1014] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#85CC17]/45"
            >
              <option value="plain">Plain Text</option>
              <option value="html">HTML (links/images supported)</option>
            </select>
          </Field>
          <Field label="Message" required>
            <TextArea
              rows={9}
              value={commsMessage}
              onChange={(e) => setCommsMessage(e.target.value)}
              placeholder={
                commsContentMode === "html"
                  ? "<p>Hi team,</p><p>Update with <a href=\"https://...\">link</a>.</p><img src=\"https://...\" alt=\"\" />"
                  : "Write your email..."
              }
            />
          </Field>
          {commsStatus && <p className="text-xs text-white/60">{commsStatus}</p>}

          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setCommsOpen(false)}>Close</Btn>
            <Btn
              variant="primary"
              onClick={sendCommsEmail}
              disabled={commsSending || commsSelectedEmails.length === 0}
            >
              {commsSending ? "Sending..." : `Send Emails (${commsSelectedEmails.length})`}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Create / Edit modal */}
      <Modal open={modal !== null} onClose={() => setModal(null)} title={editingMember ? "Edit Member" : "New Member"}>
        <div className="grid grid-cols-2 gap-4 max-h-[65vh] overflow-y-auto pr-2">
          <Field label="Full Name" required>
            <Input value={form.name} onChange={e => setField("name", e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={e => setField("email", e.target.value)} />
          </Field>
          <Field label="Alternate Email">
            <Input type="email" value={form.alternateEmail ?? ""} onChange={e => setField("alternateEmail", e.target.value)} />
          </Field>
          <Field label="School">
            <Input value={form.school} onChange={e => setField("school", e.target.value)} />
          </Field>
          <Field label="Grade">
            <select
              value={form.grade ?? ""}
              onChange={e => setField("grade", e.target.value)}
              className="w-full bg-[#0F1014] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#85CC17]/45"
            >
              <option value="">Select grade</option>
              {GRADE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </Field>
          <Field label="Date Accepted">
            <Input
              type="date"
              value={form.acceptedDate ?? ""}
              onChange={e => setField("acceptedDate", e.target.value)}
            />
          </Field>
          <Field label="Track">
            <select
              value={getMemberTrack({ ...(form as TeamMember), id: "", createdAt: "" })}
              onChange={(e) => setTrack(e.target.value as TrackKey)}
              className="w-full bg-[#0F1014] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#85CC17]/45"
            >
              <option value="—">—</option>
              <option value="Tech">Tech</option>
              <option value="Marketing">Marketing</option>
              <option value="Finance">Finance</option>
              <option value="Other">Other</option>
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-white/8">
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSave}>{editingMember ? "Save" : "Add Member"}</Btn>
        </div>
      </Modal>
    </MembersLayout>
  );
}
