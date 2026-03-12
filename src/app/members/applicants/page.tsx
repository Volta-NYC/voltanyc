"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MembersLayout from "@/components/members/MembersLayout";
import {
  Btn, Empty, Field, Input, Modal, PageHeader, SearchBar, TextArea,
} from "@/components/members/ui";
import {
  createApplicationRecord,
  createInterviewInvite,
  subscribeApplications,
  subscribeInterviewSlots,
  type ApplicationRecord,
  type ApplicationStatus,
  type InterviewSlot,
  updateApplicationRecord,
} from "@/lib/members/storage";
import { generateToken } from "@/lib/interviews";
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

function parseTimestamp(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return new Date().toISOString();
  const asDate = new Date(trimmed);
  if (!Number.isNaN(asDate.getTime())) return asDate.toISOString();

  // Common legacy format: M/D/YYYY h:mm:ss AM/PM
  const maybe = Date.parse(trimmed.replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/, "$3-$1-$2"));
  if (!Number.isNaN(maybe)) return new Date(maybe).toISOString();
  return new Date().toISOString();
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

function coerceStatus(raw: string): ApplicationStatus {
  const key = normalize(raw);
  if (key.includes("invite")) return "Interview Pending";
  if (key.includes("review")) return "Reviewing";
  if (key.includes("interview") && key.includes("schedule")) return "Interview Scheduled";
  if (key.includes("interview")) return "Interview Pending";
  if (key.includes("accept")) return "Accepted";
  if (key.includes("wait")) return "Waitlisted";
  if (key.includes("reject") || key.includes("not accepted")) return "Not Accepted";
  return "New";
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
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<ApplicationRecord | null>(null);
  const [editStatus, setEditStatus] = useState<ApplicationStatus>("New");
  const [editNotes, setEditNotes] = useState("");
  const [sendDecisionEmail, setSendDecisionEmail] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { authRole, user } = useAuth();
  const canEdit = authRole === "admin" || authRole === "project_lead";

  useEffect(() => subscribeApplications(setApplications), []);
  useEffect(() => subscribeInterviewSlots(setSlots), []);

  const bookedSlots = useMemo(
    () => [...slots]
      .filter((slot) => !slot.available)
      .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime()),
    [slots],
  );

  const matchBookedSlot = (app: ApplicationRecord): InterviewSlot | undefined => {
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
  };

  const filtered = useMemo(() => {
    const q = normalize(search);
    return [...applications]
      .filter((app) => {
        if (!q) return true;
        return normalize(app.fullName).includes(q)
          || normalize(app.email).includes(q)
          || normalize(app.schoolName ?? "").includes(q)
          || normalize(app.status).includes(q);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [applications, search]);

  const openEdit = (app: ApplicationRecord) => {
    setEditing(app);
    setEditStatus(app.status || "New");
    setEditNotes(app.notes ?? "");
    setSendDecisionEmail(false);
    setStatusMessage(null);
  };

  const createInterviewLink = async (app: ApplicationRecord) => {
    if (!user) return;
    const token = generateToken(16);
    const expiresAt = Date.now() + 120 * 24 * 60 * 60 * 1000;
    await createInterviewInvite(token, {
      applicantName: app.fullName,
      applicantEmail: app.email,
      role: "applicant",
      expiresAt,
      status: "pending",
      createdAt: Date.now(),
      createdBy: user.uid,
      multiUse: false,
      note: "Generated from applicants pipeline",
    });
    await updateApplicationRecord(app.id, {
      interviewInviteToken: token,
      status: "Interview Pending",
    });
    const url = `${window.location.origin}/book/${token}`;
    await navigator.clipboard.writeText(url);
    setStatusMessage("Interview link created and copied.");
  };

  const sendInterviewInviteEmails = async (ids: string[], mode: "initial" | "reminder") => {
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
      const result = await sendInterviewInviteEmails([app.id], "initial");
      setStatusMessage(`Invite email result — sent: ${result.sent}, skipped: ${result.skipped}, failed: ${result.failed}.`);
    } catch {
      setStatusMessage("Could not send interview invite email.");
    } finally {
      setSendingInvites(false);
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
      await updateApplicationRecord(editing.id, {
        status: editStatus,
        notes: editNotes.trim(),
      });

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
      setStatusMessage(
        decisionEmailFailed
          ? "Applicant updated, but decision email could not be sent."
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

      const existingByKey = new Map<string, ApplicationRecord>();
      const existingByEmail = new Map<string, ApplicationRecord>();
      const existingByName = new Map<string, ApplicationRecord[]>();
      applications.forEach((app) => {
        const nameKey = normalize(app.fullName);
        const emailKey = normalize(app.email);
        const key = `${nameKey}|${emailKey}`;
        existingByKey.set(key, app);
        if (emailKey) existingByEmail.set(emailKey, app);
        if (nameKey) {
          const arr = existingByName.get(nameKey) ?? [];
          arr.push(app);
          existingByName.set(nameKey, arr);
        }
      });

      let added = 0;
      let updated = 0;
      for (const row of rows.slice(1)) {
        const fullName = nameIdx === -1 ? "" : (row[nameIdx] ?? "").trim();
        const email = emailIdx === -1 ? "" : (row[emailIdx] ?? "").trim().toLowerCase();
        if (!fullName && !email) continue;
        const key = `${normalize(fullName)}|${normalize(email)}`;
        let existing = existingByKey.get(key);
        if (!existing && email) existing = existingByEmail.get(normalize(email));
        if (!existing && fullName) {
          const candidates = existingByName.get(normalize(fullName)) ?? [];
          if (candidates.length === 1) [existing] = candidates;
        }
        const importedCreatedAt = timestampIdx !== -1 ? parseTimestamp(row[timestampIdx] ?? "") : new Date().toISOString();
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

        const patch: Partial<ApplicationRecord> = {
          fullName: fullName || (existing?.fullName ?? ""),
          email: email || (existing?.email ?? ""),
          source: "csv_import",
        };
        if (parsedSchool) patch.schoolName = parsedSchool;
        if (parsedGrade) patch.grade = parsedGrade;
        if (parsedCity) patch.cityState = parsedCity;
        if (parsedReferral) patch.referral = parsedReferral;
        if (parsedTracks) patch.tracksSelected = parsedTracks;
        if (parsedStatusRaw) patch.status = coerceStatus(parsedStatusRaw);
        if (parsedNotes) patch.notes = parsedNotes;
        if (parsedTimestampRaw) patch.sourceTimestampRaw = parsedTimestampRaw;
        if (parsedResumeUrl) {
          patch.resumeUrl = parsedResumeUrl;
          patch.hasResume = "Yes";
        }
        if (parsedInviteFlag === "true" || parsedInviteFlag === "yes") {
          patch.interviewInviteSentAt = importedCreatedAt;
        }

        if (existing) {
          if (!patch.fullName && !patch.email) {
            continue;
          }
          // eslint-disable-next-line no-await-in-loop
          await updateApplicationRecord(existing.id, patch);
          updated += 1;
        } else {
          if (!fullName || !email) {
            continue;
          }
          // eslint-disable-next-line no-await-in-loop
          await createApplicationRecord({
            fullName: patch.fullName ?? fullName,
            email: patch.email ?? email,
            schoolName: parsedSchool,
            grade: parsedGrade,
            cityState: parsedCity,
            referral: parsedReferral,
            tracksSelected: parsedTracks,
            hasResume: "",
            resumeUrl: parsedResumeUrl,
            toolsSoftware: "",
            accomplishment: "",
            status: parsedStatusRaw ? coerceStatus(parsedStatusRaw) : "New",
            notes: parsedNotes,
            source: "csv_import",
            sourceTimestampRaw: parsedTimestampRaw,
            interviewInviteSentAt: parsedInviteFlag === "true" || parsedInviteFlag === "yes" ? importedCreatedAt : "",
            createdAt: importedCreatedAt,
            updatedAt: importedCreatedAt,
          });
          added += 1;
        }
      }
      setStatusMessage(`Import complete: ${added} added, ${updated} updated.`);
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

      <div className="flex gap-3 mb-4 flex-wrap">
        <SearchBar value={search} onChange={setSearch} placeholder="Search applicants, schools, status..." />
      </div>

      <div className="bg-[#1C1F26] border border-white/8 rounded-xl overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead className="bg-[#0F1014] border-b border-white/8">
            <tr>
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
              return (
                <tr key={app.id} className="hover:bg-white/3 transition-colors">
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
                      </div>
                    ) : (
                      <span className="text-white/30">Not booked</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-white/70">{app.status}</td>
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
                          <Btn size="sm" variant="secondary" onClick={() => createInterviewLink(app)}>Interview Link</Btn>
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

      {filtered.length === 0 && <Empty message="No applicants yet." />}

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
