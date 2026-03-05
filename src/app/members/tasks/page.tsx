"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import MembersLayout from "@/components/members/MembersLayout";
import {
  PageHeader, SearchBar, Badge, Btn, Modal, Field, Input, Select, TextArea,
  Table, Empty, AutocompleteInput, useConfirm,
} from "@/components/members/ui";
import {
  subscribeTasks, subscribeTeam, createTask, updateTask, deleteTask, type Task, type TeamMember,
} from "@/lib/members/storage";
import { useAuth } from "@/lib/members/authContext";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const STATUSES  = ["To Do", "On Hold"];
const PRIORITIES = ["Urgent", "High", "Medium", "Low"];
const DIVISIONS  = ["Tech", "Marketing", "Finance", "Outreach"];

// Blank form values for creating a new task.
const BLANK_FORM: Omit<Task, "id" | "createdAt"> = {
  name: "", status: "To Do", priority: "Medium", assignedTo: "", businessId: "",
  division: "Tech", dueDate: "", week: "", notes: "", blocker: "", completedAt: "",
};

// Ordered columns for the kanban board view.
const BOARD_COLUMNS = ["To Do", "On Hold"] as const;
type BoardStatus = (typeof BOARD_COLUMNS)[number];

// Left border color for each kanban column.
const COLUMN_BORDER_COLOR: Record<string, string> = {
  "To Do":   "border-gray-500/30",
  "On Hold": "border-amber-500/30",
};

function normalizeStatus(status: Task["status"]): BoardStatus {
  return status === "To Do" ? "To Do" : "On Hold";
}

// ── PAGE COMPONENT ────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [tasks, setTasks]             = useState<Task[]>([]);
  const [team, setTeam]               = useState<TeamMember[]>([]);
  const [search, setSearch]           = useState("");
  const [filterDiv, setFilterDiv]     = useState("");
  const [view, setView]               = useState<"board" | "table">("board");
  const [modal, setModal]             = useState<"create" | "edit" | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm]               = useState(BLANK_FORM);
  const [draggingId, setDraggingId]   = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [sortCol, setSortCol]         = useState(-1);
  const [sortDir, setSortDir]         = useState<"asc" | "desc">("asc");

  const { ask, Dialog } = useConfirm();
  const { authRole }    = useAuth();
  const router = useRouter();
  const canEdit = authRole === "admin";

  useEffect(() => {
    if (authRole && authRole !== "admin") router.replace("/members/projects");
  }, [authRole, router]);

  // Subscribe to real-time task updates; unsubscribe on unmount.
  useEffect(() => subscribeTasks(setTasks), []);
  useEffect(() => subscribeTeam(setTeam), []);

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

  // Open create modal, optionally pre-selecting the column's status.
  const openCreate = (status?: BoardStatus) => {
    setForm({ ...BLANK_FORM, status: status ?? "To Do" });
    setEditingTask(null);
    setModal("create");
  };

  const openEdit = (task: Task) => {
    setForm({
      name:        task.name,
      status:      normalizeStatus(task.status),
      priority:    task.priority,
      assignedTo:  task.assignedTo,
      businessId:  task.businessId,
      division:    task.division,
      dueDate:     task.dueDate,
      week:        task.week,
      notes:       task.notes,
      blocker:     task.blocker,
      completedAt: task.completedAt,
    });
    setEditingTask(task);
    setModal("edit");
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (editingTask) {
      await updateTask(editingTask.id, form as Partial<Task>);
    } else {
      await createTask(form as Omit<Task, "id" | "createdAt">);
    }
    setModal(null);
  };

  // Filter by search text and/or division dropdown.
  const filtered = tasks.filter(task =>
    task.status !== "Done"
    && (
    (!search
      || task.name.toLowerCase().includes(search.toLowerCase())
      || task.assignedTo.toLowerCase().includes(search.toLowerCase()))
    && (!filterDiv || task.division === filterDiv)
    )
  );

  const TASK_PRIORITY_ORDER: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
  const TASK_STATUS_ORDER: Record<string, number> = { "To Do": 0, "On Hold": 1 };
  const handleSort = (i: number) => {
    if (sortCol === i) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(i); setSortDir("asc"); }
  };
  const sortedTasks = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case 0: cmp = a.name.localeCompare(b.name); break;
      case 1: cmp = (TASK_STATUS_ORDER[normalizeStatus(a.status)] ?? 0) - (TASK_STATUS_ORDER[normalizeStatus(b.status)] ?? 0); break;
      case 2: cmp = (TASK_PRIORITY_ORDER[a.priority] ?? 2) - (TASK_PRIORITY_ORDER[b.priority] ?? 2); break;
      case 3: cmp = a.division.localeCompare(b.division); break;
      case 4: cmp = (a.assignedTo || "").localeCompare(b.assignedTo || ""); break;
      case 5: cmp = (a.dueDate || "").localeCompare(b.dueDate || ""); break;
      default: return 0;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  if (authRole && authRole !== "admin") {
    return (
      <MembersLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-[#85CC17]/30 border-t-[#85CC17] rounded-full animate-spin" />
        </div>
      </MembersLayout>
    );
  }

  return (
    <MembersLayout>
      <Dialog />

      <PageHeader
        title="Tasks"
        subtitle={`${filtered.length} open · ${filtered.filter(t => normalizeStatus(t.status) === "On Hold").length} on hold`}
        action={
          <div className="flex gap-2">
            {/* Board / Table view toggle */}
            <div className="flex bg-[#1C1F26] border border-white/8 rounded-lg p-0.5">
              {(["board", "table"] as const).map(viewMode => (
                <button
                  key={viewMode}
                  onClick={() => setView(viewMode)}
                  className={`px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors ${
                    view === viewMode ? "bg-[#85CC17] text-[#0D0D0D]" : "text-white/40 hover:text-white"
                  }`}
                >
                  {viewMode}
                </button>
              ))}
            </div>
            {canEdit && <Btn variant="primary" onClick={() => openCreate()}>+ Task</Btn>}
          </div>
        }
      />

      {/* Search and filter controls */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <SearchBar value={search} onChange={setSearch} placeholder="Search tasks, assignees…" />
        <select
          value={filterDiv}
          onChange={e => setFilterDiv(e.target.value)}
          className="bg-[#1C1F26] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white/70 focus:outline-none"
        >
          <option value="">All divisions</option>
          {DIVISIONS.map(d => <option key={d}>{d}</option>)}
        </select>
      </div>

      {/* ── Board view ── */}
      {view === "board" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-3">
          {BOARD_COLUMNS.map(column => {
            const columnTasks = filtered.filter(t => normalizeStatus(t.status) === column);
            return (
              <div
                key={column}
                className={`bg-[#1C1F26] border ${COLUMN_BORDER_COLOR[column]} rounded-xl p-3 min-h-[200px] transition-colors
                  ${dragOverColumn === column ? "bg-[#1C1F26]/80 border-white/20" : ""}`}
                onDragOver={e => e.preventDefault()}
                onDragEnter={() => setDragOverColumn(column)}
                onDragLeave={e => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverColumn(null);
                }}
                onDrop={async e => {
                  e.preventDefault();
                  setDragOverColumn(null);
                  if (draggingId) {
                    await updateTask(draggingId, { status: column as Task["status"] });
                    setDraggingId(null);
                  }
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-white/50 uppercase tracking-wider">{column}</span>
                  <span className="text-xs bg-white/8 text-white/40 px-1.5 py-0.5 rounded-full">{columnTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {columnTasks.map(task => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => setDraggingId(task.id)}
                      onDragEnd={() => setDraggingId(null)}
                      className={`bg-[#0F1014] border border-white/5 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-white/15 transition-all
                        ${draggingId === task.id ? "opacity-40 scale-95" : ""}`}
                      onClick={() => canEdit ? openEdit(task) : undefined}
                    >
                      <p className="text-white text-sm font-medium leading-snug mb-1.5">{task.name}</p>
                      <div className="flex flex-wrap gap-1">
                        <Badge label={task.priority} />
                        <span className="text-xs text-white/30">{task.division}</span>
                      </div>
                      {task.assignedTo && (
                        <p className="text-white/30 text-xs mt-1.5">→ {task.assignedTo}</p>
                      )}
                      {task.dueDate && (
                        <p className="text-white/20 text-xs mt-0.5">Due {task.dueDate}</p>
                      )}
                    </div>
                  ))}
                  {canEdit && (
                    <button
                      onClick={() => openCreate(column)}
                      className="w-full text-white/20 hover:text-white/50 text-xs py-2 border border-dashed border-white/8 rounded-lg transition-colors"
                    >
                      + Add task
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Table view ── */
        <>
          <Table
            cols={["Task", "Status", "Priority", "Division", "Assigned To", "Due Date", "Actions"]}
            sortCol={sortCol} sortDir={sortDir} onSort={handleSort} sortableCols={[0,1,2,3,4,5]}
            rows={sortedTasks.map(task => [
              <span key="name" className="text-white font-medium">{task.name}</span>,
              <Badge key="status" label={normalizeStatus(task.status)} />,
              <Badge key="priority" label={task.priority} />,
              <span key="division" className="text-white/50">{task.division}</span>,
              <span key="assigned" className="text-white/50">{task.assignedTo || "—"}</span>,
              <span key="due" className="text-white/40">{task.dueDate || "—"}</span>,
              <div key="actions" className="flex gap-2">
                {canEdit && <Btn size="sm" variant="secondary" onClick={() => openEdit(task)}>Edit</Btn>}
                {canEdit && <Btn size="sm" variant="danger" onClick={() => ask(async () => deleteTask(task.id))}>Delete</Btn>}
              </div>,
            ])}
          />
          {filtered.length === 0 && (
            <Empty
              message="No tasks yet."
              action={canEdit ? <Btn variant="primary" onClick={() => openCreate()}>Add first task</Btn> : undefined}
            />
          )}
        </>
      )}

      {/* Create / Edit modal */}
      <Modal open={modal !== null} onClose={() => setModal(null)} title={editingTask ? "Edit Task" : "New Task"}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Task Name" required>
              <Input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="What needs to happen?" />
            </Field>
          </div>
          <Field label="Status">
            <Select options={STATUSES} value={form.status} onChange={e => setField("status", e.target.value)} />
          </Field>
          <Field label="Priority">
            <Select options={PRIORITIES} value={form.priority} onChange={e => setField("priority", e.target.value)} />
          </Field>
          <Field label="Division">
            <Select options={DIVISIONS} value={form.division} onChange={e => setField("division", e.target.value)} />
          </Field>
          <Field label="Assigned To">
            <AutocompleteInput
              value={form.assignedTo}
              onChange={(value) => setField("assignedTo", value)}
              options={memberNameOptions}
              placeholder="Start typing a member name"
            />
          </Field>
          <Field label="Due Date">
            <Input type="date" value={form.dueDate} onChange={e => setField("dueDate", e.target.value)} />
          </Field>
          <div className="col-span-2">
            <Field label="Blocker">
              <Input value={form.blocker} onChange={e => setField("blocker", e.target.value)} />
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
          <Btn variant="primary" onClick={handleSave}>{editingTask ? "Save" : "Create Task"}</Btn>
        </div>
      </Modal>
    </MembersLayout>
  );
}
