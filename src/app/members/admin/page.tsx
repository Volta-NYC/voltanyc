"use client";

import { useState, useEffect } from "react";
import MembersLayout from "@/components/members/MembersLayout";
import { useAuth } from "@/lib/members/authContext";
import {
  subscribeInviteCodes, createInviteCode, deleteInviteCode,
  subscribeUserProfiles, updateUserProfile, deleteUserProfile,
  getUserProfilesList, getTeamMembersList, createTeamMember,
  exportAllData, importAllData,
  type InviteCode, type UserProfile, type AuthRole,
} from "@/lib/members/storage";
import { Btn, Badge, Table, Field, Select, useConfirm } from "@/components/members/ui";
import { useRouter } from "next/navigation";

// ── INVITE CODE HELPERS ───────────────────────────────────────────────────────

// Generates a random invite code like "VOLTA-A3BX7M".
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const suffix = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `VOLTA-${suffix}`;
}

// Returns a display string for the current state of an invite code.
function getCodeStatus(code: InviteCode): string {
  if (code.used) return "Used";
  if (new Date(code.expiresAt) < new Date()) return "Expired";
  return "Active";
}

// Returns a Tailwind text color class for an invite code status string.
function getCodeStatusColor(status: string): string {
  if (status === "Used")    return "text-white/30";
  if (status === "Expired") return "text-orange-400";
  return "text-green-400";
}

// ── TAB: ACCESS CODES ─────────────────────────────────────────────────────────

function AccessCodesTab({ uid }: { uid: string }) {
  const [codes, setCodes]   = useState<InviteCode[]>([]);
  const [newRole, setNewRole] = useState<AuthRole>("member");
  const [expireDays, setExpireDays] = useState("7");
  const [copiedCodeId, setCopiedCodeId] = useState("");
  const { ask, Dialog } = useConfirm();

  useEffect(() => subscribeInviteCodes(setCodes), []);

  const handleGenerate = async () => {
    const code      = generateInviteCode();
    const expiresAt = new Date(Date.now() + parseInt(expireDays) * 86400000)
      .toISOString().split("T")[0];
    await createInviteCode({
      code,
      role:      newRole,
      expiresAt,
      used:      false,
      createdBy: uid,
      createdAt: new Date().toISOString(),
    });
  };

  const copyCode = (codeText: string, id: string) => {
    navigator.clipboard.writeText(codeText);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(""), 2000);
  };

  // Display newest codes first.
  const sortedCodes = [...codes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="space-y-5">
      <Dialog />

      {/* Code generator form */}
      <div className="bg-[#1C1F26] border border-white/8 rounded-xl p-5">
        <h3 className="font-display font-bold text-white text-sm mb-4">Generate New Invite Code</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <Field label="Role">
            <Select
              options={["member", "project_lead", "admin"]}
              value={newRole}
              onChange={e => setNewRole(e.target.value as AuthRole)}
            />
          </Field>
          <Field label="Expires in">
            <Select
              options={["1", "3", "7", "14", "30"]}
              value={expireDays}
              onChange={e => setExpireDays(e.target.value)}
            />
          </Field>
          <Btn variant="primary" onClick={handleGenerate}>Generate Code</Btn>
        </div>
      </div>

      {/* Existing codes table */}
      <Table
        cols={["Code", "Role", "Expires", "Status", "Used By", "Actions"]}
        rows={sortedCodes.map(code => {
          const status = getCodeStatus(code);
          return [
            <span key="code" className="font-mono text-white tracking-widest text-sm">{code.code}</span>,
            <Badge key="role" label={code.role} />,
            <span key="exp" className="text-white/40 text-xs">{code.expiresAt}</span>,
            <span key="status" className={`text-xs font-medium ${getCodeStatusColor(status)}`}>{status}</span>,
            <span key="usedBy" className="text-white/30 text-xs">{code.usedBy ?? "—"}</span>,
            <div key="actions" className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => copyCode(code.code, code.id)}
                className="text-xs text-[#85CC17]/70 hover:text-[#85CC17] transition-colors font-body"
              >
                {copiedCodeId === code.id ? "Copied!" : "Copy"}
              </button>
              <Btn size="sm" variant="danger" onClick={() => ask(async () => deleteInviteCode(code.id))}>Delete</Btn>
            </div>,
          ];
        })}
      />
      {codes.length === 0 && (
        <p className="text-white/30 text-sm text-center py-6 font-body">No invite codes yet. Generate one above.</p>
      )}
    </div>
  );
}

// ── TAB: USERS ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const { ask, Dialog } = useConfirm();

  useEffect(() => subscribeUserProfiles(setUsers), []);

  const changeRole = async (uid: string, role: AuthRole) => {
    await updateUserProfile(uid, { authRole: role });
  };

  const toggleActive = async (uid: string, currentlyActive: boolean) => {
    await updateUserProfile(uid, { active: !currentlyActive });
  };

  const handleDelete = (user: UserProfile) => {
    ask(
      async () => deleteUserProfile(user.id),
      `Delete ${user.email}? This removes them from the portal database. Their Firebase login still exists — if they sign in again they'll be recreated as a plain member. Disable the account instead to block access without deleting.`
    );
  };

  // Display users in the order they joined.
  const sortedUsers = [...users].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <>
      <Dialog />
      <Table
        cols={["Email", "Name", "Role", "Active", "Joined", "Actions"]}
        rows={sortedUsers.map(user => [
          <span key="email" className="text-white text-sm font-mono">{user.email}</span>,
          <span key="name" className="text-white/70 text-sm">{user.name ?? "—"}</span>,
          <select
            key="role"
            value={user.authRole}
            onChange={e => changeRole(user.id, e.target.value as AuthRole)}
            className="bg-[#0F1014] border border-white/10 rounded-lg pl-2 pr-6 py-1 text-xs text-white focus:outline-none focus:border-[#85CC17]/50"
          >
            <option value="member">member</option>
            <option value="project_lead">project_lead</option>
            <option value="admin">admin</option>
          </select>,
          <span key="active" className={`text-xs font-medium ${user.active ? "text-green-400" : "text-red-400"}`}>
            {user.active ? "Active" : "Disabled"}
          </span>,
          <span key="joined" className="text-white/30 text-xs">{user.createdAt?.split("T")[0] ?? "—"}</span>,
          <div key="actions" className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => toggleActive(user.id, user.active)}
              className={`text-xs font-body transition-colors ${
                user.active ? "text-red-400/70 hover:text-red-400" : "text-green-400/70 hover:text-green-400"
              }`}
            >
              {user.active ? "Disable" : "Enable"}
            </button>
            <Btn size="sm" variant="danger" onClick={() => handleDelete(user)}>Delete</Btn>
          </div>,
        ])}
      />
    </>
  );
}

// ── TAB: DATA ─────────────────────────────────────────────────────────────────

function DataTab() {
  const [statusMessage, setStatusMessage] = useState("");
  const [isImporting, setIsImporting]     = useState(false);
  const [isSyncing, setIsSyncing]         = useState(false);

  const handleExport = async () => {
    setStatusMessage("Exporting…");
    const json = await exportAllData();
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href     = url;
    link.download = `volta-data-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatusMessage("Export complete.");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setStatusMessage("Reading file…");
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        await importAllData(ev.target?.result as string);
        setStatusMessage("Import complete. Data is now live for everyone.");
      } catch {
        setStatusMessage("Import failed — check that the file is valid JSON from a Volta export.");
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setStatusMessage("Checking for missing team entries…");
    try {
      const [profiles, teamMembers] = await Promise.all([
        getUserProfilesList(),
        getTeamMembersList(),
      ]);
      const teamEmails = new Set(teamMembers.map(t => t.email.trim().toLowerCase()));
      const missing = profiles.filter(p => !teamEmails.has(p.email.trim().toLowerCase()));
      if (missing.length === 0) {
        setStatusMessage("All users already have a team entry — nothing to sync.");
      } else {
        await Promise.all(
          missing.map(user =>
            createTeamMember({
              name:        user.name ?? user.email,
              email:       user.email.trim().toLowerCase(),
              role:        user.authRole === "project_lead" ? "Team Lead" : "Member",
              status:      "Active",
              joinDate:    user.createdAt?.split("T")[0] ?? new Date().toISOString().split("T")[0],
              school:      "",
              divisions:   [],
              pod:         "",
              slackHandle: "",
              skills:      [],
              notes:       "",
            })
          )
        );
        setStatusMessage(`Done — added ${missing.length} team ${missing.length === 1 ? "entry" : "entries"}: ${missing.map(u => u.name ?? u.email).join(", ")}.`);
      }
    } catch {
      setStatusMessage("Sync failed — check your connection and try again.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="max-w-lg space-y-4">
      {/* Sync users → team */}
      <div className="bg-[#1C1F26] border border-white/8 rounded-xl p-5">
        <h2 className="font-display font-bold text-white mb-1">Sync Users to Team</h2>
        <p className="text-white/40 text-sm mb-4">
          Creates a Team tab entry for any portal user who doesn&apos;t already have one.
          Safe to run multiple times — existing entries are never overwritten.
        </p>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="bg-[#3B74ED] text-white font-display font-bold px-5 py-2.5 rounded-xl hover:bg-[#2B62D9] transition-colors text-sm disabled:opacity-60"
        >
          {isSyncing ? "Syncing…" : "Sync Now"}
        </button>
      </div>
      <div className="bg-[#1C1F26] border border-white/8 rounded-xl p-5">
        <h2 className="font-display font-bold text-white mb-1">Export Data</h2>
        <p className="text-white/40 text-sm mb-4">Download a JSON backup of all portal data.</p>
        <button
          onClick={handleExport}
          className="bg-[#85CC17] text-[#0D0D0D] font-display font-bold px-5 py-2.5 rounded-xl hover:bg-[#72b314] transition-colors text-sm"
        >
          Download Backup
        </button>
      </div>
      <div className="bg-[#1C1F26] border border-white/8 rounded-xl p-5">
        <h2 className="font-display font-bold text-white mb-1">Import Data</h2>
        <p className="text-white/40 text-sm mb-4">
          <strong className="text-orange-400">Warning:</strong> This overwrites all existing data.
        </p>
        <label className={`inline-block bg-white/8 border border-white/15 text-white/70 font-body text-sm px-5 py-2.5 rounded-xl cursor-pointer hover:bg-white/12 transition-colors ${isImporting ? "opacity-50 pointer-events-none" : ""}`}>
          {isImporting ? "Importing…" : "Choose Backup File"}
          <input type="file" accept=".json" onChange={handleImport} className="hidden" />
        </label>
      </div>
      {statusMessage && (
        <div className="bg-white/5 border border-white/8 rounded-xl px-4 py-3 text-white/60 text-sm font-body">
          {statusMessage}
        </div>
      )}
    </div>
  );
}

// ── ADMIN CONTENT (inside AuthProvider via MembersLayout) ─────────────────────
// useAuth() must be called from inside MembersLayout's AuthProvider — not from
// the page root, which is outside it.

function AdminContent() {
  const [activeTab, setActiveTab] = useState<"codes" | "users" | "data">("codes");
  const { user, authRole, loading } = useAuth();
  const router = useRouter();

  // Redirect non-admins away from this page.
  useEffect(() => {
    if (!loading && authRole !== "admin") {
      router.replace("/members/projects");
    }
  }, [authRole, loading, router]);

  if (loading || authRole !== "admin") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#85CC17]/30 border-t-[#85CC17] rounded-full animate-spin" />
      </div>
    );
  }

  const TABS: { key: typeof activeTab; label: string }[] = [
    { key: "codes", label: "Access Codes" },
    { key: "users", label: "Users" },
    { key: "data",  label: "Data" },
  ];

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display font-bold text-white text-2xl">Admin</h1>
        <p className="text-white/40 text-sm mt-1">Manage access, users, and data.</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-[#1C1F26] border border-white/8 rounded-xl p-1 mb-6 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium font-body transition-colors ${
              activeTab === tab.key ? "bg-[#85CC17] text-[#0D0D0D]" : "text-white/50 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "codes" && <AccessCodesTab uid={user?.uid ?? ""} />}
      {activeTab === "users" && <UsersTab />}
      {activeTab === "data"  && <DataTab />}
    </>
  );
}

// ── PAGE EXPORT ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  return (
    <MembersLayout>
      <AdminContent />
    </MembersLayout>
  );
}
