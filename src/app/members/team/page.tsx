"use client";

import { useRef, useState, useEffect } from "react";
import MembersLayout from "@/components/members/MembersLayout";
import {
  PageHeader, SearchBar, Btn, Modal, Field, Input, Empty, useConfirm,
} from "@/components/members/ui";
import {
  subscribeTeam, createTeamMember, updateTeamMember, deleteTeamMember, type TeamMember,
} from "@/lib/members/storage";
import { useAuth } from "@/lib/members/authContext";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

// Blank form values for creating a new team member.
const BLANK_FORM: Omit<TeamMember, "id" | "createdAt"> = {
  grade: "",
  name: "", school: "", divisions: [], pod: "", role: "Member", slackHandle: "",
  email: "", alternateEmail: "", status: "Active", skills: [], joinDate: "", notes: "",
};

const GRADE_OPTIONS = ["Freshman", "Sophomore", "Junior", "Senior", "College"];

type TrackKey = "Tech" | "Marketing" | "Finance" | "Outreach" | "—";

function getMemberTrack(member: TeamMember): TrackKey {
  const divisions = member.divisions ?? [];
  if (divisions.includes("Tech")) return "Tech";
  if (divisions.includes("Marketing")) return "Marketing";
  if (divisions.includes("Finance")) return "Finance";
  if (divisions.includes("Outreach")) return "Outreach";
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
    case "Outreach":
      return { bg: "#F3F4F6", text: "#374151" };
    default:
      return { bg: "rgba(133,204,23,0.15)", text: "#85CC17" };
  }
}

type ImportedMember = {
  name: string;
  email: string;
  school: string;
  grade: string;
  track: TrackKey;
};

function normalizeText(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

function normalizeKey(v: string): string {
  return normalizeText(v).toLowerCase();
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
  if (key.includes("outreach")) return "Outreach";
  return "—";
}

// ── PAGE COMPONENT ────────────────────────────────────────────────────────────

export default function TeamPage() {
  const [team, setTeam]               = useState<TeamMember[]>([]);
  const [search, setSearch]           = useState("");
  const [modal, setModal]             = useState<"create" | "edit" | null>(null);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [form, setForm]               = useState(BLANK_FORM);
  const [sortCol, setSortCol]         = useState(0);
  const [sortDir, setSortDir]         = useState<"asc" | "desc">("asc");
  const [importingCsv, setImportingCsv] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [draggingSelect, setDraggingSelect] = useState(false);
  const [selectionRect, setSelectionRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [copiedEmails, setCopiedEmails] = useState(false);
  const [emailSelectMode, setEmailSelectMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const rowRefMap = useRef<Record<string, HTMLTableRowElement | null>>({});

  const { ask, Dialog } = useConfirm();
  const { authRole }    = useAuth();
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

  const handleSort = (i: number) => {
    if (sortCol === i) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(i); setSortDir("asc"); }
  };
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case 0: {
        const trackCmp = getMemberTrack(a).localeCompare(getMemberTrack(b));
        cmp = trackCmp !== 0 ? trackCmp : a.name.localeCompare(b.name);
        break;
      }
      case 1: cmp = a.name.localeCompare(b.name); break;
      case 2: cmp = (a.email || "").localeCompare(b.email || ""); break;
      case 3: cmp = (a.school || "").localeCompare(b.school || ""); break;
      case 4: cmp = (a.grade || "").localeCompare(b.grade || ""); break;
      default: return 0;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const selectedEmailList = (() => {
    const selectedSet = new Set(selectedMemberIds);
    const deduped: string[] = [];
    const seen = new Set<string>();
    sorted.forEach((member) => {
      if (!selectedSet.has(member.id)) return;
      const email = (member.email ?? "").trim();
      if (!email) return;
      const key = email.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(email);
    });
    return deduped;
  })();

  const copySelectedEmails = async () => {
    if (selectedEmailList.length === 0) return;
    await navigator.clipboard.writeText(selectedEmailList.join(", "));
    setCopiedEmails(true);
    setEmailSelectMode(false);
    setSelectionRect(null);
    setSelectedMemberIds([]);
    dragStartRef.current = null;
    dragPointerIdRef.current = null;
    setDraggingSelect(false);
    setTimeout(() => setCopiedEmails(false), 1600);
  };

  const clearSelection = () => {
    setSelectedMemberIds([]);
    setSelectionRect(null);
    setDraggingSelect(false);
    setEmailSelectMode(false);
  };

  const handleTablePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!emailSelectMode) return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, label")) return;
    const container = tableWrapRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    dragStartRef.current = {
      x: e.clientX - bounds.left,
      y: e.clientY - bounds.top + container.scrollTop,
    };
    dragPointerIdRef.current = e.pointerId;
    setDraggingSelect(true);
    setSelectionRect({ left: dragStartRef.current.x, top: dragStartRef.current.y, width: 0, height: 0 });
    setSelectedMemberIds([]);
    container.setPointerCapture(e.pointerId);
  };

  const handleTablePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!emailSelectMode) return;
    if (!draggingSelect || dragPointerIdRef.current !== e.pointerId) return;
    const start = dragStartRef.current;
    const container = tableWrapRef.current;
    if (!start || !container) return;

    const bounds = container.getBoundingClientRect();
    const currentX = e.clientX - bounds.left;
    const currentY = e.clientY - bounds.top + container.scrollTop;
    const left = Math.min(start.x, currentX);
    const top = Math.min(start.y, currentY);
    const right = Math.max(start.x, currentX);
    const bottom = Math.max(start.y, currentY);
    const width = right - left;
    const height = bottom - top;
    setSelectionRect({ left, top, width, height });

    const containerTopInPage = bounds.top - container.scrollTop;
    const selectTopPage = containerTopInPage + top;
    const selectBottomPage = containerTopInPage + bottom;
    const selectLeftPage = bounds.left + left;
    const selectRightPage = bounds.left + right;

    const nextSelected: string[] = [];
    sorted.forEach((member) => {
      const rowEl = rowRefMap.current[member.id];
      if (!rowEl) return;
      const rowRect = rowEl.getBoundingClientRect();
      const intersects =
        rowRect.left < selectRightPage
        && rowRect.right > selectLeftPage
        && rowRect.top < selectBottomPage
        && rowRect.bottom > selectTopPage;
      if (intersects) nextSelected.push(member.id);
    });
    setSelectedMemberIds(nextSelected);
  };

  const handleTablePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!emailSelectMode) return;
    if (!draggingSelect || dragPointerIdRef.current !== e.pointerId) return;
    const container = tableWrapRef.current;
    if (container) container.releasePointerCapture(e.pointerId);
    dragStartRef.current = null;
    dragPointerIdRef.current = null;
    setDraggingSelect(false);
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
      <div className="flex gap-3 mb-4 flex-wrap">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by name, email, school, or grade…" />
        {!emailSelectMode ? (
          <Btn
            variant="secondary"
            onClick={() => {
              setEmailSelectMode(true);
              setSelectedMemberIds([]);
              setSelectionRect(null);
              setDraggingSelect(false);
            }}
          >
            Select Emails
          </Btn>
        ) : (
          <Btn
            variant="secondary"
            onClick={copySelectedEmails}
            disabled={selectedEmailList.length === 0}
          >
            {copiedEmails ? "Copied" : `Copy selected emails${selectedEmailList.length > 0 ? ` (${selectedEmailList.length})` : ""}`}
          </Btn>
        )}
        {emailSelectMode && (
          <Btn variant="ghost" onClick={clearSelection}>Clear Selection</Btn>
        )}
      </div>

      {/* Team member list */}
      <div
        ref={tableWrapRef}
        className={`relative bg-[#1C1F26] border border-white/8 rounded-xl overflow-x-auto ${emailSelectMode ? "select-none" : "select-text"}`}
        onPointerDown={handleTablePointerDown}
        onPointerMove={handleTablePointerMove}
        onPointerUp={handleTablePointerUp}
        onPointerCancel={handleTablePointerUp}
      >
        {emailSelectMode && selectionRect && (
          <div
            className="absolute z-20 border border-[#85CC17]/70 bg-[#85CC17]/20 pointer-events-none"
            style={{
              left: selectionRect.left,
              top: selectionRect.top,
              width: selectionRect.width,
              height: selectionRect.height,
            }}
          />
        )}
        <table className="w-full min-w-[760px]">
          <thead className="bg-[#0F1014] border-b border-white/8">
            <tr>
              {["Track", "Name", "Email", "School", "Grade", "Actions"].map((col, idx) => {
                const sortable = [0, 1, 2, 3, 4].includes(idx);
                const active = sortCol === idx;
                return (
                  <th
                    key={col}
                    className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/45 ${sortable ? "cursor-pointer select-none" : ""}`}
                    onClick={() => sortable && handleSort(idx)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col}
                      {active && <span className="text-white/35">{sortDir === "asc" ? "↑" : "↓"}</span>}
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
              const selected = selectedMemberIds.includes(member.id);
              return (
                <tr
                  key={member.id}
                  ref={(el) => { rowRefMap.current[member.id] = el; }}
                  className={`${selected ? "bg-[#85CC17]/12" : "hover:bg-white/3"} transition-colors`}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-white/65 text-xs font-semibold">{track}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: avatar.bg }}>
                        <span className="text-sm font-bold" style={{ color: avatar.text }}>{member.name[0]?.toUpperCase()}</span>
                      </div>
                      <span className="text-white font-medium">{member.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-xs font-mono">
                      <p className="text-white/50">{member.email || "—"}</p>
                      {member.alternateEmail && (
                        <p className="text-white/30">{member.alternateEmail}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-white/50">{member.school || "—"}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-white/50">{member.grade || "—"}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex gap-2">
                      {canEdit && <Btn size="sm" variant="secondary" onClick={() => openEdit(member)}>Edit</Btn>}
                      {canEdit && <Btn size="sm" variant="danger" onClick={() => ask(async () => deleteTeamMember(member.id))}>Delete</Btn>}
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
              <option value="Outreach">Outreach</option>
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
