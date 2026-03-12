"use client";

import { useState, useEffect } from "react";
import MembersLayout from "@/components/members/MembersLayout";
import {
  PageHeader, SearchBar, Badge, Btn, Modal, Field, Input, Select, TextArea,
  Empty, StatCard, AutocompleteInput, useConfirm,
} from "@/components/members/ui";
import {
  subscribeBusinesses, subscribeTeam, createBusiness, updateBusiness, deleteBusiness, type Business, type TeamMember,
} from "@/lib/members/storage";
import { useAuth } from "@/lib/members/authContext";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const STATUSES  = ["Not Started", "Discovery", "Active", "On Hold", "Complete"];
const DIVISIONS = ["Tech", "Marketing", "Finance"];
const DIVISION_PUBLIC_LABEL: Record<string, string> = {
  Tech: "Digital & Tech",
  Marketing: "Marketing & Strategy",
  Finance: "Finance & Operations",
};
const DIVISION_SHOWCASE_COLOR: Record<string, "blue" | "green" | "amber"> = {
  Tech: "blue",
  Marketing: "green",
  Finance: "amber",
};
const SHOWCASE_STATUSES = ["In Progress", "Active", "Upcoming"];
const SHOWCASE_SERVICE_OPTIONS = [
  { label: "Website", track: "tech" },
  { label: "SEO", track: "tech" },
  { label: "Social", track: "marketing" },
  { label: "Content", track: "marketing" },
  { label: "Grants", track: "finance" },
  { label: "Finance", track: "finance" },
] as const;
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
  name: "",
  ownerName: "",
  ownerEmail: "",
  ownerAlternateEmail: "",
  phone: "",
  alternatePhone: "",
  address: "",
  website: "",
  projectStatus: "Not Started",
  teamLead: "",
  firstContactDate: "",
  notes: "",
  division: "Tech",
  teamMembers: [],
  showcaseEnabled: false,
  showcaseFeaturedOnHome: true,
  showcaseOrder: 1000,
  showcaseName: "",
  showcaseType: "",
  showcaseNeighborhood: "",
  showcaseServices: [],
  showcaseStatus: "In Progress",
  showcaseDescription: "",
  showcaseUrl: "",
  showcaseImageUrl: "",
  showcaseColor: "green",
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
  const [showOwnerAltEmail, setShowOwnerAltEmail] = useState(false);
  const [showAlternatePhone, setShowAlternatePhone] = useState(false);
  const [memberInput, setMemberInput] = useState("");

  const { ask, Dialog } = useConfirm();
  const { authRole, user, userProfile } = useAuth();
  const canEdit = authRole === "admin" || authRole === "project_lead";

  useEffect(() => subscribeBusinesses(setBusinesses), []);
  useEffect(() => subscribeTeam(setTeam), []);

  const setField = (key: string, value: unknown) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const openCreate = () => {
    setForm(BLANK_FORM);
    setEditingBusiness(null);
    setShowOwnerAltEmail(false);
    setShowAlternatePhone(false);
    setMemberInput("");
    setModal("create");
  };

  const openEdit = (b: Business) => {
    setForm({
      name: b.name,
      ownerName: b.ownerName,
      ownerEmail: b.ownerEmail,
      ownerAlternateEmail: b.ownerAlternateEmail ?? "",
      phone: b.phone, alternatePhone: b.alternatePhone ?? "", address: b.address, website: b.website,
      projectStatus:  b.projectStatus,
      teamLead:       b.teamLead,
      firstContactDate: b.firstContactDate,
      notes:          b.notes,
      division:       b.division        ?? "Tech",
      teamMembers:    b.teamMembers     ?? [],
      showcaseEnabled: !!b.showcaseEnabled,
      showcaseFeaturedOnHome: b.showcaseFeaturedOnHome ?? true,
      showcaseOrder: b.showcaseOrder ?? 1000,
      showcaseName: b.showcaseName ?? "",
      showcaseType: b.showcaseType ?? "",
      showcaseNeighborhood: b.showcaseNeighborhood ?? "",
      showcaseServices: b.showcaseServices ?? [],
      showcaseStatus: b.showcaseStatus ?? "In Progress",
      showcaseDescription: b.showcaseDescription ?? "",
      showcaseUrl: b.showcaseUrl ?? "",
      showcaseImageUrl: b.showcaseImageUrl ?? "",
      showcaseColor: b.showcaseColor ?? "green",
    });
    setEditingBusiness(b);
    setShowOwnerAltEmail(!!(b.ownerAlternateEmail ?? "").trim());
    setShowAlternatePhone(!!(b.alternatePhone ?? "").trim());
    setMemberInput("");
    setModal("edit");
  };

  const addTeamMember = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const current = form.teamMembers ?? [];
    if (current.includes(value)) {
      setMemberInput("");
      return;
    }
    setField("teamMembers", [...current, value]);
    setMemberInput("");
  };

  const removeTeamMember = (name: string) => {
    const current = form.teamMembers ?? [];
    setField("teamMembers", current.filter((member) => member !== name));
  };

  const toggleShowcaseService = (label: string) => {
    const current = form.showcaseServices ?? [];
    if (current.includes(label)) {
      setField("showcaseServices", current.filter((item) => item !== label));
      return;
    }
    setField("showcaseServices", [...current, label]);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const showcaseEnabled = !!form.showcaseEnabled;
    const showcaseServices = (form.showcaseServices ?? []).map((service) => service.trim()).filter(Boolean);
    const payload: Partial<Business> = {
      name: form.name.trim(),
      ownerName: form.ownerName.trim(),
      ownerEmail: form.ownerEmail.trim(),
      ownerAlternateEmail: (form.ownerAlternateEmail ?? "").trim(),
      phone: form.phone.trim(),
      alternatePhone: (form.alternatePhone ?? "").trim(),
      address: form.address.trim(),
      website: form.website.trim(),
      projectStatus: form.projectStatus,
      teamLead: form.teamLead.trim(),
      teamMembers: (form.teamMembers ?? []).map((member) => member.trim()).filter(Boolean),
      firstContactDate: form.firstContactDate,
      division: form.division ?? "Tech",
      notes: form.notes,
      showcaseEnabled,
    };

    if (showcaseEnabled) {
      payload.showcaseFeaturedOnHome = !!form.showcaseFeaturedOnHome;
      payload.showcaseOrder = Number(form.showcaseOrder ?? 1000);
      payload.showcaseName = (form.showcaseName ?? "").trim();
      payload.showcaseType = DIVISION_PUBLIC_LABEL[form.division ?? "Tech"] ?? "Digital & Tech";
      payload.showcaseNeighborhood = (form.showcaseNeighborhood ?? "").trim();
      payload.showcaseServices = showcaseServices;
      payload.showcaseStatus = (form.showcaseStatus as Business["showcaseStatus"]) ?? "In Progress";
      payload.showcaseDescription = (form.showcaseDescription ?? "").trim();
      payload.showcaseUrl = (form.showcaseUrl ?? "").trim();
      payload.showcaseImageUrl = (form.showcaseImageUrl ?? "").trim();
      payload.showcaseColor = DIVISION_SHOWCASE_COLOR[form.division ?? "Tech"];
    } else {
      payload.showcaseFeaturedOnHome = false;
    }

    if (editingBusiness) {
      await updateBusiness(editingBusiness.id, {
        ...payload,
        // Remove deprecated keys from legacy entries.
        activeServices: null as unknown as string[],
        languages: null as unknown as string[],
        githubUrl: null as unknown as string,
        driveFolderUrl: null as unknown as string,
        clientNotes: null as unknown as string,
        showcaseOrder: showcaseEnabled ? payload.showcaseOrder : (null as unknown as number),
        showcaseName: showcaseEnabled ? payload.showcaseName : (null as unknown as string),
        showcaseType: showcaseEnabled ? payload.showcaseType : (null as unknown as string),
        showcaseNeighborhood: showcaseEnabled ? payload.showcaseNeighborhood : (null as unknown as string),
        showcaseServices: showcaseEnabled ? payload.showcaseServices : (null as unknown as string[]),
        showcaseStatus: showcaseEnabled ? payload.showcaseStatus : (null as unknown as Business["showcaseStatus"]),
        showcaseDescription: showcaseEnabled ? payload.showcaseDescription : (null as unknown as string),
        showcaseUrl: showcaseEnabled ? payload.showcaseUrl : (null as unknown as string),
        showcaseImageUrl: showcaseEnabled ? payload.showcaseImageUrl : (null as unknown as string),
        showcaseColor: showcaseEnabled ? payload.showcaseColor : (null as unknown as Business["showcaseColor"]),
      });
    } else {
      await createBusiness({
        ...payload,
        sortIndex: nextSortIndex(businesses),
      } as Omit<Business, "id" | "createdAt" | "updatedAt">);
    }
    setModal(null);
  };

  const handleDeleteFromEdit = async () => {
    if (!editingBusiness) return;
    const name = editingBusiness.name || "this project";
    await ask(
      async () => {
        await deleteBusiness(editingBusiness.id);
        setModal(null);
      },
      `Delete "${name}"? This permanently removes the project from the tracker.`,
    );
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
          <p className="text-white font-bold text-base leading-tight break-words">
            {b.name}
            {b.intakeSource === "website_form" && (
              <span className="text-amber-300 ml-1" title="Submitted via website form">★</span>
            )}
            {b.showcaseEnabled && (
              <span className="text-blue-300 ml-1" title="Visible on public site">◆</span>
            )}
          </p>
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
          <Btn size="sm" variant="secondary" className="w-full justify-center" onClick={() => openEdit(b)}>Edit</Btn>
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
      <p className="text-xs text-white/45 mb-4">
        <span className="text-amber-300 font-semibold">★</span> Submitted via website business interest form.
        <span className="mx-2">·</span>
        <span className="text-blue-300 font-semibold">◆</span> Visible on public home/showcase.
      </p>

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
          {/* ── Project Info ── */}
          <div className="col-span-2">
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
              <div className="space-y-2">
                <div className="flex gap-2">
                  <AutocompleteInput
                    value={memberInput}
                    onChange={setMemberInput}
                    options={teamNameOptions}
                    placeholder="Type a member name"
                  />
                  <Btn size="sm" variant="secondary" onClick={() => addTeamMember(memberInput)}>Add</Btn>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {(form.teamMembers ?? []).length === 0 ? (
                    <p className="text-xs text-white/35">No members assigned yet.</p>
                  ) : (
                    (form.teamMembers ?? []).map((member) => (
                      <div key={member} className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0F1014] px-3 py-2">
                        <span className="text-sm text-white/80">{member}</span>
                        <button
                          type="button"
                          onClick={() => removeTeamMember(member)}
                          className="text-white/30 hover:text-red-400 transition-colors"
                          aria-label={`Remove ${member}`}
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Field>
          </div>

          <div className="col-span-2">
            <Field label="Notes">
              <TextArea rows={3} value={form.notes} onChange={e => setField("notes", e.target.value)} />
            </Field>
          </div>

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
          <div className="col-span-2">
            {showOwnerAltEmail ? (
              <div className="space-y-1.5">
                <Field label="Alternate Email">
                  <Input
                    type="email"
                    value={form.ownerAlternateEmail ?? ""}
                    onChange={e => setField("ownerAlternateEmail", e.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="text-xs text-white/45 hover:text-white/70 transition-colors"
                  onClick={() => {
                    setField("ownerAlternateEmail", "");
                    setShowOwnerAltEmail(false);
                  }}
                >
                  Remove alternate email
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="text-xs text-[#85CC17] hover:text-[#A5E236] transition-colors"
                onClick={() => setShowOwnerAltEmail(true)}
              >
                + Add alternate email
              </button>
            )}
          </div>
          <Field label="Phone">
            <Input value={form.phone} onChange={e => setField("phone", e.target.value)} />
          </Field>
          <div className="col-span-2">
            {showAlternatePhone ? (
              <div className="space-y-1.5">
                <Field label="Alternate Phone">
                  <Input
                    value={form.alternatePhone ?? ""}
                    onChange={e => setField("alternatePhone", e.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="text-xs text-white/45 hover:text-white/70 transition-colors"
                  onClick={() => {
                    setField("alternatePhone", "");
                    setShowAlternatePhone(false);
                  }}
                >
                  Remove alternate phone
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="text-xs text-[#85CC17] hover:text-[#A5E236] transition-colors"
                onClick={() => setShowAlternatePhone(true)}
              >
                + Add alternate phone
              </button>
            )}
          </div>
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

          {/* ── Public Showcase ── */}
          <div className="col-span-2 mt-2 pt-2 border-t border-white/8">
            <p className="text-white/30 text-xs uppercase tracking-wider font-body mb-1">Public Showcase</p>
            <p className="text-white/45 text-xs font-body">Controls what appears on the public home/showcase cards.</p>
          </div>
          <div className="col-span-2">
            <label className="inline-flex items-center gap-2 text-sm text-white/80 font-body">
              <input
                type="checkbox"
                className="accent-[#85CC17] w-4 h-4"
                checked={!!form.showcaseEnabled}
                onChange={(e) => setField("showcaseEnabled", e.target.checked)}
              />
              Show this project on the public site
            </label>
          </div>

          {form.showcaseEnabled && (
            <>
              <Field label="Card Name (optional)">
                <Input value={form.showcaseName ?? ""} onChange={e => setField("showcaseName", e.target.value)} />
              </Field>
              <Field label="Division">
                <Input value={DIVISION_PUBLIC_LABEL[form.division ?? "Tech"]} readOnly />
              </Field>
              <Field label="Neighborhood, Borough">
                <Input
                  value={form.showcaseNeighborhood ?? ""}
                  onChange={e => setField("showcaseNeighborhood", e.target.value)}
                  placeholder="e.g. Chinatown, Manhattan"
                />
              </Field>
              <Field label="Card Status">
                <Select options={SHOWCASE_STATUSES} value={form.showcaseStatus ?? "In Progress"} onChange={e => setField("showcaseStatus", e.target.value)} />
              </Field>
              <Field label="Sort Order">
                <Input
                  type="number"
                  value={String(form.showcaseOrder ?? 1000)}
                  onChange={e => setField("showcaseOrder", Number(e.target.value || 1000))}
                />
              </Field>
              <Field label="Image Link">
                <Input value={form.showcaseImageUrl ?? ""} onChange={e => setField("showcaseImageUrl", e.target.value)} placeholder="https://..." />
              </Field>
              <div className="col-span-2">
                <Field label="What we do">
                  <div className="flex flex-wrap gap-2">
                    {SHOWCASE_SERVICE_OPTIONS.map((option) => {
                      const selected = (form.showcaseServices ?? []).includes(option.label);
                      const trackClass = option.track === "tech"
                        ? (selected ? "bg-blue-200 text-blue-900 border-blue-300" : "bg-blue-50 text-blue-700 border-blue-200")
                        : option.track === "marketing"
                        ? (selected ? "bg-lime-200 text-lime-900 border-lime-300" : "bg-lime-50 text-lime-700 border-lime-200")
                        : (selected ? "bg-amber-200 text-amber-900 border-amber-300" : "bg-amber-50 text-amber-700 border-amber-200");
                      return (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => toggleShowcaseService(option.label)}
                          className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${trackClass}`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Description">
                  <TextArea rows={3} value={form.showcaseDescription ?? ""} onChange={e => setField("showcaseDescription", e.target.value)} />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Public Link (optional)">
                  <Input value={form.showcaseUrl ?? ""} onChange={e => setField("showcaseUrl", e.target.value)} placeholder="https://" />
                </Field>
              </div>
              <div className="col-span-2">
                <label className="inline-flex items-center gap-2 text-sm text-white/80 font-body">
                  <input
                    type="checkbox"
                    className="accent-[#85CC17] w-4 h-4"
                    checked={!!form.showcaseFeaturedOnHome}
                    onChange={(e) => setField("showcaseFeaturedOnHome", e.target.checked)}
                  />
                  Feature this card on the homepage
                </label>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-white/8">
          {editingBusiness && (
            <Btn variant="danger" onClick={() => void handleDeleteFromEdit()}>
              Delete Project
            </Btn>
          )}
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSave}>{editingBusiness ? "Save" : "Create"}</Btn>
        </div>
      </Modal>
    </MembersLayout>
  );
}
