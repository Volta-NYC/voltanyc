"use client";

import { useState, useEffect, useMemo } from "react";
import MembersLayout from "@/components/members/MembersLayout";
import {
  PageHeader, SearchBar, Badge, Btn, Modal, Field, Input, Select, TextArea,
  Table, Empty, StatCard, AutocompleteInput, AutocompleteTagInput, useConfirm,
} from "@/components/members/ui";
import {
  subscribeGrants, createGrant, updateGrant, deleteGrant, type Grant,
  subscribeBusinesses, subscribeTeam, type Business, type TeamMember,
} from "@/lib/members/storage";
import { useAuth } from "@/lib/members/authContext";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const STATUSES     = ["Researched", "Application In Progress", "Submitted", "Awarded", "Rejected", "Cycle Closed"];
const CATEGORIES   = ["Government", "Foundation", "Corporate", "CDFI", "Other"];
const LIKELIHOODS  = ["High", "Medium", "Low"];
const FREQUENCIES  = ["Annual", "Biannual", "Rolling", "One-Time"];
const NEIGHBORHOODS = [
  "Park Slope", "Sunnyside", "Chinatown", "LIC", "Cypress Hills",
  "Flatbush", "Mott Haven", "Flushing", "Bayside",
];

// Blank form values for creating a new grant.
const BLANK_FORM: Omit<Grant, "id" | "createdAt"> = {
  name: "", funder: "", amount: "", deadline: "", businessIds: [], neighborhoodFocus: [],
  category: "Government", status: "Researched", assignedResearcher: "", likelihood: "Medium",
  requirements: "", applicationUrl: "", notes: "", cycleFrequency: "Annual",
};

// ── PAGE COMPONENT ────────────────────────────────────────────────────────────

export default function GrantsPage() {
  const [grants, setGrants]             = useState<Grant[]>([]);
  const [businesses, setBusinesses]     = useState<Business[]>([]);
  const [team, setTeam]                 = useState<TeamMember[]>([]);
  const [search, setSearch]             = useState("");
  const [modal, setModal]               = useState<"create" | "edit" | null>(null);
  const [editingGrant, setEditingGrant] = useState<Grant | null>(null);
  const [form, setForm]                 = useState(BLANK_FORM);
  const [sortCol, setSortCol]           = useState(-1);
  const [sortDir, setSortDir]           = useState<"asc" | "desc">("asc");

  const { ask, Dialog } = useConfirm();
  const { authRole, userProfile } = useAuth();

  const canManageAll = authRole === "admin" || authRole === "project_lead";
  const isContributorRole = authRole === "member" || authRole === "interviewer";
  const myName = userProfile?.name ?? "";

  // Members/interviewers can create grants and edit ones they're assigned to.
  const canCreate = canManageAll || isContributorRole;
  const canEditGrant = (grant: Grant) =>
    canManageAll ||
    (isContributorRole && myName !== "" && grant.assignedResearcher.toLowerCase() === myName.toLowerCase());

  // Subscribe to real-time grant updates; unsubscribe on unmount.
  useEffect(() => {
    const unsubGrants = subscribeGrants(setGrants);
    const unsubBusinesses = subscribeBusinesses(setBusinesses);
    const unsubTeam = subscribeTeam(setTeam);
    return () => { unsubGrants(); unsubBusinesses(); unsubTeam(); };
  }, []);

  const memberNameOptions = useMemo(
    () =>
      Array.from(
        new Set(
          team
            .map((member) => member.name?.trim() ?? "")
            .filter((name) => name.length > 0)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [team]
  );

  // Generic field updater used by all form inputs.
  const setField = (key: string, value: unknown) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const openCreate = () => {
    setForm({ ...BLANK_FORM, assignedResearcher: canManageAll ? "" : myName });
    setEditingGrant(null);
    setModal("create");
  };

  const openEdit = (grant: Grant) => {
    setForm({
      name:               grant.name,
      funder:             grant.funder,
      amount:             grant.amount,
      deadline:           grant.deadline,
      // Guard against undefined: Firebase omits empty arrays when storing.
      businessIds:        grant.businessIds ?? [],
      neighborhoodFocus:  grant.neighborhoodFocus ?? [],
      category:           grant.category,
      status:             grant.status,
      assignedResearcher: grant.assignedResearcher,
      likelihood:         grant.likelihood,
      requirements:       grant.requirements,
      applicationUrl:     grant.applicationUrl,
      notes:              grant.notes,
      cycleFrequency:     grant.cycleFrequency,
    });
    setEditingGrant(grant);
    setModal("edit");
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (editingGrant) {
      await updateGrant(editingGrant.id, form as Partial<Grant>);
    } else {
      await createGrant(form as Omit<Grant, "id" | "createdAt">);
    }
    setModal(null);
  };

  // Filter by search text.
  const filtered = grants.filter(grant =>
    !search
    || grant.name.toLowerCase().includes(search.toLowerCase())
    || grant.funder.toLowerCase().includes(search.toLowerCase())
  );

  const LIKELIHOOD_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  const handleSort = (i: number) => {
    if (sortCol === i) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(i); setSortDir("asc"); }
  };
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case 0: cmp = a.name.localeCompare(b.name); break;
      case 1: cmp = (a.funder || "").localeCompare(b.funder || ""); break;
      case 2: cmp = (a.amount || "").localeCompare(b.amount || ""); break;
      case 3: cmp = (a.deadline || "").localeCompare(b.deadline || ""); break;
      case 4: cmp = a.status.localeCompare(b.status); break;
      case 5: cmp = (LIKELIHOOD_ORDER[a.likelihood] ?? 1) - (LIKELIHOOD_ORDER[b.likelihood] ?? 1); break;
      case 6: cmp = (a.assignedResearcher || "").localeCompare(b.assignedResearcher || ""); break;
      case 7: cmp = (a.businessIds?.length ?? 0) - (b.businessIds?.length ?? 0); break;
      default: return 0;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <MembersLayout>
      <Dialog />

      <PageHeader
        title="Grant Library"
        subtitle={`${grants.length} grants · ${grants.filter(g => g.status === "Awarded").length} awarded`}
        action={canCreate ? <Btn variant="primary" onClick={openCreate}>+ New Grant</Btn> : undefined}
      />

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total"       value={grants.length} />
        <StatCard label="In Progress" value={grants.filter(g => g.status === "Application In Progress").length} color="text-blue-400" />
        <StatCard label="Submitted"   value={grants.filter(g => g.status === "Submitted").length} color="text-cyan-400" />
        <StatCard label="Awarded"     value={grants.filter(g => g.status === "Awarded").length} color="text-yellow-400" />
      </div>

      {/* Search and filter controls */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <SearchBar value={search} onChange={setSearch} placeholder="Search grants, funders…" />
      </div>

      {/* Grant list */}
      <Table
        cols={["Grant Name", "Funder", "Amount", "Deadline", "Status", "Likelihood", "Researcher", "Businesses", "Actions"]}
        sortCol={sortCol} sortDir={sortDir} onSort={handleSort} sortableCols={[0,1,2,3,4,5,6,7]}
        rows={sorted.map(grant => [
          <span key="name" className="text-white font-medium">{grant.name}</span>,
          <span key="funder" className="text-white/60">{grant.funder}</span>,
          <span key="amount" className="text-[#85CC17] font-mono text-sm">{grant.amount || "—"}</span>,
          <span key="deadline" className="text-white/40">{grant.deadline || "—"}</span>,
          <Badge key="status" label={grant.status} />,
          <Badge key="likelihood" label={grant.likelihood} />,
          <span key="researcher" className="text-white/50">{grant.assignedResearcher || "—"}</span>,
          <span key="businesses" className="text-white/40 text-xs">
            {(grant.businessIds ?? []).length > 0 ? `${grant.businessIds.length} linked` : "—"}
          </span>,
          <div key="actions" className="flex gap-2">
            {canEditGrant(grant) && <Btn size="sm" variant="secondary" onClick={() => openEdit(grant)}>Edit</Btn>}
            {canManageAll && <Btn size="sm" variant="danger" onClick={() => ask(async () => deleteGrant(grant.id))}>Delete</Btn>}
          </div>,
        ])}
      />
      {filtered.length === 0 && (
        <Empty
          message="No grants found."
          action={canCreate ? <Btn variant="primary" onClick={openCreate}>Add first grant</Btn> : undefined}
        />
      )}

      {/* Create / Edit modal */}
      <Modal open={modal !== null} onClose={() => setModal(null)} title={editingGrant ? "Edit Grant" : "New Grant"}>
        <div className="grid grid-cols-2 gap-4 max-h-[65vh] overflow-y-auto pr-2">
          <div className="col-span-2">
            <Field label="Grant Name" required>
              <Input value={form.name} onChange={e => setField("name", e.target.value)} />
            </Field>
          </div>
          <Field label="Funder">
            <Input value={form.funder} onChange={e => setField("funder", e.target.value)} />
          </Field>
          <Field label="Amount">
            <Input value={form.amount} onChange={e => setField("amount", e.target.value)} placeholder="e.g. $10,000" />
          </Field>
          <Field label="Deadline">
            <Input type="date" value={form.deadline} onChange={e => setField("deadline", e.target.value)} />
          </Field>
          <Field label="Category">
            <Select options={CATEGORIES} value={form.category} onChange={e => setField("category", e.target.value)} />
          </Field>
          <Field label="Status">
            <Select options={STATUSES} value={form.status} onChange={e => setField("status", e.target.value)} />
          </Field>
          <Field label="Likelihood">
            <Select options={LIKELIHOODS} value={form.likelihood} onChange={e => setField("likelihood", e.target.value)} />
          </Field>
          <Field label="Cycle Frequency">
            <Select options={FREQUENCIES} value={form.cycleFrequency} onChange={e => setField("cycleFrequency", e.target.value)} />
          </Field>
          <Field label="Assigned Researcher">
            <AutocompleteInput
              value={form.assignedResearcher}
              onChange={(value) => setField("assignedResearcher", value)}
              options={memberNameOptions}
              placeholder="Start typing a member name"
            />
          </Field>
          <div className="col-span-2">
            <Field label="Application URL">
              <Input value={form.applicationUrl} onChange={e => setField("applicationUrl", e.target.value)} placeholder="https://" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Neighborhood Focus">
              <AutocompleteTagInput
                values={form.neighborhoodFocus}
                onChange={v => setField("neighborhoodFocus", v)}
                options={NEIGHBORHOODS}
                commitOnBlur
                placeholder="Type a neighborhood, then Enter/comma"
              />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Associated Businesses">
              <div className="flex flex-wrap gap-2 mt-1">
                {businesses.map(b => {
                  const selected = (form.businessIds ?? []).includes(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        const current = form.businessIds ?? [];
                        setField("businessIds", selected
                          ? current.filter(id => id !== b.id)
                          : [...current, b.id]
                        );
                      }}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        selected
                          ? "bg-[#85CC17]/20 border-[#85CC17]/40 text-[#85CC17]"
                          : "bg-white/4 border-white/10 text-white/40 hover:text-white/70"
                      }`}
                    >
                      {b.name}
                    </button>
                  );
                })}
                {businesses.length === 0 && <span className="text-white/25 text-xs font-body">No businesses added yet.</span>}
              </div>
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Requirements">
              <TextArea rows={3} value={form.requirements} onChange={e => setField("requirements", e.target.value)} />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Notes">
              <TextArea rows={2} value={form.notes} onChange={e => setField("notes", e.target.value)} />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-white/8">
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSave}>{editingGrant ? "Save" : "Create Grant"}</Btn>
        </div>
      </Modal>
    </MembersLayout>
  );
}
