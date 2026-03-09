"use client";

import { useState, useEffect } from "react";
import MembersLayout from "@/components/members/MembersLayout";
import {
  PageHeader, SearchBar, Badge, Btn, Modal, Field, Input, Select, TextArea,
  Empty, StatCard, useConfirm,
} from "@/components/members/ui";
import {
  subscribeBIDs, createBID, updateBID, deleteBID,
  addBIDTimelineEntry, deleteBIDTimelineEntry,
  type BID,
} from "@/lib/members/storage";
import { useAuth } from "@/lib/members/authContext";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const STATUSES   = ["Active Partner", "In Conversation", "Outreach", "Paused", "Dead"];
const BOROUGHS   = ["Brooklyn", "Queens", "Manhattan", "Bronx", "Staten Island"];
const PRIORITIES = ["High", "Medium", "Low"];
const SORT_OPTIONS = [
  { value: "status", label: "Status" },
  { value: "name", label: "Name" },
] as const;
type SortMode = (typeof SORT_OPTIONS)[number]["value"];

const BID_STATUS_SORT_ORDER: Record<BID["status"], number> = {
  "Active Partner": 0,
  "In Conversation": 1,
  Outreach: 2,
  Paused: 3,
  Dead: 4,
};

function nextSortIndex(items: BID[]): number {
  const max = items.reduce((best, item) => {
    const value = item.sortIndex ?? 0;
    return value > best ? value : best;
  }, 0);
  return max + 1000;
}

// Blank form values for creating a new BID record.
const BLANK_FORM: Omit<BID, "id" | "createdAt" | "updatedAt" | "timeline"> = {
  name: "", status: "Outreach", contactName: "", contactEmail: "", phone: "",
  borough: "", nextAction: "", notes: "", priority: "Medium",
};

// ── PAGE COMPONENT ────────────────────────────────────────────────────────────

export default function BIDTrackerPage() {
  const [bids, setBids]               = useState<BID[]>([]);
  const [search, setSearch]           = useState("");
  const [sortMode, setSortMode]       = useState<SortMode>("status");
  const [modal, setModal]             = useState<"create" | "edit" | null>(null);
  const [editingBID, setEditingBID]   = useState<BID | null>(null);
  const [form, setForm]               = useState(BLANK_FORM);
  const [timelineDrafts, setTimelineDrafts] = useState<
    Record<string, { date: string; action: string; saving: boolean }>
  >({});

  const { ask, Dialog } = useConfirm();
  const { authRole }    = useAuth();
  const canEdit = authRole === "admin" || authRole === "project_lead";

  // Subscribe to real-time BID updates; unsubscribe on unmount.
  useEffect(() => subscribeBIDs(setBids), []);

  // Generic field updater used by all form inputs.
  const setField = (key: string, value: unknown) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const openCreate = () => {
    setForm(BLANK_FORM);
    setEditingBID(null);
    setModal("create");
  };

  const openEdit = (bid: BID) => {
    setForm({
      name:         bid.name,
      status:       bid.status,
      contactName:  bid.contactName,
      contactEmail: bid.contactEmail,
      phone:        bid.phone,
      borough:      bid.borough,
      nextAction:   bid.nextAction,
      notes:        bid.notes,
      priority:     bid.priority as BID["priority"],
    });
    setEditingBID(bid);
    setModal("edit");
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (editingBID) {
      await updateBID(editingBID.id, form as Partial<BID>);
    } else {
      await createBID({
        ...form,
        sortIndex: nextSortIndex(bids),
      } as Omit<BID, "id" | "createdAt" | "updatedAt" | "timeline">);
    }
    setModal(null);
  };

  const handleDelete = (id: string) => ask(async () => deleteBID(id));

  const defaultTimelineDraft = () => ({
    date: new Date().toISOString().split("T")[0],
    action: "",
    saving: false,
  });

  const getTimelineDraft = (bidId: string) =>
    timelineDrafts[bidId] ?? defaultTimelineDraft();

  const setTimelineDraft = (
    bidId: string,
    patch: Partial<{ date: string; action: string; saving: boolean }>
  ) => {
    setTimelineDrafts((prev) => ({
      ...prev,
      [bidId]: { ...(prev[bidId] ?? defaultTimelineDraft()), ...patch },
    }));
  };

  const handleAddTimeline = async (bidId: string) => {
    const draft = getTimelineDraft(bidId);
    if (!draft.action.trim()) return;
    setTimelineDraft(bidId, { saving: true });
    await addBIDTimelineEntry(bidId, {
      date: draft.date,
      action: draft.action.trim(),
      createdAt: new Date().toISOString(),
    });
    setTimelineDraft(bidId, { action: "", saving: false });
  };

  const handleDeleteTimeline = (bidId: string, entryId: string) => {
    ask(async () => deleteBIDTimelineEntry(bidId, entryId));
  };

  // Build timeline array from the nested Firebase object, newest first.
  const getTimeline = (bid: BID | null) => {
    if (!bid?.timeline) return [];
    return Object.entries(bid.timeline)
      .map(([id, entry]) => ({ ...entry, id }))
      .sort((a, b) => b.date.localeCompare(a.date));
  };

  const matchesSearch = (bid: BID) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return bid.name.toLowerCase().includes(query)
      || bid.borough.toLowerCase().includes(query)
      || bid.contactName.toLowerCase().includes(query);
  };

  const sortBids = (list: BID[]) => {
    if (sortMode === "name") {
      return [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...list].sort((a, b) => {
      const statusDelta = BID_STATUS_SORT_ORDER[a.status] - BID_STATUS_SORT_ORDER[b.status];
      if (statusDelta !== 0) return statusDelta;
      return a.name.localeCompare(b.name);
    });
  };

  const filtered = bids.filter(matchesSearch);
  const sorted = sortBids(filtered);

  const stats = {
    total:    bids.length,
    active:   bids.filter(b => b.status === "Active Partner").length,
    pipeline: bids.filter(b => ["Outreach", "In Conversation"].includes(b.status)).length,
  };

  return (
    <MembersLayout>
      <Dialog />

      <PageHeader
        title="BID Tracker"
        subtitle={`${stats.total} BIDs · ${stats.active} active · ${stats.pipeline} in pipeline`}
        action={canEdit ? <Btn variant="primary" onClick={openCreate}>+ New BID</Btn> : undefined}
      />

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard label="Total BIDs"      value={stats.total} />
        <StatCard label="Active Partners" value={stats.active} color="text-green-400" />
        <StatCard label="In Pipeline"     value={stats.pipeline} color="text-blue-400" />
      </div>

      {/* Search and filter controls */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <SearchBar value={search} onChange={setSearch} placeholder="Search BIDs, boroughs…" />
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="bg-[#1C1F26] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white/70 focus:outline-none"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {/* BID cards with inline timeline */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {sorted.map((bid) => {
          const timeline = getTimeline(bid);
          const draft = getTimelineDraft(bid.id);
          return (
            <div
              key={bid.id}
              className="bg-[#1C1F26] border border-white/8 rounded-xl p-3 sm:p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2 min-w-0 flex-1">
                  <p className="text-white font-semibold truncate">{bid.name}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-white/45">
                    <span>{bid.borough || "No borough"}</span>
                    <span>•</span>
                    <span>{bid.contactName || "No contact"}</span>
                    {bid.contactEmail && (
                      <>
                        <span>•</span>
                        <a href={`mailto:${bid.contactEmail}`} className="text-[#85CC17]/75 hover:text-[#85CC17] transition-colors">
                          {bid.contactEmail}
                        </a>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge label={bid.status} />
                    <Badge label={bid.priority} />
                  </div>
                </div>
                {canEdit && (
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <Btn size="sm" variant="secondary" className="px-2.5 py-1 text-xs w-full sm:w-auto" onClick={() => openEdit(bid)}>Edit</Btn>
                    <Btn size="sm" variant="danger" className="px-2.5 py-1 text-xs w-full sm:w-auto" onClick={() => handleDelete(bid.id)}>Delete</Btn>
                  </div>
                )}
              </div>

              {(bid.nextAction || bid.notes) && (
                <div className="mt-3 bg-white/4 border border-white/6 rounded-lg px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-white/35 mb-1">Notes / Next Action</p>
                  <p className="text-sm text-white/70">{bid.nextAction || bid.notes}</p>
                </div>
              )}

              <div className="mt-3 border-t border-white/8 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs uppercase tracking-wider text-white/40 font-semibold">Activity Timeline</h3>
                  <span className="text-[11px] text-white/35">{timeline.length} entries</span>
                </div>

                <div className="space-y-1.5 max-h-36 sm:max-h-40 overflow-y-auto pr-1">
                  {timeline.length === 0 ? (
                    <p className="text-xs text-white/30">No activity logged yet.</p>
                  ) : (
                    timeline.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-2 rounded-lg border border-white/7 bg-[#0F1014] px-2.5 py-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] text-white/30 block mb-0.5">{entry.date}</span>
                          <p className="text-xs sm:text-sm text-white/70 leading-snug">{entry.action ?? entry.note ?? ""}</p>
                        </div>
                        {canEdit && (
                          <button
                            onClick={() => handleDeleteTimeline(bid.id, entry.id)}
                            className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                            aria-label="Delete timeline entry"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {canEdit && (
                  <div className="mt-2.5 rounded-lg border border-white/8 bg-[#141821] p-2.5 space-y-2">
                    <p className="text-[11px] text-white/45">Log activity</p>
                    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] gap-2">
                      <input
                        type="date"
                        value={draft.date}
                        onChange={(e) => setTimelineDraft(bid.id, { date: e.target.value })}
                        className="w-full bg-[#0F1014] border border-white/10 rounded-lg px-2 py-1.5 text-xs sm:text-sm text-white focus:outline-none"
                      />
                      <textarea
                        value={draft.action}
                        onChange={(e) => setTimelineDraft(bid.id, { action: e.target.value })}
                        placeholder="Action"
                        rows={1}
                        className="w-full bg-[#0F1014] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm text-white placeholder-white/25 focus:outline-none resize-none font-body"
                      />
                      <Btn
                        variant="primary"
                        size="sm"
                        className="w-full sm:w-auto justify-center"
                        onClick={() => handleAddTimeline(bid.id)}
                        disabled={draft.saving || !draft.action.trim()}
                      >
                        {draft.saving ? "Saving…" : "+ Add"}
                      </Btn>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="sm:col-span-2 lg:col-span-3">
            <Empty
              message="No BIDs match your filters."
              action={canEdit ? <Btn variant="primary" onClick={openCreate}>Add first BID</Btn> : undefined}
            />
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === "create" ? "New BID" : "Edit BID"}>
        <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-4">

          {/* Form fields */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="BID Name" required>
              <Input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="e.g. Park Slope BID" />
            </Field>
            <Field label="Status">
              <Select options={STATUSES} value={form.status} onChange={e => setField("status", e.target.value)} />
            </Field>
            <Field label="Contact Name">
              <Input value={form.contactName} onChange={e => setField("contactName", e.target.value)} />
            </Field>
            <Field label="Contact Email">
              <Input type="email" value={form.contactEmail} onChange={e => setField("contactEmail", e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={e => setField("phone", e.target.value)} />
            </Field>
            <Field label="Priority">
              <Select options={PRIORITIES} value={form.priority} onChange={e => setField("priority", e.target.value)} />
            </Field>
            <Field label="Borough">
              <Select options={["", ...BOROUGHS]} value={form.borough} onChange={e => setField("borough", e.target.value)} />
            </Field>
            <div />
            <div className="col-span-2">
              <Field label="Notes / Next Action">
                <TextArea rows={3} value={form.nextAction} onChange={e => setField("nextAction", e.target.value)} placeholder="Next steps, context, notes…" />
              </Field>
            </div>
          </div>

        </div>

        <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-white/8">
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSave}>{editingBID ? "Save Changes" : "Create BID"}</Btn>
        </div>
      </Modal>
    </MembersLayout>
  );
}
