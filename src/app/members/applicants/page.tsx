"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MembersLayout from "@/components/members/MembersLayout";
import {
  Btn, Empty, Modal, Field, PageHeader, SearchBar, useConfirm,
} from "@/components/members/ui";
import {
  type ApplicationRecord,
  type ApplicationStatus,
  type InterviewSlot,
  type TeamMember,
  subscribeTeam,
  subscribeInterviewSlots,
} from "@/lib/members/storage";
import { useAuth } from "@/lib/members/authContext";

const STATUS_OPTIONS: ApplicationStatus[] = [
  "New",
  "Invited for Interview",
  "Interview Scheduled",
  "Interview Completed",
  "Accepted",
];

const STATUS_BADGE_CLASS: Record<string, string> = {
  "New": "bg-white/10 text-white/75 border border-white/20",
  "Invited for Interview": "bg-[#85CC17]/20 text-[#C4F135] border border-[#85CC17]/35",
  "Interview Scheduled": "bg-blue-500/20 text-blue-200 border border-blue-400/35",
  "Interview Completed": "bg-purple-500/20 text-purple-200 border border-purple-400/35",
  "Accepted": "bg-emerald-500/20 text-emerald-200 border border-emerald-400/35",
};

function normalize(v: string): string {
  return v.trim().replace(/\s+/g, " ").toLowerCase();
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
  return cells.map((cell) => cell.trim());
}

function countDelimiterOutsideQuotes(line: string, delimiter: string): number {
  let inQuotes = false;
  let count = 0;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") i += 1;
      else inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === delimiter) count += 1;
  }
  return count;
}

function parseCsv(csvText: string): string[][] {
  const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];
  const delimiters = [",", "\t", ";"];
  let delimiter = ",";
  let bestCount = -1;
  for (const d of delimiters) {
    const count = countDelimiterOutsideQuotes(lines[0], d);
    if (count > bestCount) {
      bestCount = count;
      delimiter = d;
    }
  }
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

function normalizeName(value: string): string {
  return normalize(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function canonicalEmail(value: string): string {
  const email = normalize(value);
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    const base = local.split("+")[0].replace(/\./g, "");
    return `${base}@gmail.com`;
  }
  return `${local}@${domain}`;
}

function namesLikelyMatch(leftRaw: string, rightRaw: string): boolean {
  const left = normalizeName(leftRaw);
  const right = normalizeName(rightRaw);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  let overlap = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) overlap += 1;
  });
  return overlap >= 2;
}

function formatDateTime(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

// ── Column definitions ─────────────────────────────────────────────────────────

type ColumnKey = "status" | "name" | "email" | "school" | "cityState" | "referral" | "tracks" | "resume" | "applied" | "invite" | "interview" | "evals" | "actions";

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "status", label: "Status" },
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "school", label: "School Name" },
  { key: "cityState", label: "City, State" },
  { key: "referral", label: "How They Heard" },
  { key: "tracks", label: "Tracks" },
  { key: "resume", label: "Resume URL" },
  { key: "applied", label: "Applied" },
  { key: "evals", label: "Eval" },
  { key: "interview", label: "Interview" },
  { key: "invite", label: "Invite" },
  { key: "actions", label: "Actions" },
];

// ── Column widths (tailwind-compatible) ────────────────────────────────────────

const COLUMN_WIDTH: Partial<Record<ColumnKey, string>> = {
  status: "w-[130px]",
  name: "w-[120px]",
  email: "min-w-[260px]",
  school: "w-[140px]",
  cityState: "w-[100px]",
  referral: "w-[100px]",
  tracks: "w-[90px]",
  resume: "w-[70px]",
  applied: "w-[110px]",
  invite: "w-[130px]",
  interview: "w-[130px]",
  actions: "w-[160px]",
};


export default function ApplicantsPage() {
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [slots, setSlots] = useState<InterviewSlot[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [search, setSearch] = useState("");
  const [showAcceptedApplicants, setShowAcceptedApplicants] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState<"none" | "invite" | "accept">("none");
  const [importing, setImporting] = useState(false);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [bulkPromoting, setBulkPromoting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<ColumnKey>>(new Set());
  // Accept modal state
  const [acceptModalApp, setAcceptModalApp] = useState<ApplicationRecord | null>(null);
  const [acceptRole, setAcceptRole] = useState("Analyst");
  const [acceptSendEmail, setAcceptSendEmail] = useState(true);
  const [viewingEvaluationsApp, setViewingEvaluationsApp] = useState<ApplicationRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { ask, Dialog } = useConfirm();
  const { authRole, user } = useAuth();
  const canEdit = authRole === "admin" || authRole === "project_lead";
  const canDelete = authRole === "admin";
  const canManageStatus = canEdit;
  const canView = canEdit || authRole === "interviewer";
  const isInterviewerOnly = authRole === "interviewer" && !canEdit;

  // Subscribe to team members for interviewer identity resolution
  useEffect(() => subscribeTeam(setTeamMembers), []);

  // Subscribe to interview slots for resume access control
  useEffect(() => subscribeInterviewSlots(setSlots), []);

  // Resolve the current user's team member IDs
  const currentInterviewerMemberIds = useMemo(() => {
    if (!user) return [] as string[];
    const email = normalize(user.email ?? "");
    const canonical = canonicalEmail(user.email ?? "");
    const displayName = normalizeName(user.displayName ?? "");
    return teamMembers
      .filter((member) => {
        const memberEmail = normalize(member.email ?? "");
        const memberAltEmail = normalize(member.alternateEmail ?? "");
        const memberCanonical = canonicalEmail(member.email ?? "");
        const memberAltCanonical = canonicalEmail(member.alternateEmail ?? "");
        if (email && (memberEmail === email || memberAltEmail === email || memberCanonical === canonical || memberAltCanonical === canonical)) return true;
        if (displayName && namesLikelyMatch(displayName, member.name ?? "")) return true;
        return false;
      })
      .map((member) => String(member.id ?? "").trim())
      .filter(Boolean);
  }, [teamMembers, user]);

  const fetchApplicantsData = useCallback(async () => {
    if (!user || !canView) {
      setLoadingData(false);
      return;
    }
    setLoadingData(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/members/applicants/list", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("load_failed");
      const payload = await res.json() as {
        applications?: ApplicationRecord[];
        slots?: Record<string, InterviewSlot>;
      };
      setApplications(Array.isArray(payload.applications) ? payload.applications : []);
    } catch {
      setStatusMessage("Could not load applicants from server.");
    } finally {
      setLoadingData(false);
    }
  }, [user, canView]);

  useEffect(() => {
    void fetchApplicantsData();
    if (!canView) return;
    const timer = setInterval(() => void fetchApplicantsData(), 15000);
    return () => clearInterval(timer);
  }, [fetchApplicantsData, canView]);

  const bookedSlots = useMemo(
    () => [...slots]
      .filter((slot) => !slot.available)
      .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime()),
    [slots],
  );

  const matchBookedSlot = useCallback((app: ApplicationRecord): InterviewSlot | undefined => {
    const appEmail = normalize(app.email);
    const appCanonical = canonicalEmail(appEmail);
    const appName = app.fullName;
    const token = normalize(app.interviewInviteToken ?? "");
    const appSlotId = normalize(app.interviewSlotId ?? "");
    return bookedSlots.find((slot) => {
      if (appSlotId && normalize(slot.id) === appSlotId) return true;
      const slotEmail = normalize(slot.bookerEmail ?? "");
      const slotCanonical = canonicalEmail(slotEmail);
      const slotName = slot.bookerName ?? "";
      const slotToken = normalize(slot.bookedBy ?? "");
      if (token && slotToken && token === slotToken) return true;
      if (appEmail && slotEmail && (appEmail === slotEmail || appCanonical === slotCanonical)) return true;
      if (appName && slotName && namesLikelyMatch(appName, slotName)) return true;
      return false;
    });
  }, [bookedSlots]);

  // Check if the current interviewer can view the resume for a specific applicant
  const canViewResumeForApp = useCallback((app: ApplicationRecord): boolean => {
    // Admins and project leads can view all resumes
    if (canEdit) return true;
    // Interviewers can only view resumes of applicants who booked in their assigned slots
    if (isInterviewerOnly) {
      const bookedSlot = matchBookedSlot(app);
      if (!bookedSlot) return false;
      const slotInterviewerIds = Array.isArray(bookedSlot.interviewerMemberIds)
        ? bookedSlot.interviewerMemberIds.map((v) => String(v ?? "").trim()).filter(Boolean)
        : [];
      if (slotInterviewerIds.length === 0 || currentInterviewerMemberIds.length === 0) return false;
      return slotInterviewerIds.some((id) => currentInterviewerMemberIds.includes(id));
    }
    return false;
  }, [canEdit, isInterviewerOnly, matchBookedSlot, currentInterviewerMemberIds]);

  const filtered = useMemo(() => {
    const q = normalize(search);
    const base = [...applications]
      .filter((app) => {
        if (!showAcceptedApplicants && normalize(app.status) === "accepted") return false;
        if (!q) return true;
        return normalize(app.fullName).includes(q)
          || normalize(app.email).includes(q)
          || normalize(app.schoolName ?? "").includes(q)
          || normalize(app.status).includes(q);
      });
    // Always sort by most recent application first
    base.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return base;
  }, [applications, search, showAcceptedApplicants]);

  const uninvitedApplicantIds = useMemo(
    () =>
      applications
        .filter((app) => {
          if (app.interviewInviteSentAt) return false;
          if (["accepted", "waitlisted", "not accepted", "interview scheduled"].includes(normalize(app.status))) return false;
          if (matchBookedSlot(app)) return false;
          return true;
        })
        .map((app) => app.id),
    [applications, matchBookedSlot]
  );

  const unbookedReminderIds = useMemo(() => {
    const now = Date.now();
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    return applications
      .filter((app) => {
        // Must have been invited
        const sentAt = Date.parse(app.interviewInviteSentAt ?? "");
        if (!sentAt) return false;
        // Must not be accepted/booked
        if (["accepted"].includes(normalize(app.status))) return false;
        if (matchBookedSlot(app)) return false;
        // Use the latest of invite or reminder timestamp for the 2-day check
        const remindedAt = Date.parse(app.interviewReminderSentAt ?? "");
        const lastContactAt = remindedAt > sentAt ? remindedAt : sentAt;
        return now - lastContactAt >= twoDaysMs;
      })
      .map((app) => app.id);
  }, [applications, matchBookedSlot]);

  const selectableFilteredIds = useMemo(() => filtered.map((app) => app.id), [filtered]);



  const updateApplicantServer = async (id: string, patch: Record<string, unknown>) => {
    if (!user) throw new Error("not_authenticated");
    const token = await user.getIdToken();
    const res = await fetch("/api/members/applicants/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id, patch }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(typeof payload?.error === "string" ? payload.error : "update_failed");
    }
  };

  const sendInterviewInviteEmails = async (
    ids: string[],
    mode: "initial" | "reminder",
    allowAlreadyInvited = false
  ) => {
    if (!user || ids.length === 0) return { sent: 0, skipped: 0, failed: 0 };
    const token = await user.getIdToken();
    if (!token) return { sent: 0, skipped: 0, failed: ids.length };
    const response = await fetch("/api/members/applicants/interview-invite-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        mode,
        applicationIds: ids,
        allowAlreadyInvited,
      }),
    });
    if (!response.ok) throw new Error("send_invite_failed");
    const json = await response.json() as {
      sent?: number;
      skipped?: number;
      failed?: number;
    };
    return {
      sent: json.sent ?? 0,
      skipped: json.skipped ?? 0,
      failed: json.failed ?? 0,
    };
  };

  const sendInviteForApplicant = async (app: ApplicationRecord) => {
    setSendingInvites(true);
    try {
      const result = await sendInterviewInviteEmails([app.id], "initial", !!app.interviewInviteSentAt);
      setStatusMessage(`Invite email result — sent: ${result.sent}, skipped: ${result.skipped}, failed: ${result.failed}.`);
      await fetchApplicantsData();
    } catch {
      setStatusMessage("Could not send interview invite email.");
    } finally {
      setSendingInvites(false);
    }
  };

  const inviteAllUninvited = async () => {
    if (!canEdit || uninvitedApplicantIds.length === 0) {
      setStatusMessage("No uninvited applicants found.");
      return;
    }
    setSendingInvites(true);
    try {
      const result = await sendInterviewInviteEmails(uninvitedApplicantIds, "initial", false);
      setStatusMessage(`Invite all result — sent: ${result.sent}, skipped: ${result.skipped}, failed: ${result.failed}.`);
      await fetchApplicantsData();
    } catch {
      setStatusMessage("Could not send invite emails to all uninvited applicants.");
    } finally {
      setSendingInvites(false);
    }
  };

  const inviteSelected = async () => {
    if (!canEdit || selectedIds.length === 0) {
      setStatusMessage("Select at least one applicant.");
      return;
    }
    setSendingInvites(true);
    try {
      const result = await sendInterviewInviteEmails(selectedIds, "initial", false);
      setStatusMessage(`Invite selected result — sent: ${result.sent}, skipped: ${result.skipped}, failed: ${result.failed}.`);
      await fetchApplicantsData();
      setSelectionMode("none");
      setSelectedIds([]);
    } catch {
      setStatusMessage("Could not send invite emails to selected applicants.");
    } finally {
      setSendingInvites(false);
    }
  };

  const promoteApplicant = async (app: ApplicationRecord, shouldEmail: boolean, role: string) => {
    if (!user) throw new Error("not_authenticated");
    const token = await user.getIdToken();
    await updateApplicantServer(app.id, {
      status: "Accepted",
      finalDecisionRole: role,
    });
    await fetch("/api/members/applicants/promote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        fullName: app.fullName,
        email: app.email,
        schoolName: app.schoolName,
        grade: app.grade,
      }),
    });
    if (shouldEmail) {
      await fetch("/api/members/applicants/decision-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          applicantName: app.fullName,
          applicantEmail: app.email,
          decision: "Accepted",
          notes: "",
          role: role,
          tracks: app.tracksSelected || "",
        }),
      });
    }
  };

  const handleAcceptFromModal = async () => {
    if (!acceptModalApp) return;
    setBulkPromoting(true);
    try {
      await promoteApplicant(acceptModalApp, acceptSendEmail, acceptRole);
      setStatusMessage(`Accepted and added ${acceptModalApp.fullName} to member directory.`);
      await fetchApplicantsData();
      setAcceptModalApp(null);
    } catch {
      setStatusMessage(`Could not promote ${acceptModalApp.fullName}.`);
    } finally {
      setBulkPromoting(false);
    }
  };

  const skipInterviewForSelected = async () => {
    if (!canEdit || selectedIds.length === 0) {
      setStatusMessage("Select at least one applicant.");
      return;
    }
    setBulkPromoting(true);
    try {
      const selectedApps = applications.filter((app) => selectedIds.includes(app.id));
      let ok = 0;
      let failed = 0;
      for (const app of selectedApps) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await promoteApplicant(app, true, "Analyst");
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      setSelectedIds([]);
      setSelectionMode("none");
      setStatusMessage(`Accept selected complete — ${ok} succeeded, ${failed} failed.`);
      await fetchApplicantsData();
    } finally {
      setBulkPromoting(false);
    }
  };

  const remindUnbookedAfterTwoDays = async () => {
    if (unbookedReminderIds.length === 0) {
      setStatusMessage("No unbooked applicants need reminders right now.");
      return;
    }

    setSendingReminders(true);
    try {
      const result = await sendInterviewInviteEmails(unbookedReminderIds, "reminder", true);
      setStatusMessage(`Reminder result — sent: ${result.sent}, skipped: ${result.skipped}, failed: ${result.failed}.`);
      await fetchApplicantsData();
    } catch {
      setStatusMessage("Could not send reminder emails.");
    } finally {
      setSendingReminders(false);
    }
  };


  const updateRowStatus = async (app: ApplicationRecord, nextStatus: ApplicationStatus) => {
    if (!canManageStatus) return;
    try {
      await updateApplicantServer(app.id, { status: nextStatus, statusManualOverride: true });
      setStatusMessage(`Updated ${app.fullName} to ${nextStatus}.`);
      await fetchApplicantsData();
    } catch {
      setStatusMessage(`Could not update status for ${app.fullName}.`);
    }
  };

  const deleteApplicant = async (app: ApplicationRecord) => {
    if (!user || !canDelete) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/members/applicants/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: app.id }),
    });
    if (!res.ok) {
      setStatusMessage(`Could not delete ${app.fullName}.`);
      return;
    }
    setStatusMessage(`Deleted ${app.fullName}.`);
    await fetchApplicantsData();
  };

  const importCsv = async (file: File) => {
    setImporting(true);
    setStatusMessage("Importing...");
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) {
        setStatusMessage("CSV must include at least one data row.");
        return;
      }

      const headers = rows[0];
      const nameIdx = findHeaderIndex(headers, ["full name", "name"]);
      const emailIdx = findHeaderIndex(headers, ["email", "email address"]);
      const schoolIdx = findHeaderIndex(headers, ["school name", "education", "school", "high school"]);
      const gradeIdx = findHeaderIndex(headers, ["grade", "class year", "year"]);
      const cityStateIdx = findHeaderIndex(headers, ["city state", "city, state"]);
      const cityIdx = findHeaderIndex(headers, ["city"]);
      const stateIdx = findHeaderIndex(headers, ["state"]);
      const referralIdx = findHeaderIndex(headers, ["how they heard", "referral", "heard about", "source"]);
      const tracksIdx = findHeaderIndex(headers, ["tracks selected", "tracks", "track"]);
      const statusIdx = findHeaderIndex(headers, ["status", "application status", "progress"]);
      const notesIdx = findHeaderIndex(headers, ["notes", "note"]);
      const timestampIdx = findHeaderIndex(headers, ["timestamp", "created at", "date"]);
      const resumeIdx = findHeaderIndex(headers, ["resume url", "resume"]);
      const sentInviteIdx = findHeaderIndex(headers, ["send invite to interview"]);

      if (nameIdx === -1 && emailIdx === -1) {
        setStatusMessage("CSV must include at least Name or Email headers.");
        return;
      }

      const importRows = rows.slice(1).map((row) => {
        const fullName = nameIdx === -1 ? "" : (row[nameIdx] ?? "").trim();
        const email = emailIdx === -1 ? "" : (row[emailIdx] ?? "").trim().toLowerCase();
        const parsedSchool = schoolIdx === -1 ? "" : (row[schoolIdx] ?? "").trim();
        const parsedGrade = gradeIdx === -1 ? "" : (row[gradeIdx] ?? "").trim();
        const parsedCity = cityStateIdx !== -1
          ? (row[cityStateIdx] ?? "").trim()
          : [cityIdx === -1 ? "" : String(row[cityIdx] ?? "").trim(), stateIdx === -1 ? "" : String(row[stateIdx] ?? "").trim()]
            .filter(Boolean)
            .join(", ");
        const parsedReferral = referralIdx === -1 ? "" : (row[referralIdx] ?? "").trim();
        const parsedTracks = tracksIdx === -1 ? "" : (row[tracksIdx] ?? "").trim();
        const parsedStatusRaw = statusIdx === -1 ? "" : (row[statusIdx] ?? "").trim();
        const parsedNotes = notesIdx === -1 ? "" : (row[notesIdx] ?? "").trim();
        const parsedTimestampRaw = timestampIdx === -1 ? "" : (row[timestampIdx] ?? "").trim();
        const parsedResumeUrl = resumeIdx === -1 ? "" : (row[resumeIdx] ?? "").trim();
        const parsedInviteFlag = sentInviteIdx === -1 ? "" : (row[sentInviteIdx] ?? "").trim().toLowerCase();

        return {
          fullName,
          email,
          schoolName: parsedSchool,
          grade: parsedGrade,
          cityState: parsedCity,
          referral: parsedReferral,
          tracksSelected: parsedTracks,
          statusRaw: parsedStatusRaw,
          notes: parsedNotes,
          timestampRaw: parsedTimestampRaw,
          resumeUrl: parsedResumeUrl,
          inviteSent: parsedInviteFlag === "true" || parsedInviteFlag === "yes",
        };
      }).filter((entry) => entry.fullName || entry.email);

      if (importRows.length === 0) {
        setStatusMessage("CSV has no usable rows.");
        return;
      }

      const token = await user?.getIdToken();
      if (!token) {
        setStatusMessage("You are not authenticated. Please sign in again.");
        return;
      }

      const response = await fetch("/api/members/applicants/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rows: importRows }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const code = typeof payload?.error === "string" ? payload.error : "import_failed";
        throw new Error(code);
      }

      const result = await response.json() as { added?: number; updated?: number; skipped?: number };
      setStatusMessage(`Import complete: ${result.added ?? 0} added, ${result.updated ?? 0} updated, ${result.skipped ?? 0} skipped.`);
      await fetchApplicantsData();
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "unknown_error";
      setStatusMessage(`Could not import CSV (${message}).`);
    } finally {
      setImporting(false);
    }
  };

  const onCsvInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importCsv(file);
    e.target.value = "";
  };

  const visibleColumns = ALL_COLUMNS.filter((col) => !hiddenColumns.has(col.key));

  const hideColumn = (key: ColumnKey) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const showColumn = (key: ColumnKey) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const enterSelectionMode = (mode: "invite" | "accept") => {
    setSelectionMode(mode);
    setSelectedIds([]);
  };

  const exitSelectionMode = () => {
    setSelectionMode("none");
    setSelectedIds([]);
  };

  return (
    <MembersLayout>
      <Dialog />

      {/* Accept modal */}
      <Modal
        open={!!acceptModalApp}
        onClose={() => {
          if (bulkPromoting) return;
          setAcceptModalApp(null);
        }}
        title="Accept Applicant"
      >
        <div className="space-y-3">
          <p className="text-white/60 text-sm font-body">
            {acceptModalApp ? `${acceptModalApp.fullName} · ${acceptModalApp.email}` : ""}
          </p>
          <Field label="Team Role">
            <select
              value={acceptRole}
              onChange={(e) => setAcceptRole(e.target.value)}
              className="w-full bg-[#0F1014] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#85CC17]/45"
            >
              {["Analyst", "Senior Analyst", "Associate", "Senior Associate", "Project Lead"].map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </Field>
          <label className="inline-flex items-center gap-2 text-sm text-white/65">
            <input
              type="checkbox"
              checked={acceptSendEmail}
              onChange={(e) => setAcceptSendEmail(e.target.checked)}
              className="accent-[#85CC17]"
            />
            Send acceptance email
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="ghost" onClick={() => setAcceptModalApp(null)} disabled={bulkPromoting}>Cancel</Btn>
          <Btn variant="primary" onClick={() => void handleAcceptFromModal()} disabled={bulkPromoting}>
            {bulkPromoting ? "Accepting..." : "Accept"}
          </Btn>
        </div>
      </Modal>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={onCsvInputChange}
      />

      <PageHeader
        title="Applicants"
        subtitle={`${filtered.length} shown · ${applications.length} total`}
      />

      {canEdit && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <Btn
            variant="secondary"
            onClick={inviteAllUninvited}
            disabled={sendingInvites || uninvitedApplicantIds.length === 0}
          >
            {sendingInvites ? "Sending..." : `Invite All Uninvited (${uninvitedApplicantIds.length})`}
          </Btn>
          <Btn variant="secondary" onClick={remindUnbookedAfterTwoDays} disabled={sendingReminders || sendingInvites || unbookedReminderIds.length === 0} className={unbookedReminderIds.length === 0 ? "opacity-50" : ""}>
            {sendingReminders ? "Sending reminders..." : `Remind Unbooked (${unbookedReminderIds.length})`}
          </Btn>
          <Btn variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? "Importing..." : "Import CSV"}
          </Btn>
        </div>
      )}

      {statusMessage && <p className="text-xs text-white/55 mb-4">{statusMessage}</p>}

      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <SearchBar value={search} onChange={setSearch} placeholder="Search applicants, schools, status..." />
        <label className="inline-flex items-center gap-2 text-xs text-white/65">
          <input
            type="checkbox"
            checked={showAcceptedApplicants}
            onChange={(e) => setShowAcceptedApplicants(e.target.checked)}
            className="appearance-none w-4 h-4 border border-white/20 rounded-sm bg-black/20 checked:bg-[#85CC17] checked:border-[#85CC17] focus:outline-none transition-colors cursor-pointer relative after:content-[''] after:absolute after:hidden checked:after:block after:left-1.5 after:top-0.5 after:w-1 after:h-2 after:border-r-2 after:border-b-2 after:border-black after:rotate-45"
          />
          Show accepted applicants
        </label>
        {canEdit && selectionMode === "none" && (
          <>
            <Btn
              size="sm"
              variant="secondary"
              onClick={() => enterSelectionMode("invite")}
            >
              Invite Multiple
            </Btn>
            <Btn
              size="sm"
              variant="primary"
              onClick={() => enterSelectionMode("accept")}
            >
              Accept Multiple
            </Btn>
          </>
        )}
        {canEdit && selectionMode !== "none" && (
          <>
            <span className="text-xs text-white/55">{selectedIds.length} selected</span>
            {selectionMode === "invite" && (
              <Btn
                size="sm"
                variant="secondary"
                onClick={inviteSelected}
                disabled={sendingInvites || selectedIds.length === 0}
              >
                {sendingInvites ? "Sending..." : `Send Invites (${selectedIds.length})`}
              </Btn>
            )}
            {selectionMode === "accept" && (
              <Btn
                size="sm"
                variant="primary"
                onClick={skipInterviewForSelected}
                disabled={bulkPromoting || selectedIds.length === 0}
              >
                {bulkPromoting ? "Processing..." : `Accept (${selectedIds.length})`}
              </Btn>
            )}
            <Btn size="sm" variant="ghost" onClick={exitSelectionMode}>
              Cancel
            </Btn>
          </>
        )}
      </div>

      <div className="bg-[#1C1F26] border border-white/8 rounded-xl overflow-x-auto">
        <table className="w-full text-[11px] leading-4">
          <thead className="bg-[#0F1014] border-b border-white/8">
            <tr>
              {selectionMode !== "none" && (
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-white/45 w-[32px]">
                  <input
                    type="checkbox"
                    className="accent-[#85CC17]"
                    checked={selectableFilteredIds.length > 0 && selectableFilteredIds.every((id) => selectedIds.includes(id))}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(selectableFilteredIds);
                      else setSelectedIds([]);
                    }}
                  />
                </th>
              )}
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  className={`px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-white/45 whitespace-nowrap ${COLUMN_WIDTH[col.key] ?? ""} group/col`}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {col.label}
                    {col.key !== "actions" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          hideColumn(col.key);
                        }}
                        className="ml-1 text-[9px] text-white/0 group-hover/col:text-white/30 hover:!text-white/60 transition-colors"
                        title={`Hide ${col.label}`}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </th>
              ))}
              {/* Inline + buttons for hidden columns */}
              {Array.from(hiddenColumns).map((key) => {
                const col = ALL_COLUMNS.find((c) => c.key === key);
                return (
                  <th
                    key={`hidden-${key}`}
                    className="px-1 py-2 text-center w-[28px] cursor-pointer"
                    title={`Show ${col?.label ?? key}`}
                    onClick={() => showColumn(key)}
                  >
                    <span className="text-[10px] text-white/30 hover:text-white/60 transition-colors">+</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((app) => {
              const latestInterview = matchBookedSlot(app);
              const showResume = canViewResumeForApp(app);
              return (
                <tr key={app.id} className="hover:bg-white/3 transition-colors">
                  {selectionMode !== "none" && (
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        className="accent-[#85CC17]"
                        checked={selectedIds.includes(app.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds((prev) => Array.from(new Set([...prev, app.id])));
                          else setSelectedIds((prev) => prev.filter((id) => id !== app.id));
                        }}
                      />
                    </td>
                  )}
                  {visibleColumns.map((col) => {
                    switch (col.key) {
                      case "status":
                        return (
                          <td key={col.key} className="px-2 py-1.5">
                            {canManageStatus ? (
                              <select
                                value={STATUS_OPTIONS.includes(app.status) ? app.status : "New"}
                                onChange={(e) => void updateRowStatus(app, e.target.value as ApplicationStatus)}
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold focus:outline-none ${STATUS_BADGE_CLASS[app.status] ?? STATUS_BADGE_CLASS["New"]}`}
                              >
                                {STATUS_OPTIONS.map((status) => (
                                  <option key={status} value={status}>{status}</option>
                                ))}
                              </select>
                            ) : (
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE_CLASS[app.status] ?? STATUS_BADGE_CLASS["New"]}`}>
                                {app.status}
                              </span>
                            )}
                          </td>
                        );
                      case "name":
                        return (
                          <td key={col.key} className="px-2 py-1.5 text-white/85">
                            <span className="block truncate" title={app.fullName}>{app.fullName}</span>
                          </td>
                        );
                      case "email":
                        return (
                          <td key={col.key} className="px-2 py-1.5 text-white/60 font-mono">
                            <span className="block break-all" title={app.email}>{app.email}</span>
                          </td>
                        );
                      case "school":
                        return (
                          <td key={col.key} className="px-2 py-1.5 text-white/55 whitespace-nowrap">
                            <span className="block truncate" title={app.schoolName || ""}>{app.schoolName || "—"}</span>
                          </td>
                        );
                      case "cityState":
                        return (
                          <td key={col.key} className="px-2 py-1.5 text-white/50 whitespace-nowrap">
                            <span className="block truncate" title={app.cityState || ""}>{app.cityState || "—"}</span>
                          </td>
                        );
                      case "referral":
                        return (
                          <td key={col.key} className="px-2 py-1.5 text-white/50 whitespace-nowrap">
                            <span className="block truncate" title={app.referral || ""}>{app.referral || "—"}</span>
                          </td>
                        );
                      case "tracks":
                        return (
                          <td key={col.key} className="px-2 py-1.5 text-white/50 whitespace-nowrap">
                            <span className="block truncate" title={app.tracksSelected || ""}>{app.tracksSelected || "—"}</span>
                          </td>
                        );
                      case "resume":
                        return (
                          <td key={col.key} className="px-2 py-1.5">
                            {app.resumeUrl && showResume ? (
                              <a
                                href={app.resumeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#85CC17]/80 hover:text-[#85CC17] underline whitespace-nowrap"
                              >
                                Resume
                              </a>
                            ) : (
                              <span className="text-white/30">N/A</span>
                            )}
                          </td>
                        );
                      case "evals": {
                        const hasEval = Object.keys(app.interviewEvaluations || {}).length > 0;
                        return (
                          <td key={col.key} className="px-2 py-1.5 text-center">
                            {hasEval ? (
                              <button
                                onClick={() => setViewingEvaluationsApp(app)}
                                className="w-2.5 h-2.5 rounded-full bg-[#85CC17] inline-block shadow-[0_0_8px_rgba(133,204,23,0.4)] hover:shadow-[0_0_12px_rgba(133,204,23,0.6)] transition-shadow"
                                title="Click to view evaluation"
                              />
                            ) : (
                              <span className="text-white/20">—</span>
                            )}
                          </td>
                        );
                      }
                      case "applied":
                        return (
                          <td key={col.key} className="px-2 py-1.5 text-white/45 whitespace-nowrap">{formatDateTime(app.createdAt)}</td>
                        );
                      case "invite": {
                        const sentAt = app.interviewInviteSentAt ? Date.parse(app.interviewInviteSentAt) : 0;
                        const remAt = app.interviewReminderSentAt ? Date.parse(app.interviewReminderSentAt) : 0;
                        const latestTs = remAt > sentAt ? app.interviewReminderSentAt : app.interviewInviteSentAt;
                        return (
                          <td key={col.key} className="px-2 py-1.5">
                            {latestTs ? (
                              <span className="text-white/65 whitespace-nowrap">{formatDateTime(latestTs)}</span>
                            ) : (
                              <span className="text-white/30">Not sent</span>
                            )}
                          </td>
                        );
                      }
                      case "interview":
                        return (
                          <td key={col.key} className="px-2 py-1.5">
                            {latestInterview ? (
                              <div className="text-white/65">
                                <div className="whitespace-nowrap">{formatDateTime(latestInterview.datetime)}</div>
                              </div>
                            ) : (
                              <span className="text-white/30">Not booked</span>
                            )}
                          </td>
                        );
                      case "actions":
                        return (
                          <td key={col.key} className="px-2 py-1.5 whitespace-nowrap">
                            <div className="flex gap-1 flex-nowrap">
                              {canEdit && (
                                <>
                                  <Btn
                                    size="sm"
                                    variant="secondary"
                                    className="!px-2 !py-0.5 !text-[10px] leading-none whitespace-nowrap"
                                    onClick={() => sendInviteForApplicant(app)}
                                    disabled={sendingInvites || sendingReminders}
                                  >
                                    {app.interviewInviteSentAt ? "Resend Invite" : "Send Invite"}
                                  </Btn>
                                  <Btn
                                    size="sm"
                                    variant="primary"
                                    className="!px-2 !py-0.5 !text-[10px] leading-none whitespace-nowrap"
                                    onClick={() => {
                                      setAcceptRole(app.finalDecisionRole || "Analyst");
                                      setAcceptSendEmail(true);
                                      setAcceptModalApp(app);
                                    }}
                                    disabled={bulkPromoting}
                                  >
                                    Accept
                                  </Btn>
                                  {canDelete && (
                                    <Btn
                                      size="sm"
                                      variant="danger"
                                      className="!px-2 !py-0.5 !text-[10px] leading-none whitespace-nowrap"
                                      onClick={() => {
                                        void ask(
                                          async () => {
                                            await deleteApplicant(app);
                                          },
                                          `Delete ${app.fullName}? This will permanently remove them from /members/applicants.`
                                        );
                                      }}
                                    >
                                      Delete
                                    </Btn>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        );
                      default:
                        return null;
                    }
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {loadingData ? <p className="text-xs text-white/40 mt-3">Loading applicants...</p> : null}
      {!loadingData && filtered.length === 0 && <Empty message="No applicants yet." />}

      {/* Evaluation viewer modal */}
      <Modal
        open={!!viewingEvaluationsApp}
        onClose={() => setViewingEvaluationsApp(null)}
        title="Interview Evaluations"
      >
        <div className="space-y-4">
          <p className="text-white/60 text-sm font-body">
            Evaluations for <span className="text-white font-semibold">{viewingEvaluationsApp?.fullName}</span>
          </p>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {viewingEvaluationsApp && Object.values(viewingEvaluationsApp.interviewEvaluations || {}).length > 0 ? (
              Object.values(viewingEvaluationsApp.interviewEvaluations || {})
                .sort((a, b) => new Date(b?.updatedAt || 0).getTime() - new Date(a?.updatedAt || 0).getTime())
                .map((ev, idx) => (
                  <div key={idx} className="bg-white/3 border border-white/5 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="text-xs font-semibold text-white/90">{ev?.interviewerName || "Unknown"}</div>
                        <div className="text-[10px] text-white/40">{ev?.updatedAt ? new Date(ev.updatedAt).toLocaleString() : ""}</div>
                      </div>
                      <div className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        ev?.rating === "Extremely Qualified" ? "bg-[#85CC17]/20 text-[#C4F135]" :
                        ev?.rating === "Qualified" ? "bg-blue-500/20 text-blue-400" :
                        ev?.rating === "Decent" ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-red-500/20 text-red-400"
                      }`}>
                        {ev?.rating || "No Rating"}
                      </div>
                    </div>
                    {ev?.comments && (
                      <div className="text-sm text-white/70 whitespace-pre-wrap font-body bg-black/20 p-2 rounded border border-white/5 italic">
                        &quot;{ev.comments}&quot;
                      </div>
                    )}
                  </div>
                ))
            ) : (
              <div className="text-center py-8 text-white/20 italic text-sm">No evaluations yet.</div>
            )}
          </div>
          <div className="flex justify-end pt-2">
            <Btn variant="secondary" onClick={() => setViewingEvaluationsApp(null)}>Close</Btn>
          </div>
        </div>
      </Modal>
    </MembersLayout>
  );
}
