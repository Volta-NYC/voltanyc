// Firebase Realtime Database storage for the Volta NYC members portal.
// All data is shared in real-time across all authenticated users.
//
// IMPORTANT: Firebase Realtime Database does NOT store empty arrays or null
// values. If a field like `activeServices: []` is saved, Firebase omits it
// entirely on read. Every caller that uses array fields must guard with `?? []`
// to avoid "Cannot read properties of undefined" crashes.

import { ref, push, update, remove, onValue, get, set, off } from "firebase/database";
import { getDB, getAuth } from "@/lib/firebase";

// ── DATA TYPES ────────────────────────────────────────────────────────────────

export interface BID {
  id: string;
  name: string;
  status: "Active Partner" | "In Conversation" | "Outreach" | "Paused" | "Dead";
  contactName: string;
  contactEmail: string;
  phone: string;
  borough: string;
  nextAction: string;
  notes: string;
  priority: "High" | "Medium" | "Low";
  timeline?: Record<string, {
    date: string;
    action?: string;
    // Legacy fields retained for backward compatibility with existing entries.
    type?: string;
    note?: string;
    createdAt: string;
  }>;
  sortIndex?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Business {
  id: string;
  name: string;
  bidId: string;
  ownerName: string;
  ownerEmail: string;
  ownerAlternateEmail: string;
  phone: string;
  alternatePhone: string;
  address: string;
  website: string;
  activeServices: string[];   // may be undefined if Firebase omitted empty array
  projectStatus: "Not Started" | "Discovery" | "Active" | "On Hold" | "Complete";
  teamLead: string;
  languages: string[];        // may be undefined if Firebase omitted empty array
  firstContactDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  // Project-level fields (merged from Projects tab)
  division?: "Tech" | "Marketing" | "Finance";
  teamMembers?: string[];     // may be undefined if Firebase omitted empty array
  githubUrl?: string;
  driveFolderUrl?: string;
  clientNotes?: string;
  sortIndex?: number;
}

export interface Task {
  id: string;
  name: string;
  // "In Progress" and "Blocked" are legacy values retained for backward compatibility.
  status: "To Do" | "On Hold" | "In Progress" | "Blocked" | "Done";
  priority: "Urgent" | "High" | "Medium" | "Low";
  assignedTo: string;
  businessId: string;
  division: "Tech" | "Marketing" | "Finance" | "Outreach";
  dueDate: string;
  week: string;
  notes: string;
  blocker: string;
  sortIndex?: number;
  createdAt: string;
  completedAt: string;
}

export interface Grant {
  id: string;
  name: string;
  funder: string;
  amount: string;
  deadline: string;
  businessIds: string[];          // may be undefined if Firebase omitted empty array
  neighborhoodFocus: string[];    // may be undefined if Firebase omitted empty array
  category: "Government" | "Foundation" | "Corporate" | "CDFI" | "Other";
  status: "Researched" | "Application In Progress" | "Submitted" | "Awarded" | "Rejected" | "Cycle Closed";
  assignedResearcher: string;
  likelihood: "High" | "Medium" | "Low";
  requirements: string;
  applicationUrl: string;
  notes: string;
  cycleFrequency: "Annual" | "Biannual" | "Rolling" | "One-Time";
  createdAt: string;
}

export interface TeamMember {
  id: string;
  name: string;
  school: string;
  grade?: string;
  divisions: string[];    // may be undefined if Firebase omitted empty array
  pod: string;
  role: "Team Lead" | "Member" | "Associate" | "Advisor";
  slackHandle: string;
  email: string;
  alternateEmail?: string;
  status: "Active" | "On Leave" | "Alumni" | "Inactive";
  skills: string[];       // may be undefined if Firebase omitted empty array
  joinDate: string;
  notes: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  businessId: string;
  division: "Tech" | "Marketing" | "Finance";
  status: "Planning" | "Active" | "On Hold" | "Delivered" | "Complete";
  teamLead: string;
  teamMembers: string[];  // may be undefined if Firebase omitted empty array
  startDate: string;
  targetEndDate: string;
  actualEndDate: string;
  week1Deliverable: string;
  finalDeliverable: string;
  slackChannel: string;
  driveFolderUrl: string;
  clientNotes: string;
  progress: "0%" | "25%" | "50%" | "75%" | "100%";
  createdAt: string;
  updatedAt: string;
}

// ── Auth and invite types ─────────────────────────────────────────────────────

export type AuthRole = "admin" | "project_lead" | "interviewer" | "member";

export interface UserProfile {
  id: string;       // Firebase Auth UID, set to the snapshot key by snapToList
  email: string;
  authRole: AuthRole;
  name?: string;
  school?: string;
  grade?: string;
  active: boolean;
  createdAt: string;
}

export interface InviteCode {
  id: string;
  code: string;     // e.g. "VOLTA-AB3X7C"
  role: AuthRole;
  expiresAt: string;  // ISO date string, or "never"
  used: boolean;
  usedBy?: string;    // email address of the user who redeemed it
  usedAt?: string;
  createdBy: string;  // uid of the admin who generated it
  createdAt: string;
}

// ── Calendar event type ───────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;        // ISO datetime string
  end: string;          // ISO datetime string
  iCalUID?: string;
  description?: string;
  color?: string;       // hex color, e.g. "#85CC17"
  allDay?: boolean;
  createdBy: string;    // uid
  createdAt: number;    // Unix ms timestamp
}

// ── Interview scheduling types ────────────────────────────────────────────────

export type InterviewStatus = "pending" | "booked" | "expired" | "cancelled";

export interface InterviewInvite {
  id: string;             // the booking token used as the Firebase key
  applicantName?: string; // only set for single-use invites
  applicantEmail?: string;
  role: string;
  expiresAt: number;      // Unix ms timestamp
  bookedSlotId?: string;  // only for single-use invites
  status: InterviewStatus;
  multiUse?: boolean;     // if true, link can be used by multiple applicants
  createdBy: string;      // uid
  createdAt: number;      // Unix ms timestamp
  note?: string;
}

export interface InterviewSlot {
  id: string;
  datetime: string;       // ISO datetime (UTC)
  durationMinutes: number;
  available: boolean;
  bookedBy?: string;      // booking token that reserved this slot
  bookerName?: string;    // name entered by applicant at booking time
  bookerEmail?: string;   // email entered by applicant at booking time
  interviewerName?: string;
  interviewerNames?: string[];
  location?: string;
  createdBy: string;      // uid
  createdAt: number;      // Unix ms timestamp
}

export interface InterviewSettings {
  zoomLink?: string;
  zoomEnabled?: boolean;
  updatedAt?: number;
  updatedBy?: string;
}

export type AuditAction = "create" | "update" | "delete" | "import" | "export";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  collection: string;
  recordId?: string;
  actorUid: string;
  actorEmail: string;
  actorName?: string;
  details?: Record<string, unknown>;
}

// ── INTERNAL HELPERS ──────────────────────────────────────────────────────────

// Returns the current time as an ISO string, used for createdAt / updatedAt fields.
function nowISO(): string {
  return new Date().toISOString();
}

function getAuditActor() {
  const auth = getAuth();
  const user = auth?.currentUser;
  return {
    actorUid: user?.uid ?? "unknown",
    actorEmail: user?.email ?? "unknown",
    actorName: user?.displayName ?? "",
  };
}

async function writeAuditLog(
  db: NonNullable<ReturnType<typeof getDB>>,
  entry: Omit<AuditLogEntry, "id" | "timestamp" | "actorUid" | "actorEmail" | "actorName">
): Promise<void> {
  try {
    const actor = getAuditActor();
    await push(ref(db, "auditLogs"), {
      timestamp: nowISO(),
      ...actor,
      ...entry,
    });
  } catch (err) {
    // Do not block primary writes if audit logging fails.
    console.error("Audit log write failed:", err);
  }
}

// Converts a Firebase snapshot object into a typed array.
// Firebase stores collections as plain objects keyed by push-ID; this turns
// them back into arrays and injects each item's Firebase key as its `id` field.
function snapToList<T>(snap: import("firebase/database").DataSnapshot): T[] {
  const val = snap.val();
  if (!val) return [];
  return Object.entries(val).map(([id, data]) => ({ ...(data as object), id } as T));
}

// Factory that creates a real-time subscriber function for a given database path.
// Returns a function that registers the listener and returns an unsubscribe callback.
function makeSubscriber<T>(path: string) {
  return (callback: (items: T[]) => void): (() => void) => {
    const database = getDB();
    if (!database) {
      callback([]);
      return () => {};
    }
    const dbRef = ref(database, path);
    const handler = onValue(dbRef, (snap) => callback(snapToList<T>(snap)));
    return () => off(dbRef, "value", handler);
  };
}

// ── REAL-TIME SUBSCRIBERS ─────────────────────────────────────────────────────

export const subscribeBIDs        = makeSubscriber<BID>("bids");
export const subscribeBusinesses  = makeSubscriber<Business>("businesses");
export const subscribeTasks       = makeSubscriber<Task>("tasks");
export const subscribeGrants      = makeSubscriber<Grant>("grants");
export const subscribeTeam        = makeSubscriber<TeamMember>("team");
export const subscribeProjects    = makeSubscriber<Project>("projects");
export const subscribeAuditLogs   = makeSubscriber<AuditLogEntry>("auditLogs");

// ── BIDs ──────────────────────────────────────────────────────────────────────

export async function createBID(data: Omit<BID, "id" | "createdAt" | "updatedAt">): Promise<void> {
  const db = getDB();
  if (!db) return;
  const bidRef = push(ref(db, "bids"));
  await set(bidRef, { ...data, createdAt: nowISO(), updatedAt: nowISO() });
  await writeAuditLog(db, {
    action: "create",
    collection: "bids",
    recordId: bidRef.key ?? "",
    details: { fields: Object.keys(data) },
  });
}

export async function updateBID(id: string, data: Partial<BID>): Promise<void> {
  const db = getDB();
  if (!db) return;
  await update(ref(db, `bids/${id}`), { ...data, updatedAt: nowISO() });
  await writeAuditLog(db, {
    action: "update",
    collection: "bids",
    recordId: id,
    details: { fields: Object.keys(data) },
  });
}

export async function deleteBID(id: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  await remove(ref(db, `bids/${id}`));
  await writeAuditLog(db, {
    action: "delete",
    collection: "bids",
    recordId: id,
  });
}

export async function addBIDTimelineEntry(
  bidId: string,
  entry: { date: string; action: string; createdAt: string }
): Promise<void> {
  const db = getDB();
  if (!db) return;
  const tlRef = push(ref(db, `bids/${bidId}/timeline`));
  await set(tlRef, entry);
  await writeAuditLog(db, {
    action: "create",
    collection: "bids.timeline",
    recordId: `${bidId}/${tlRef.key ?? ""}`,
    details: { action: entry.action, date: entry.date },
  });
}

export async function deleteBIDTimelineEntry(bidId: string, entryId: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  await remove(ref(db, `bids/${bidId}/timeline/${entryId}`));
  await writeAuditLog(db, {
    action: "delete",
    collection: "bids.timeline",
    recordId: `${bidId}/${entryId}`,
  });
}

// ── Businesses ────────────────────────────────────────────────────────────────

export async function createBusiness(data: Omit<Business, "id" | "createdAt" | "updatedAt">): Promise<void> {
  const db = getDB();
  if (!db) return;
  const businessRef = push(ref(db, "businesses"));
  await set(businessRef, { ...data, createdAt: nowISO(), updatedAt: nowISO() });
  await writeAuditLog(db, {
    action: "create",
    collection: "businesses",
    recordId: businessRef.key ?? "",
    details: { fields: Object.keys(data) },
  });
}

export async function updateBusiness(id: string, data: Partial<Business>): Promise<void> {
  const db = getDB();
  if (!db) return;
  await update(ref(db, `businesses/${id}`), { ...data, updatedAt: nowISO() });
  await writeAuditLog(db, {
    action: "update",
    collection: "businesses",
    recordId: id,
    details: { fields: Object.keys(data) },
  });
}

export async function deleteBusiness(id: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  await remove(ref(db, `businesses/${id}`));
  await writeAuditLog(db, {
    action: "delete",
    collection: "businesses",
    recordId: id,
  });
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function createTask(data: Omit<Task, "id" | "createdAt">): Promise<void> {
  const db = getDB();
  if (!db) return;
  const taskRef = push(ref(db, "tasks"));
  await set(taskRef, { ...data, createdAt: nowISO() });
  await writeAuditLog(db, {
    action: "create",
    collection: "tasks",
    recordId: taskRef.key ?? "",
    details: { fields: Object.keys(data) },
  });
}

export async function updateTask(id: string, data: Partial<Task>): Promise<void> {
  const db = getDB();
  if (!db) return;
  await update(ref(db, `tasks/${id}`), data);
  await writeAuditLog(db, {
    action: "update",
    collection: "tasks",
    recordId: id,
    details: { fields: Object.keys(data) },
  });
}

export async function deleteTask(id: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  await remove(ref(db, `tasks/${id}`));
  await writeAuditLog(db, {
    action: "delete",
    collection: "tasks",
    recordId: id,
  });
}

// ── Grants ────────────────────────────────────────────────────────────────────

export async function createGrant(data: Omit<Grant, "id" | "createdAt">): Promise<void> {
  const db = getDB();
  if (!db) return;
  const grantRef = push(ref(db, "grants"));
  await set(grantRef, { ...data, createdAt: nowISO() });
  await writeAuditLog(db, {
    action: "create",
    collection: "grants",
    recordId: grantRef.key ?? "",
    details: { fields: Object.keys(data) },
  });
}

export async function updateGrant(id: string, data: Partial<Grant>): Promise<void> {
  const db = getDB();
  if (!db) return;
  await update(ref(db, `grants/${id}`), data);
  await writeAuditLog(db, {
    action: "update",
    collection: "grants",
    recordId: id,
    details: { fields: Object.keys(data) },
  });
}

export async function deleteGrant(id: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  await remove(ref(db, `grants/${id}`));
  await writeAuditLog(db, {
    action: "delete",
    collection: "grants",
    recordId: id,
  });
}

// ── Team ──────────────────────────────────────────────────────────────────────

export async function createTeamMember(data: Omit<TeamMember, "id" | "createdAt">): Promise<void> {
  const db = getDB();
  if (!db) return;
  const memberRef = push(ref(db, "team"));
  await set(memberRef, { ...data, createdAt: nowISO() });
  await writeAuditLog(db, {
    action: "create",
    collection: "team",
    recordId: memberRef.key ?? "",
    details: { fields: Object.keys(data) },
  });
}

export async function updateTeamMember(id: string, data: Partial<TeamMember>): Promise<void> {
  const db = getDB();
  if (!db) return;
  await update(ref(db, `team/${id}`), data);
  await writeAuditLog(db, {
    action: "update",
    collection: "team",
    recordId: id,
    details: { fields: Object.keys(data) },
  });
}

export async function deleteTeamMember(id: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  await remove(ref(db, `team/${id}`));
  await writeAuditLog(db, {
    action: "delete",
    collection: "team",
    recordId: id,
  });
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function createProject(data: Omit<Project, "id" | "createdAt" | "updatedAt">): Promise<void> {
  const db = getDB();
  if (!db) return;
  const projectRef = push(ref(db, "projects"));
  await set(projectRef, { ...data, createdAt: nowISO(), updatedAt: nowISO() });
  await writeAuditLog(db, {
    action: "create",
    collection: "projects",
    recordId: projectRef.key ?? "",
    details: { fields: Object.keys(data) },
  });
}

export async function updateProject(id: string, data: Partial<Project>): Promise<void> {
  const db = getDB();
  if (!db) return;
  await update(ref(db, `projects/${id}`), { ...data, updatedAt: nowISO() });
  await writeAuditLog(db, {
    action: "update",
    collection: "projects",
    recordId: id,
    details: { fields: Object.keys(data) },
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  await remove(ref(db, `projects/${id}`));
  await writeAuditLog(db, {
    action: "delete",
    collection: "projects",
    recordId: id,
  });
}

// ── UserProfiles (admin only) ─────────────────────────────────────────────────

export const subscribeUserProfiles = makeSubscriber<UserProfile>("userProfiles");

export async function updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  const db = getDB();
  if (!db) return;
  await update(ref(db, `userProfiles/${uid}`), data);
  await writeAuditLog(db, {
    action: "update",
    collection: "userProfiles",
    recordId: uid,
    details: { fields: Object.keys(data) },
  });
}

export async function setUserProfileRecord(uid: string, data: Omit<UserProfile, "id">): Promise<void> {
  const db = getDB();
  if (!db) return;
  const profileRef = ref(db, `userProfiles/${uid}`);
  const before = await get(profileRef);
  await set(profileRef, data);
  await writeAuditLog(db, {
    action: before.exists() ? "update" : "create",
    collection: "userProfiles",
    recordId: uid,
    details: { fields: Object.keys(data) },
  });
}

export async function deleteUserProfile(uid: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  await remove(ref(db, `userProfiles/${uid}`));
  await writeAuditLog(db, {
    action: "delete",
    collection: "userProfiles",
    recordId: uid,
  });
}

// Deletes a portal account from both Firebase Auth and userProfiles via a
// protected admin API route. Requires current user to be signed in as admin.
export async function deletePortalUserAccount(uid: string): Promise<void> {
  const auth = getAuth();
  const currentUser = auth?.currentUser;
  if (!currentUser) throw new Error("not_authenticated");

  const token = await currentUser.getIdToken();
  const res = await fetch(`/api/members/admin/users/${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    let error = "delete_failed";
    try {
      const data = await res.json() as { error?: string };
      if (data.error) error = data.error;
    } catch {
      // ignore json parse error
    }
    throw new Error(error);
  }
}

export async function getUserProfilesList(): Promise<UserProfile[]> {
  const db = getDB();
  if (!db) return [];
  const snap = await get(ref(db, "userProfiles"));
  return snapToList<UserProfile>(snap);
}

export async function getTeamMembersList(): Promise<TeamMember[]> {
  const db = getDB();
  if (!db) return [];
  const snap = await get(ref(db, "team"));
  return snapToList<TeamMember>(snap);
}

export async function getAuditLogsList(): Promise<AuditLogEntry[]> {
  const db = getDB();
  if (!db) return [];
  const snap = await get(ref(db, "auditLogs"));
  return snapToList<AuditLogEntry>(snap);
}

// ── InviteCodes ───────────────────────────────────────────────────────────────

export const subscribeInviteCodes = makeSubscriber<InviteCode>("inviteCodes");

export async function createInviteCode(data: Omit<InviteCode, "id">): Promise<void> {
  const db = getDB();
  if (!db) return;
  // Store at inviteCodes/{code} so the signup page can read a single code without
  // needing to list the entire collection (which requires admin auth).
  await set(ref(db, `inviteCodes/${data.code}`), data);
  await writeAuditLog(db, {
    action: "create",
    collection: "inviteCodes",
    recordId: data.code,
    details: { role: data.role, expiresAt: data.expiresAt },
  });
}

// Reads a single invite code by its code value (e.g. "VOLTA-A3BX7M").
// Safe to call while unauthenticated if the Firebase rule allows reading
// individual children of inviteCodes (see CLAUDE.md for rule snippet).
export async function getInviteCodeByValue(code: string): Promise<InviteCode | null> {
  const db = getDB();
  if (!db) return null;
  const snap = await get(ref(db, `inviteCodes/${code}`));
  if (!snap.exists()) return null;
  return { ...snap.val(), id: code } as InviteCode;
}

export async function updateInviteCode(id: string, data: Partial<InviteCode>): Promise<void> {
  const db = getDB();
  if (!db) return;
  await update(ref(db, `inviteCodes/${id}`), data);
  await writeAuditLog(db, {
    action: "update",
    collection: "inviteCodes",
    recordId: id,
    details: { fields: Object.keys(data) },
  });
}

export async function deleteInviteCode(id: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  await remove(ref(db, `inviteCodes/${id}`));
  await writeAuditLog(db, {
    action: "delete",
    collection: "inviteCodes",
    recordId: id,
  });
}

export async function getInviteCodes(): Promise<InviteCode[]> {
  const db = getDB();
  if (!db) return [];
  const snap = await get(ref(db, "inviteCodes"));
  return snapToList<InviteCode>(snap);
}

// ── CalendarEvents ────────────────────────────────────────────────────────────

export const subscribeCalendarEvents = makeSubscriber<CalendarEvent>("calendarEvents");

export async function createCalendarEvent(data: Omit<CalendarEvent, "id">): Promise<void> {
  const db = getDB();
  if (!db) return;
  const eventRef = push(ref(db, "calendarEvents"));
  await set(eventRef, data);
  await writeAuditLog(db, {
    action: "create",
    collection: "calendarEvents",
    recordId: eventRef.key ?? "",
    details: { title: data.title },
  });
}

export async function updateCalendarEvent(id: string, data: Partial<CalendarEvent>): Promise<void> {
  const db = getDB();
  if (!db) return;
  await update(ref(db, `calendarEvents/${id}`), data);
  await writeAuditLog(db, {
    action: "update",
    collection: "calendarEvents",
    recordId: id,
    details: { fields: Object.keys(data) },
  });
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  await remove(ref(db, `calendarEvents/${id}`));
  await writeAuditLog(db, {
    action: "delete",
    collection: "calendarEvents",
    recordId: id,
  });
}

// ── InterviewInvites ──────────────────────────────────────────────────────────
// Uses the booking token as the Firebase key (instead of a push-generated key),
// so the token IS the record's ID and is embedded in the shareable URL.

export const subscribeInterviewInvites = makeSubscriber<InterviewInvite>("interviewInvites");

export async function createInterviewInvite(token: string, data: Omit<InterviewInvite, "id">): Promise<void> {
  const db = getDB();
  if (!db) return;
  await set(ref(db, `interviewInvites/${token}`), data);
  await writeAuditLog(db, {
    action: "create",
    collection: "interviewInvites",
    recordId: token,
    details: { role: data.role, expiresAt: data.expiresAt, multiUse: !!data.multiUse },
  });
}

export async function updateInterviewInvite(token: string, data: Partial<InterviewInvite>): Promise<void> {
  const db = getDB();
  if (!db) return;
  await update(ref(db, `interviewInvites/${token}`), data);
  await writeAuditLog(db, {
    action: "update",
    collection: "interviewInvites",
    recordId: token,
    details: { fields: Object.keys(data) },
  });
}

export async function getInterviewInvite(token: string): Promise<InterviewInvite | null> {
  const db = getDB();
  if (!db) return null;
  const snap = await get(ref(db, `interviewInvites/${token}`));
  if (!snap.exists()) return null;
  return { ...snap.val(), id: token } as InterviewInvite;
}

// ── InterviewSlots ────────────────────────────────────────────────────────────

export const subscribeInterviewSlots = makeSubscriber<InterviewSlot>("interviewSlots");

export async function createInterviewSlot(data: Omit<InterviewSlot, "id">): Promise<void> {
  const db = getDB();
  if (!db) return;
  const slotRef = push(ref(db, "interviewSlots"));
  await set(slotRef, data);
  await writeAuditLog(db, {
    action: "create",
    collection: "interviewSlots",
    recordId: slotRef.key ?? "",
    details: { datetime: data.datetime, durationMinutes: data.durationMinutes },
  });
}

export async function updateInterviewSlot(id: string, data: Partial<InterviewSlot>): Promise<void> {
  const db = getDB();
  if (!db) return;
  await update(ref(db, `interviewSlots/${id}`), data);
  await writeAuditLog(db, {
    action: "update",
    collection: "interviewSlots",
    recordId: id,
    details: { fields: Object.keys(data) },
  });
}

export async function deleteBookedInterview(slotId: string): Promise<void> {
  const db = getDB();
  if (!db) return;

  const slotRef = ref(db, `interviewSlots/${slotId}`);
  const snap = await get(slotRef);
  if (!snap.exists()) return;

  const slot = snap.val() as Partial<InterviewSlot>;
  await update(slotRef, {
    available: true,
    bookedBy: "",
    bookerName: "",
    bookerEmail: "",
    reminderSentAt: "",
  });
  await writeAuditLog(db, {
    action: "delete",
    collection: "interviewBookings",
    recordId: slotId,
    details: {
      datetime: slot.datetime ?? "",
      previousBookedBy: slot.bookedBy ?? "",
      previousBookerName: slot.bookerName ?? "",
      previousBookerEmail: slot.bookerEmail ?? "",
    },
  });
}

export async function deleteInterviewSlot(id: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  await remove(ref(db, `interviewSlots/${id}`));
  await writeAuditLog(db, {
    action: "delete",
    collection: "interviewSlots",
    recordId: id,
  });
}

export async function getInterviewSlots(): Promise<InterviewSlot[]> {
  const db = getDB();
  if (!db) return [];
  const snap = await get(ref(db, "interviewSlots"));
  return snapToList<InterviewSlot>(snap);
}

// ── Interview Settings ───────────────────────────────────────────────────────

export function subscribeInterviewSettings(callback: (settings: InterviewSettings | null) => void): (() => void) {
  const db = getDB();
  if (!db) {
    callback(null);
    return () => {};
  }
  const dbRef = ref(db, "interviewSettings");
  const handler = onValue(dbRef, (snap) => {
    callback(snap.exists() ? (snap.val() as InterviewSettings) : null);
  });
  return () => off(dbRef, "value", handler);
}

export async function updateInterviewSettings(data: Partial<InterviewSettings>): Promise<void> {
  const db = getDB();
  if (!db) return;
  await update(ref(db, "interviewSettings"), data);
  await writeAuditLog(db, {
    action: "update",
    collection: "interviewSettings",
    recordId: "singleton",
    details: { fields: Object.keys(data) },
  });
}
