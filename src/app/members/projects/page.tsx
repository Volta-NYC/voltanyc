"use client";

import { useState, useEffect } from "react";
import MembersLayout from "@/components/members/MembersLayout";
import {
  PageHeader, SearchBar, Badge, Btn, Modal, Field, Input, Select, TextArea,
  Empty, StatCard, AutocompleteInput, AutocompleteTagInput, useConfirm,
} from "@/components/members/ui";
import {
  subscribeBusinesses, subscribeTeam, createBusiness, updateBusiness, deleteBusiness, type Business, type TeamMember,
} from "@/lib/members/storage";
import { useAuth } from "@/lib/members/authContext";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const STATUSES  = ["Not Started", "Discovery", "Active", "On Hold", "Complete"];
const DIVISIONS = ["Tech", "Marketing", "Finance"];
const SERVICES  = ["Website", "Social Media", "Grant Writing", "SEO", "Financial Analysis", "Digital Payments"];
const LANGUAGES  = ["English", "Spanish", "Chinese", "Korean", "Arabic", "French", "Other"];
const SORT_OPTIONS = [
  { value: "status", label: "Status" },
  { value: "name", label: "Name" },
] as const;
type ProjectSortMode = (typeof SORT_OPTIONS)[number]["value"];

const PROJECT_STATUS_SORT_ORDER: Record<Business["projectStatus"], number> = {
  Active: 0,
  "Not Started": 1,
  Discovery: 2,
  "On Hold": 3,
  Complete: 4,
};

function nextSortIndex(items: Business[]): number {
  const max = items.reduce((best, item) => {
    const value = item.sortIndex ?? 0;
    return value > best ? value : best;
  }, 0);
  return max + 1000;
}

const BLANK_FORM: Omit<Business, "id" | "createdAt" | "updatedAt"> = {
  name: "", bidId: "", ownerName: "", ownerEmail: "", ownerAlternateEmail: "", phone: "", alternatePhone: "", address: "", website: "",
  activeServices: [], projectStatus: "Not Started", teamLead: "",
  languages: [], firstContactDate: "", notes: "",
  division: "Tech", teamMembers: [],
  githubUrl: "", driveFolderUrl: "", clientNotes: "",
};

// ── PAGE COMPONENT ────────────────────────────────────────────────────────────

export default function BusinessesPage() {
  const [businesses, setBusinesses]           = useState<Business[]>([]);
  const [team, setTeam]                       = useState<TeamMember[]>([]);
  const [search, setSearch]                   = useState("");
  const [filterDiv, setFilterDiv]             = useState("");
  const [sortMode, setSortMode]               = useState<ProjectSortMode>("status");
  const [statusPage, setStatusPage]           = useState<"active_planning" | "completed" | "scouting">("active_planning");
  const [modal, setModal]                     = useState<"create" | "edit" | null>(null);
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const [form, setForm]                       = useState(BLANK_FORM);

  const { ask, Dialog } = useConfirm();
  const { authRole, user, userProfile } = useAuth();
  const canEdit = authRole === "admin" || authRole === "project_lead";

  useEffect(() => subscribeBusinesses(setBusinesses), []);
  useEffect(() => subscribeTeam(setTeam), []);

  const setField = (key: string, value: unknown) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const openCreate = () => { setForm(BLANK_FORM); setEditingBusiness(null); setModal("create"); };

  const openEdit = (b: Business) => {
    setForm({
      name: b.name, bidId: b.bidId, ownerName: b.ownerName, ownerEmail: b.ownerEmail,
      ownerAlternateEmail: b.ownerAlternateEmail ?? "",
      phone: b.phone, alternatePhone: b.alternatePhone ?? "", address: b.address, website: b.website,
      activeServices: b.activeServices  ?? [],
      projectStatus:  b.projectStatus,
      teamLead:       b.teamLead,
      languages:      b.languages       ?? [],
      firstContactDate: b.firstContactDate,
      notes:          b.notes,
      division:       b.division        ?? "Tech",
      teamMembers:    b.teamMembers     ?? [],
      githubUrl:        b.githubUrl        ?? "",
      driveFolderUrl:   b.driveFolderUrl   ?? "",
      clientNotes:      b.clientNotes      ?? "",
    });
    setEditingBusiness(b);
    setModal("edit");
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (editingBusiness) {
      await updateBusiness(editingBusiness.id, form as Partial<Business>);
    } else {
      await createBusiness({
        ...form,
        sortIndex: nextSortIndex(businesses),
      } as Omit<Business, "id" | "createdAt" | "updatedAt">);
    }
    setModal(null);
  };

  const statusMatchesPage = (status: Business["projectStatus"]) => {
    if (statusPage === "active_planning") return status === "Active" || status === "Not Started";
    if (statusPage === "completed") return status === "Complete";
    return status === "Discovery" || status === "On Hold";
  };

  const matchesSearch = (project: Business) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return project.name.toLowerCase().includes(query)
      || project.ownerName.toLowerCase().includes(query)
      || project.ownerEmail.toLowerCase().includes(query)
      || (project.teamLead ?? "").toLowerCase().includes(query);
  };

  const sortBusinesses = (list: Business[]) => {
    if (sortMode === "name") {
      return [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...list].sort((a, b) => {
      const statusDelta = PROJECT_STATUS_SORT_ORDER[a.projectStatus] - PROJECT_STATUS_SORT_ORDER[b.projectStatus];
      if (statusDelta !== 0) return statusDelta;
      return a.name.localeCompare(b.name);
    });
  };

  const statusScoped = businesses.filter((business) => statusMatchesPage(business.projectStatus));
  const divisionScoped = statusScoped.filter((business) => !filterDiv || business.division === filterDiv);
  const filtered = sortBusinesses(divisionScoped.filter(matchesSearch));

  const teamNameCounts = new Map<string, number>();
  team.forEach((member) => {
    const key = member.name.trim().toLowerCase();
    if (!key) return;
    teamNameCounts.set(key, (teamNameCounts.get(key) ?? 0) + 1);
  });

  const teamNameOptions = Array.from(
    new Set(
      team
        .map((member) => {
          const name = member.name.trim();
          if (!name) return "";
          const nameKey = name.toLowerCase();
          const count = teamNameCounts.get(nameKey) ?? 0;
          if (count <= 1) return name;
          const suffix = member.email?.trim() || member.school?.trim() || member.id.slice(-6);
          return `${name} (${suffix})`;
        })
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const activePlanningCount = businesses.filter((b) => b.projectStatus === "Active" || b.projectStatus === "Not Started").length;
  const completedCount = businesses.filter((b) => b.projectStatus === "Complete").length;
  const scoutingCount = businesses.filter((b) => b.projectStatus === "Discovery" || b.projectStatus === "On Hold").length;

  const normalize = (v: string) => v.trim().toLowerCase();
  const myEmail = normalize(userProfile?.email ?? user?.email ?? "");
  const teamMatchByEmail = myEmail ? team.find((m) => normalize(m.email ?? "") === myEmail) : undefined;
  const myNameSet = new Set(
    [userProfile?.name, teamMatchByEmail?.name]
      .map((v) => normalize(v ?? ""))
      .filter(Boolean)
  );

  const isProjectMine = (project: Business) => {
    if (myNameSet.size === 0) return false;
    const leadKey = normalize(project.teamLead ?? "");
    if (leadKey && myNameSet.has(leadKey)) return true;
    return (project.teamMembers ?? []).some((member) => myNameSet.has(normalize(member)));
  };

  const isNonAdminMember = authRole !== "admin";
  const myProjects = isNonAdminMember ? filtered.filter(isProjectMine) : [];
  const otherProjects = isNonAdminMember ? filtered.filter((p) => !isProjectMine(p)) : filtered;
  const renderProjectCard = (b: Business) => (
    <div
      key={b.id}
      className="bg-[#1C1F26] border border-white/8 rounded-xl p-5 hover:border-white/15 transition-all flex flex-col gap-3"
    >

      {/* Name + badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-base leading-tight">{b.name}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <Badge label={b.projectStatus} />
          {b.division && (
            <span className="text-[10px] font-medium text-white/60 bg-white/8 px-2 py-0.5 rounded-full">{b.division}</span>
          )}
        </div>
      </div>

      {/* Contact info */}
      {(b.ownerName || b.ownerEmail || b.ownerAlternateEmail || b.phone || b.alternatePhone || b.website) && (
        <div className="bg-white/4 rounded-lg px-3 py-2 space-y-1">
          {b.ownerName && (
            <p className="text-white/70 text-xs font-medium">{b.ownerName}</p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {b.ownerEmail && (
              <a href={`mailto:${b.ownerEmail}`} className="text-[#85CC17]/70 hover:text-[#85CC17] text-xs font-mono transition-colors">{b.ownerEmail}</a>
            )}
            {b.ownerAlternateEmail && (
              <a href={`mailto:${b.ownerAlternateEmail}`} className="text-[#85CC17]/55 hover:text-[#85CC17]/80 text-xs font-mono transition-colors">{b.ownerAlternateEmail}</a>
            )}
            {b.phone && (
              <span className="text-white/40 text-xs">{b.phone}</span>
            )}
            {b.alternatePhone && (
              <span className="text-white/35 text-xs">{b.alternatePhone}</span>
            )}
          </div>
          {b.website && (
            <a href={b.website} target="_blank" rel="noopener noreferrer" className="text-blue-400/70 hover:text-blue-400 text-xs font-mono transition-colors truncate block">{b.website}</a>
          )}
        </div>
      )}

      {/* GitHub / Drive link */}
      {b.division === "Tech" && b.githubUrl && (
        <a href={b.githubUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.49.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.58 9.58 0 0 1 12 6.8c.85 0 1.71.11 2.51.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10.01 10.01 0 0 0 22 12c0-5.52-4.48-10-10-10z"/>
          </svg>
          <span className="truncate">GitHub</span>
        </a>
      )}
      {b.division !== "Tech" && b.driveFolderUrl && (
        <a href={b.driveFolderUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span className="truncate">Drive Folder</span>
        </a>
      )}

      {/* Assigned members */}
      <div className="border-t border-white/5 pt-2">
        <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1">Assigned Members</p>
        {(b.teamMembers ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {(b.teamMembers ?? []).map((member) => (
              <span
                key={member}
                className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border bg-[#85CC17]/15 text-[#85CC17] border-[#85CC17]/25"
              >
                {member}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-white/35 text-xs">No members assigned yet.</p>
        )}
      </div>

      {/* Actions */}
      {canEdit && (
        <div className="flex gap-2 pt-2 border-t border-white/5 mt-auto">
          <Btn size="sm" variant="secondary" className="flex-1 justify-center" onClick={() => openEdit(b)}>Edit</Btn>
          <Btn size="sm" variant="danger" onClick={() => ask(async () => deleteBusiness(b.id))}>Delete</Btn>
        </div>
      )}
    </div>
  );

  return (
    <MembersLayout>
      <Dialog />

      <PageHeader
        title="Projects"
        subtitle={`${filtered.length} shown · ${businesses.length} total projects`}
        action={canEdit ? <Btn variant="primary" onClick={openCreate}>+ New Project</Btn> : undefined}
      />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard label="Active"    value={businesses.filter(b => b.projectStatus === "Active").length}   color="text-green-400" />
        <StatCard label="Planning"  value={businesses.filter(b => b.projectStatus === "Not Started").length} color="text-purple-400" />
        <StatCard label="Complete"  value={businesses.filter(b => b.projectStatus === "Complete").length} color="text-blue-400" />
        <StatCard label="Scouting"  value={businesses.filter(b => b.projectStatus === "Discovery" || b.projectStatus === "On Hold").length} color="text-orange-400" />
      </div>

      <div className="flex gap-1 bg-[#1C1F26] border border-white/8 rounded-xl p-1 mb-4 w-fit">
        {[
          { key: "active_planning" as const, label: "Active / Planning", count: activePlanningCount },
          { key: "completed" as const, label: "Completed", count: completedCount },
          { key: "scouting" as const, label: "Scouting", count: scoutingCount },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusPage(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium font-body transition-colors ${
              statusPage === tab.key ? "bg-[#85CC17] text-[#0D0D0D]" : "text-white/55 hover:text-white"
            }`}
          >
            {tab.label} <span className="text-xs opacity-75">({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <SearchBar value={search} onChange={setSearch} placeholder="Search projects, owners, leads…" />
        <select
          value={filterDiv}
          onChange={e => setFilterDiv(e.target.value)}
          className="bg-[#1C1F26] border border-white/8 rounded-xl pl-3 pr-9 py-2.5 text-sm text-white/70 focus:outline-none appearance-none"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23ffffff66' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
        >
          <option value="">All divisions</option>
          {DIVISIONS.map(d => <option key={d}>{d}</option>)}
        </select>
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as ProjectSortMode)}
          className="bg-[#1C1F26] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white/70 focus:outline-none"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {isNonAdminMember && myProjects.length > 0 && (
        <div className="mb-6">
          <h2 className="text-white/75 text-sm font-semibold uppercase tracking-wider mb-3">My Projects</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {myProjects.map(renderProjectCard)}
          </div>
        </div>
      )}

      {/* Project cards */}
      {isNonAdminMember && myProjects.length > 0 && (
        <h2 className="text-white/65 text-sm font-semibold uppercase tracking-wider mb-3">Other Projects</h2>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {otherProjects.map(renderProjectCard)}
        {filtered.length === 0 && (
          <div className="col-span-3">
            <Empty
              message="No projects found in this section."
              action={canEdit ? <Btn variant="primary" onClick={openCreate}>Add first project</Btn> : undefined}
            />
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      <Modal open={modal !== null} onClose={() => setModal(null)} title={editingBusiness ? "Edit Project" : "New Project"}>
        <div className="grid grid-cols-2 gap-4 max-h-[65vh] overflow-y-auto pr-2">

          {/* ── Business Info ── */}
          <div className="col-span-2">
            <p className="text-white/30 text-xs uppercase tracking-wider font-body mb-2">Business Info</p>
          </div>
          <Field label="Business Name" required>
            <Input value={form.name} onChange={e => setField("name", e.target.value)} />
          </Field>
          <Field label="Owner Name">
            <Input value={form.ownerName} onChange={e => setField("ownerName", e.target.value)} />
          </Field>
          <Field label="Owner Email">
            <Input type="email" value={form.ownerEmail} onChange={e => setField("ownerEmail", e.target.value)} />
          </Field>
          <Field label="Alternate Email">
            <Input type="email" value={form.ownerAlternateEmail ?? ""} onChange={e => setField("ownerAlternateEmail", e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={e => setField("phone", e.target.value)} />
          </Field>
          <Field label="Alternate Phone">
            <Input value={form.alternatePhone ?? ""} onChange={e => setField("alternatePhone", e.target.value)} />
          </Field>
          <Field label="Website">
            <Input value={form.website} onChange={e => setField("website", e.target.value)} placeholder="https://" />
          </Field>
          <Field label="First Contact Date">
            <Input type="date" value={form.firstContactDate} onChange={e => setField("firstContactDate", e.target.value)} />
          </Field>
          <div className="col-span-2">
            <Field label="Address">
              <Input value={form.address} onChange={e => setField("address", e.target.value)} />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Active Services">
              <AutocompleteTagInput
                values={form.activeServices}
                onChange={v => setField("activeServices", v)}
                options={SERVICES}
                commitOnBlur
                placeholder="Type a service, then Enter/comma"
              />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Languages Spoken">
              <AutocompleteTagInput
                values={form.languages}
                onChange={v => setField("languages", v)}
                options={LANGUAGES}
                commitOnBlur
                placeholder="Type a language, then Enter/comma"
              />
            </Field>
          </div>

          {/* ── Project Info ── */}
          <div className="col-span-2 mt-2">
            <p className="text-white/30 text-xs uppercase tracking-wider font-body mb-2">Project Info</p>
          </div>
          <Field label="Status">
            <Select options={STATUSES} value={form.projectStatus} onChange={e => setField("projectStatus", e.target.value)} />
          </Field>
          <Field label="Division">
            <Select options={DIVISIONS} value={form.division ?? "Tech"} onChange={e => setField("division", e.target.value)} />
          </Field>
          <Field label="Team Lead">
            <AutocompleteInput
              value={form.teamLead}
              onChange={(value) => setField("teamLead", value)}
              options={teamNameOptions}
              placeholder="Start typing a member name"
            />
          </Field>
          <div className="col-span-2">
            <Field label="Assigned Members">
              <AutocompleteTagInput
                values={form.teamMembers ?? []}
                onChange={v => setField("teamMembers", v)}
                options={teamNameOptions}
                commitOnBlur
                placeholder="Type a member name, then Enter"
              />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="GitHub Repo URL">
              <Input value={form.githubUrl ?? ""} onChange={e => setField("githubUrl", e.target.value)} placeholder="https://github.com/…" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Drive Folder URL">
              <Input value={form.driveFolderUrl ?? ""} onChange={e => setField("driveFolderUrl", e.target.value)} placeholder="https://drive.google.com/…" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Notes">
              <TextArea rows={3} value={form.notes} onChange={e => setField("notes", e.target.value)} />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-white/8">
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSave}>{editingBusiness ? "Save" : "Create"}</Btn>
        </div>
      </Modal>
    </MembersLayout>
  );
}
