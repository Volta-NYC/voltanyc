"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MembersLayout from "@/components/members/MembersLayout";
import {
  Btn, Empty, Field, Input, Modal, PageHeader, SearchBar, TextArea,
} from "@/components/members/ui";
import {
  type ApplicationRecord,
  type ApplicationStatus,
  type InterviewSlot,
} from "@/lib/members/storage";
import { useAuth } from "@/lib/members/authContext";

const STATUS_OPTIONS: ApplicationStatus[] = [
  "New",
  "Reviewing",
  "Interview Pending",
  "Interview Scheduled",
  "Accepted",
  "Waitlisted",
  "Not Accepted",
];

const DECISION_STATUSES = new Set<ApplicationStatus>(["Accepted", "Waitlisted", "Not Accepted"]);

function normalize(v: string): string {
  return v.trim().toLowerCase();
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

export default function ApplicantsPage() {
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [slots, setSlots] = useState<InterviewSlot[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [search, setSearch] = useState("");
  const [showAcceptedApplicants, setShowAcceptedApplicants] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [bulkPromoting, setBulkPromoting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<ApplicationRecord | null>(null);
  const [editStatus, setEditStatus] = useState<ApplicationStatus>("New");
  const [editNotes, setEditNotes] = useState("");
  const [sendDecisionEmail, setSendDecisionEmail] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { authRole, user } = useAuth();
  const canEdit = authRole === "admin" || authRole === "project_lead";
  const canView = canEdit || authRole === "interviewer";

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
      const slotRows = payload.slots && typeof payload.slots === "object"
        ? Object.entries(payload.slots).map(([id, row]) => ({ ...(row as InterviewSlot), id }))
        : [];
      setSlots(slotRows);
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
    return bookedSlots.find((slot) => {
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

  const filtered = useMemo(() => {
    const q = normalize(search);
    return [...applications]
      .filter((app) => {
        if (!showAcceptedApplicants && normalize(app.status) === "accepted") return false;
        if (!q) return true;
        return normalize(app.fullName).includes(q)
          || normalize(app.email).includes(q)
          || normalize(app.schoolName ?? "").includes(q)
          || normalize(app.status).includes(q);
      })
      .sort((a, b) => {
        const aInvited = !!a.interviewInviteSentAt;
        const bInvited = !!b.interviewInviteSentAt;
        if (aInvited !== bInvited) return aInvited ? 1 : -1; // uninvited first
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // newest first
      });
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

  const selectableFilteredIds = useMemo(() => filtered.map((app) => app.id), [filtered]);

  const openEdit = (app: ApplicationRecord) => {
    setEditing(app);
    setEditStatus(app.status || "New");
    setEditNotes(app.notes ?? "");
    setSendDecisionEmail(false);
    setStatusMessage(null);
  };

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
    } catch {
      setStatusMessage("Could not send invite emails to selected applicants.");
    } finally {
      setSendingInvites(false);
    }
  };

  const promoteApplicant = async (app: ApplicationRecord, shouldEmail: boolean) => {
    if (!user) throw new Error("not_authenticated");
    const token = await user.getIdToken();
    await updateApplicantServer(app.id, {
      status: "Accepted",
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
        }),
      });
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
          await promoteApplicant(app, true);
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      setSelectedIds([]);
      setStatusMessage(`Skip interview + accept complete — ${ok} succeeded, ${failed} failed.`);
      await fetchApplicantsData();
    } finally {
      setBulkPromoting(false);
    }
  };

  const remindUnbookedAfterTwoDays = async () => {
    const now = Date.now();
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    const targetIds = applications
      .filter((app) => {
        const sentAt = Date.parse(app.interviewInviteSentAt ?? "");
        if (!sentAt || now - sentAt < twoDaysMs) return false;
        const bookedSlot = matchBookedSlot(app);
        if (bookedSlot) return false;
        const remindedAt = Date.parse(app.interviewReminderSentAt ?? "");
        return !remindedAt || remindedAt < sentAt;
      })
      .map((app) => app.id);

    if (targetIds.length === 0) {
      setStatusMessage("No unbooked applicants need reminders right now.");
      return;
    }

    setSendingReminders(true);
    try {
      const result = await sendInterviewInviteEmails(targetIds, "reminder");
      setStatusMessage(`Reminder result — sent: ${result.sent}, skipped: ${result.skipped}, failed: ${result.failed}.`);
      await fetchApplicantsData();
    } catch {
      setStatusMessage("Could not send reminder emails.");
    } finally {
      setSendingReminders(false);
    }
  };

  const saveApplicant = async () => {
    if (!editing || !canEdit) return;
    setSaving(true);
    try {
      let decisionEmailFailed = false;
      let promoteFailed = false;
      await updateApplicantServer(editing.id, {
        status: editStatus,
        notes: editNotes.trim(),
      });

      if (editStatus === "Accepted") {
        const token = await user?.getIdToken();
        if (token) {
          const promoteResponse = await fetch("/api/members/applicants/promote", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              fullName: editing.fullName,
              email: editing.email,
              schoolName: editing.schoolName,
              grade: editing.grade,
            }),
          });
          if (!promoteResponse.ok) promoteFailed = true;
        } else {
          promoteFailed = true;
        }
      }

      const transitionedToDecision =
        editing.status !== editStatus && DECISION_STATUSES.has(editStatus);
      const shouldSendDecision = DECISION_STATUSES.has(editStatus) && (sendDecisionEmail || transitionedToDecision);
      if (shouldSendDecision) {
        const token = await user?.getIdToken();
        if (token) {
          const response = await fetch("/api/members/applicants/decision-email", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              applicantName: editing.fullName,
              applicantEmail: editing.email,
              decision: editStatus,
              notes: editNotes.trim(),
            }),
          });
          if (!response.ok) decisionEmailFailed = true;
        } else {
          decisionEmailFailed = true;
        }
      }

      setEditing(null);
      await fetchApplicantsData();
      setStatusMessage(
        [decisionEmailFailed ? "decision email could not be sent" : "", promoteFailed ? "accepted applicant could not be synced to Team Directory" : ""]
          .filter(Boolean)
          .join(" and ")
          ? `Applicant updated, but ${[decisionEmailFailed ? "decision email could not be sent" : "", promoteFailed ? "accepted applicant could not be synced to Team Directory" : ""].filter(Boolean).join(" and ")}.`
          : "Applicant updated."
      );
    } finally {
      setSaving(false);
    }
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

  return (
    <MembersLayout>
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
        action={
          canEdit ? (
            <div className="flex gap-2">
              <Btn
                variant="secondary"
                onClick={inviteAllUninvited}
                disabled={sendingInvites || uninvitedApplicantIds.length === 0}
              >
                {sendingInvites ? "Sending..." : `Invite All Uninvited (${uninvitedApplicantIds.length})`}
              </Btn>
              <Btn variant="secondary" onClick={remindUnbookedAfterTwoDays} disabled={sendingReminders || sendingInvites}>
                {sendingReminders ? "Sending reminders..." : "Remind Unbooked (2+ days)"}
              </Btn>
              <Btn variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                {importing ? "Importing..." : "Import CSV"}
              </Btn>
            </div>
          ) : undefined
        }
      />

      {statusMessage && <p className="text-xs text-white/55 mb-4">{statusMessage}</p>}

      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <SearchBar value={search} onChange={setSearch} placeholder="Search applicants, schools, status..." />
        <label className="inline-flex items-center gap-2 text-xs text-white/65">
          <input
            type="checkbox"
            checked={showAcceptedApplicants}
            onChange={(e) => setShowAcceptedApplicants(e.target.checked)}
            className="accent-[#85CC17]"
          />
          Show accepted applicants
        </label>
        {canEdit && (
          <>
            <Btn
              size="sm"
              variant="secondary"
              onClick={inviteSelected}
              disabled={sendingInvites || selectedIds.length === 0}
            >
              Invite Selected ({selectedIds.length})
            </Btn>
            <Btn
              size="sm"
              variant="primary"
              onClick={skipInterviewForSelected}
              disabled={bulkPromoting || selectedIds.length === 0}
            >
              {bulkPromoting ? "Processing..." : "Skip Interview + Accept Selected"}
            </Btn>
          </>
        )}
      </div>

      <div className="bg-[#1C1F26] border border-white/8 rounded-xl overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead className="bg-[#0F1014] border-b border-white/8">
            <tr>
              {canEdit && (
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/45">
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
              {["Name", "Email", "School", "Applied", "Invite Email", "Interview", "Status", "Actions"].map((col) => (
                <th key={col} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/45">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((app) => {
              const latestInterview = matchBookedSlot(app);
              const inviteSentAt = app.interviewInviteSentAt ? Date.parse(app.interviewInviteSentAt) : NaN;
              const bookedAt = latestInterview ? Date.parse(latestInterview.datetime) : NaN;
              const bookedAfterInvite = Number.isFinite(inviteSentAt) && Number.isFinite(bookedAt) && bookedAt >= inviteSentAt;
              const evalCount = Object.keys((app.interviewEvaluations ?? {}) as Record<string, unknown>).length;
              return (
                <tr key={app.id} className="hover:bg-white/3 transition-colors">
                  {canEdit && (
                    <td className="px-3 py-3">
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
                  <td className="px-4 py-3 text-white/85">{app.fullName}</td>
                  <td className="px-4 py-3 text-white/60 font-mono text-xs">{app.email}</td>
                  <td className="px-4 py-3 text-white/55 text-sm">{app.schoolName || "—"}</td>
                  <td className="px-4 py-3 text-white/45 text-xs">{formatDateTime(app.createdAt)}</td>
                  <td className="px-4 py-3 text-xs">
                    {app.interviewInviteSentAt ? (
                      <div className="text-white/65">
                        <div>{formatDateTime(app.interviewInviteSentAt)}</div>
                        {app.interviewReminderSentAt ? (
                          <div className="text-[11px] text-white/40 mt-1">Reminder: {formatDateTime(app.interviewReminderSentAt)}</div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-white/30">Not sent</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {latestInterview ? (
                      <div className="text-white/65">
                        <div>{formatDateTime(latestInterview.datetime)}</div>
                        {bookedAfterInvite ? (
                          <div className="text-[11px] text-emerald-300 mt-1">Booked after invite</div>
                        ) : null}
                        {evalCount > 0 ? (
                          <div className="text-[11px] text-white/40 mt-1">{evalCount} evaluation{evalCount > 1 ? "s" : ""}</div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-white/30">Not booked</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-white/70">
                    <div>{app.status}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {canEdit && (
                        <>
                          <Btn
                            size="sm"
                            variant="secondary"
                            onClick={() => sendInviteForApplicant(app)}
                            disabled={sendingInvites || sendingReminders}
                          >
                            {app.interviewInviteSentAt ? "Resend Invite" : "Send Invite"}
                          </Btn>
                          <Btn
                            size="sm"
                            variant="primary"
                            onClick={async () => {
                              setBulkPromoting(true);
                              try {
                                await promoteApplicant(app, true);
                                setStatusMessage(`Accepted and added ${app.fullName} to member directory.`);
                                await fetchApplicantsData();
                              } catch {
                                setStatusMessage(`Could not promote ${app.fullName}.`);
                              } finally {
                                setBulkPromoting(false);
                              }
                            }}
                            disabled={bulkPromoting}
                          >
                            Skip Interview + Accept
                          </Btn>
                          <Btn size="sm" variant="secondary" onClick={() => openEdit(app)}>Edit</Btn>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {loadingData ? <p className="text-xs text-white/40 mt-3">Loading applicants...</p> : null}
      {!loadingData && filtered.length === 0 && <Empty message="No applicants yet." />}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Applicant">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name">
            <Input value={editing?.fullName ?? ""} disabled />
          </Field>
          <Field label="Email">
            <Input value={editing?.email ?? ""} disabled />
          </Field>
          <Field label="Status">
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as ApplicationStatus)}
              className="w-full bg-[#0F1014] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#85CC17]/45"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </Field>
          <Field label="Interview Link">
            <Input value={editing?.interviewInviteToken ? `/book/${editing.interviewInviteToken}` : "Not created"} disabled />
          </Field>
          <div className="col-span-2">
            <Field label="Notes">
              <TextArea rows={6} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </Field>
          </div>
          <label className="col-span-2 inline-flex items-center gap-2 text-sm text-white/65">
            <input
              type="checkbox"
              checked={sendDecisionEmail}
              onChange={(e) => setSendDecisionEmail(e.target.checked)}
              className="accent-[#85CC17]"
            />
            Send decision email now (or resend one)
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
          <Btn variant="primary" onClick={saveApplicant} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Btn>
        </div>
      </Modal>
    </MembersLayout>
  );
}
