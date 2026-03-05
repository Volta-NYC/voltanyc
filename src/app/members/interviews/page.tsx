"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MembersLayout from "@/components/members/MembersLayout";
import { useAuth } from "@/lib/members/authContext";
import {
  subscribeInterviewSlots,
  subscribeTeam,
  createInterviewSlot,
  updateInterviewSlot,
  deleteBookedInterview,
  deleteInterviewSlot,
  type TeamMember,
  type InterviewSlot,
} from "@/lib/members/storage";
import { Btn, Field, Input, Modal, Select, useConfirm } from "@/components/members/ui";

function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateHeading(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function buildBookingUrl(): string {
  if (typeof window === "undefined") return "/book";
  return `${window.location.origin}/book`;
}

function getMondayForDate(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dowFromMonday = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  d.setDate(d.getDate() - dowFromMonday);
  return d;
}

function getWeekDates(weekOffset: number): Date[] {
  const monday = getMondayForDate(new Date());
  monday.setDate(monday.getDate() + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

const GRID_HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6 AM -> 11 PM
const MAX_WEEK_OFFSET = 156; // ~3 years ahead

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function hourSlotKeys(date: Date, hour: number): string[] {
  const d = toDateString(date);
  const h = String(hour).padStart(2, "0");
  return ["00", "15", "30", "45"].map((m) => `${d}T${h}:${m}`);
}

function fmtHour(h: number): string {
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12} ${ampm}`;
}

function weekOffsetFromDate(date: Date): number {
  const currentMonday = getMondayForDate(new Date());
  const targetMonday = getMondayForDate(date);
  const diffMs = targetMonday.getTime() - currentMonday.getTime();
  return Math.floor(diffMs / 604800000);
}

type DragCell = { dateISO: string; hour: number };
type DragMode = "add" | "remove";

function InterviewsContent() {
  const { user, authRole, loading } = useAuth();
  const router = useRouter();
  const { ask, Dialog } = useConfirm();

  const [activeTab, setActiveTab] = useState<"upcoming" | "availability">("upcoming");
  const [slots, setSlots] = useState<InterviewSlot[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const [copiedBookingLink, setCopiedBookingLink] = useState(false);
  const [zoomLinkInput, setZoomLinkInput] = useState("");
  const [effectiveZoomLink, setEffectiveZoomLink] = useState("");
  const [editingZoom, setEditingZoom] = useState(false);
  const [copiedZoom, setCopiedZoom] = useState(false);
  const [zoomSaveMessage, setZoomSaveMessage] = useState<string | null>(null);
  const [savingZoom, setSavingZoom] = useState(false);

  const [slotWeek, setSlotWeek] = useState(0);
  const [jumpToDate, setJumpToDate] = useState(toDateString(new Date()));
  const [dragSelection, setDragSelection] = useState<Record<string, DragCell>>({});
  const [dragMode, setDragMode] = useState<DragMode | null>(null);
  const [draggingSelection, setDraggingSelection] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [repeatWeeksInput, setRepeatWeeksInput] = useState("1");
  const [batchInterviewer, setBatchInterviewer] = useState("");
  const [applyingBatch, setApplyingBatch] = useState(false);
  const dragSelectionRef = useRef<Record<string, DragCell>>({});
  const dragModeRef = useRef<DragMode | null>(null);
  const suppressCellClickUntilRef = useRef(0);

  const canAccessInterviews = authRole === "admin" || authRole === "project_lead" || authRole === "interviewer";
  const canDeleteInterviews = authRole === "admin" || authRole === "project_lead";
  const canEditZoom = authRole === "admin" || authRole === "project_lead";

  useEffect(() => {
    if (!loading && !canAccessInterviews) {
      router.replace("/members/projects");
    }
  }, [canAccessInterviews, loading, router]);

  useEffect(() => subscribeInterviewSlots(setSlots), []);
  useEffect(() => subscribeTeam(setTeamMembers), []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/booking/zoom", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json() as {
          zoomLink?: string;
          customZoomLink?: string;
        };
        if (cancelled) return;
        const custom = (data.customZoomLink ?? "").trim();
        setEffectiveZoomLink(data.zoomLink ?? "");
        setZoomLinkInput(custom || (data.zoomLink ?? ""));
      } catch {
        if (cancelled) return;
        setEffectiveZoomLink("");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveZoomSettings = async () => {
    if (!canEditZoom) return;
    setSavingZoom(true);
    setZoomSaveMessage(null);
    try {
      const token = await user?.getIdToken();
      if (!token) {
        throw new Error("not_authenticated");
      }

      const saveRes = await fetch("/api/booking/zoom", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          zoomLink: zoomLinkInput.trim(),
          updatedBy: user?.uid ?? "",
        }),
        cache: "no-store",
      });

      if (!saveRes.ok) {
        throw new Error("save_failed");
      }

      const data = await saveRes.json() as {
        zoomLink?: string;
        customZoomLink?: string;
      };
      const custom = (data.customZoomLink ?? "").trim();
      setEffectiveZoomLink(data.zoomLink ?? "");
      setZoomLinkInput(custom || (data.zoomLink ?? ""));
      setEditingZoom(false);
      setZoomSaveMessage("Zoom link saved.");
    } catch {
      setZoomSaveMessage("Could not save zoom link. Try again.");
    } finally {
      setSavingZoom(false);
      setTimeout(() => setZoomSaveMessage(null), 2200);
    }
  };

  const copyBookingLink = async () => {
    await navigator.clipboard.writeText(buildBookingUrl());
    setCopiedBookingLink(true);
    setTimeout(() => setCopiedBookingLink(false), 1800);
  };

  const copyZoomLink = async () => {
    if (!effectiveZoomLink) return;
    await navigator.clipboard.writeText(effectiveZoomLink);
    setCopiedZoom(true);
    setTimeout(() => setCopiedZoom(false), 1800);
  };

  const now = Date.now();
  const weekDates = getWeekDates(slotWeek);

  const slotMap: Record<string, InterviewSlot> = {};
  for (const slot of slots) {
    const key = slot.datetime.slice(0, 16);
    slotMap[key] = slot;
  }

  const sortedSlots = useMemo(
    () => [...slots].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()),
    [slots]
  );

  const interviewerOptions = useMemo(
    () =>
      Array.from(
        new Set(
          teamMembers
            .map((member) => member.name?.trim() ?? "")
            .filter((name) => name.length > 0)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [teamMembers]
  );

  const upcomingBookedSlots = useMemo(
    () => sortedSlots.filter((s) => (s.bookedBy || !s.available) && new Date(s.datetime).getTime() >= now),
    [sortedSlots, now]
  );

  const upcomingBookedByDate = useMemo(() => {
    const byDate: Record<string, InterviewSlot[]> = {};
    upcomingBookedSlots.forEach((slot) => {
      const day = slot.datetime.slice(0, 10);
      if (!byDate[day]) byDate[day] = [];
      byDate[day].push(slot);
    });
    return Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0]));
  }, [upcomingBookedSlots]);

  const cancelBookedInterview = (slot: InterviewSlot) => {
    if (!canDeleteInterviews) return;
    ask(async () => {
      await deleteBookedInterview(slot.id);
    }, "Remove this booked interview and return the time to available?");
  };

  const applyHourAction = async (
    date: Date,
    hour: number,
    mode: DragMode,
    interviewerName?: string
  ) => {
    const keys = hourSlotKeys(date, hour);
    const quarterSlots = keys.map((k) => slotMap[k]).filter(Boolean);
    const visibleSlots = quarterSlots.filter((s) => s.available && !s.bookedBy);
    const cleanInterviewer = interviewerName?.trim() ?? "";

    if (mode === "remove") {
      if (!canDeleteInterviews || visibleSlots.length === 0) return;
      await Promise.all(visibleSlots.map((s) => deleteInterviewSlot(s.id)));
      return;
    }

    const updates: Promise<void>[] = [];
    quarterSlots.forEach((slot) => {
      if (slot.bookedBy) return;
      const patch: Partial<InterviewSlot> = {};
      if (!slot.available) patch.available = true;
      if (cleanInterviewer && slot.interviewerName !== cleanInterviewer) {
        patch.interviewerName = cleanInterviewer;
      }
      if (Object.keys(patch).length > 0) updates.push(updateInterviewSlot(slot.id, patch));
    });

    const missingKeys = keys.filter((k) => !slotMap[k]);
    const creates = missingKeys.map((k) =>
      createInterviewSlot({
        datetime: `${k}:00`,
        durationMinutes: 15,
        available: true,
        location: "",
        interviewerName: cleanInterviewer,
        createdBy: user?.uid ?? "",
        createdAt: Date.now(),
      })
    );

    if (updates.length > 0 || creates.length > 0) {
      await Promise.all([...updates, ...creates]);
    }
  };

  const toggleHour = async (date: Date, hour: number) => {
    const keys = hourSlotKeys(date, hour);
    const quarterSlots = keys.map((k) => slotMap[k]).filter(Boolean);
    const hasVisible = quarterSlots.some((s) => s.available && !s.bookedBy);
    const mode: DragMode = hasVisible && canDeleteInterviews ? "remove" : "add";
    await applyHourAction(date, hour, mode);
  };

  const toggleDay = async (date: Date) => {
    const hasVisible = GRID_HOURS.some((hour) =>
      hourSlotKeys(date, hour).some((k) => {
        const slot = slotMap[k];
        return !!slot && slot.available && !slot.bookedBy;
      })
    );
    const mode: DragMode = hasVisible && canDeleteInterviews ? "remove" : "add";
    for (const hour of GRID_HOURS) {
      // eslint-disable-next-line no-await-in-loop
      await applyHourAction(date, hour, mode);
    }
  };

  const toggleHourRow = async (hour: number) => {
    const futureDays = weekDates.filter((d) => {
      const dt = new Date(toDateString(d) + "T" + String(hour).padStart(2, "0") + ":00").getTime();
      return dt >= now;
    });

    const hasVisible = futureDays.some((date) =>
      hourSlotKeys(date, hour).some((k) => {
        const slot = slotMap[k];
        return !!slot && slot.available && !slot.bookedBy;
      })
    );
    const mode: DragMode = hasVisible && canDeleteInterviews ? "remove" : "add";
    for (const date of futureDays) {
      // eslint-disable-next-line no-await-in-loop
      await applyHourAction(date, hour, mode);
    }
  };

  const ensureHourVisible = async (date: Date, hour: number, interviewerName = "") => {
    await applyHourAction(date, hour, "add", interviewerName);
  };

  const applyPreset = async (startHour: number, endHour: number) => {
    const range = GRID_HOURS.filter((h) => h >= startHour && h < endHour);
    for (const date of weekDates) {
      for (const hour of range) {
        const hourTs = new Date(toDateString(date) + "T" + String(hour).padStart(2, "0") + ":00").getTime();
        if (hourTs < now) continue;
        // eslint-disable-next-line no-await-in-loop
        await ensureHourVisible(date, hour);
      }
    }
  };

  const startDragSelection = (date: Date, hour: number, isVisible: boolean, isPastHour: boolean) => {
    if (isPastHour) return;
    if (isVisible && !canDeleteInterviews) return;
    const mode: DragMode = isVisible && canDeleteInterviews ? "remove" : "add";
    const dateISO = toDateString(date);
    const key = `${dateISO}|${hour}`;
    const initial: Record<string, DragCell> = { [key]: { dateISO, hour } };
    dragSelectionRef.current = initial;
    setDragSelection(initial);
    dragModeRef.current = mode;
    setDragMode(mode);
    setDraggingSelection(true);
  };

  const extendDragSelection = (date: Date, hour: number, isVisible: boolean, isPastHour: boolean) => {
    if (!draggingSelection || !dragModeRef.current || isPastHour) return;
    const mode = dragModeRef.current;
    if (mode === "remove" && (!canDeleteInterviews || !isVisible)) return;
    const dateISO = toDateString(date);
    const key = `${dateISO}|${hour}`;
    if (dragSelectionRef.current[key]) return;
    const next = { ...dragSelectionRef.current, [key]: { dateISO, hour } };
    dragSelectionRef.current = next;
    setDragSelection(next);
  };

  const resetDragSelection = () => {
    dragSelectionRef.current = {};
    dragModeRef.current = null;
    setDragSelection({});
    setDragMode(null);
    setDraggingSelection(false);
  };

  const closeBatchModal = () => {
    setShowBatchModal(false);
    setRepeatWeeksInput("1");
    setBatchInterviewer("");
    resetDragSelection();
  };

  const applyBatchSelection = async () => {
    if (!dragMode || Object.keys(dragSelection).length === 0) {
      closeBatchModal();
      return;
    }

    const repeatWeeks = Math.max(1, Math.min(208, Number.parseInt(repeatWeeksInput, 10) || 1));
    const uniqueTargets: Record<string, DragCell> = {};

    Object.values(dragSelection).forEach((cell) => {
      for (let week = 0; week < repeatWeeks; week += 1) {
        const date = new Date(`${cell.dateISO}T00:00:00`);
        date.setDate(date.getDate() + week * 7);
        const dateISO = toDateString(date);
        const key = `${dateISO}|${cell.hour}`;
        uniqueTargets[key] = { dateISO, hour: cell.hour };
      }
    });

    setApplyingBatch(true);
    try {
      for (const cell of Object.values(uniqueTargets)) {
        const hourTs = new Date(`${cell.dateISO}T${String(cell.hour).padStart(2, "0")}:00`).getTime();
        if (hourTs < Date.now()) continue;
        // eslint-disable-next-line no-await-in-loop
        await applyHourAction(
          new Date(`${cell.dateISO}T00:00:00`),
          cell.hour,
          dragMode,
          dragMode === "add" ? batchInterviewer : ""
        );
      }
    } finally {
      setApplyingBatch(false);
      closeBatchModal();
    }
  };

  useEffect(() => {
    if (!draggingSelection) return;
    const handlePointerUp = () => {
      setDraggingSelection(false);
      const selectionCount = Object.keys(dragSelectionRef.current).length;
      if (selectionCount > 1 && dragModeRef.current) {
        suppressCellClickUntilRef.current = Date.now() + 300;
        setRepeatWeeksInput("1");
        if (dragModeRef.current === "add") setBatchInterviewer("");
        setShowBatchModal(true);
        setDragMode(dragModeRef.current);
        return;
      }
      resetDragSelection();
    };
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, [draggingSelection]);

  const onJumpDateChange = (nextDate: string) => {
    setJumpToDate(nextDate);
    if (!nextDate) return;
    const parsed = new Date(`${nextDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    const offset = weekOffsetFromDate(parsed);
    setSlotWeek(Math.max(0, Math.min(MAX_WEEK_OFFSET, offset)));
  };

  useEffect(() => {
    const dates = getWeekDates(slotWeek);
    setJumpToDate(toDateString(dates[0]));
  }, [slotWeek]);

  const getDayVisibleCount = (date: Date) => {
    const d = toDateString(date);
    let visible = 0;
    slots.forEach((slot) => {
      if (!slot.datetime.startsWith(d) || new Date(slot.datetime).getTime() < now) return;
      if (slot.available && !slot.bookedBy) visible += 1;
    });
    return visible;
  };

  const TABS: { key: "upcoming" | "availability"; label: string }[] = [
    { key: "upcoming", label: "Upcoming Interviews" },
    { key: "availability", label: "Availability" },
  ];

  if (loading || !canAccessInterviews) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#85CC17]/30 border-t-[#85CC17] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Dialog />

      <div className="mb-6">
        <h1 className="font-display font-bold text-white text-2xl">Interviews</h1>
        <p className="text-white/40 text-sm mt-1 font-body">
          Manage one public booking link, availability, and upcoming interviews.
        </p>
      </div>

      <div className="flex gap-1 bg-[#1C1F26] border border-white/8 rounded-xl p-1 mb-6 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium font-body transition-colors ${
              activeTab === tab.key ? "bg-[#85CC17] text-[#0D0D0D]" : "text-white/50 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "upcoming" && (
        <div className="space-y-5">
          <div className="bg-[#1C1F26] border border-white/8 rounded-xl p-4 space-y-3">
            <p className="text-white/85 text-sm font-semibold">Interview Booking Link</p>
            <p className="text-white/40 text-xs font-body">Use this one link for all applicants. It does not expire.</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={buildBookingUrl()}
                readOnly
                className="flex-1 bg-[#0F1014] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#85CC17] font-mono"
              />
              <Btn variant="primary" size="sm" onClick={copyBookingLink}>
                {copiedBookingLink ? "Copied!" : "Copy Link"}
              </Btn>
            </div>
          </div>

          <div className="bg-[#1C1F26] border border-white/8 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-white/85 text-sm font-semibold">Interview Zoom Link</p>
                <p className="text-white/40 text-xs mt-1 font-body">
                  Used for applicant confirmation pages and calendar .ics invites.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canEditZoom && (
                  <Btn variant="secondary" size="sm" onClick={() => setEditingZoom(true)}>
                    Edit
                  </Btn>
                )}
                <Btn variant="secondary" size="sm" onClick={copyZoomLink} disabled={!effectiveZoomLink}>
                  {copiedZoom ? "Copied!" : "Copy Link"}
                </Btn>
                <a
                  href={effectiveZoomLink || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    effectiveZoomLink
                      ? "bg-[#2D8CFF]/14 border border-[#2D8CFF]/30 text-[#6DB8FF] hover:bg-[#2D8CFF]/22"
                      : "bg-white/6 border border-white/10 text-white/35 pointer-events-none"
                  }`}
                >
                  Join
                </a>
              </div>
            </div>

            {!effectiveZoomLink && !editingZoom && (
              <p className="text-white/35 text-xs font-body">No Zoom link configured yet.</p>
            )}

            {editingZoom && canEditZoom && (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={zoomLinkInput}
                  onChange={(e) => setZoomLinkInput(e.target.value)}
                  placeholder="https://zoom.us/j/..."
                  className="flex-1 bg-[#0F1014] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#85CC17]/45"
                />
                <Btn variant="primary" size="sm" onClick={saveZoomSettings} disabled={savingZoom}>
                  {savingZoom ? "Saving..." : "Save"}
                </Btn>
                <Btn
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingZoom(false);
                    setZoomLinkInput(effectiveZoomLink);
                  }}
                >
                  Cancel
                </Btn>
              </div>
            )}

            {zoomSaveMessage && <p className="text-xs text-white/55">{zoomSaveMessage}</p>}
          </div>

          {upcomingBookedByDate.length === 0 && (
            <div className="bg-[#1C1F26] border border-white/8 rounded-xl p-8 text-center text-white/30 text-sm font-body">
              No upcoming interviews booked yet.
            </div>
          )}
          {upcomingBookedByDate.map(([day, daySlots]) => (
            <div key={day}>
              <h3 className="text-white/60 text-sm font-semibold font-body mb-2">{formatDateHeading(day)}</h3>
              <div className="space-y-2">
                {daySlots.map((slot) => {
                  const displayName = slot.bookerName?.trim() || "Interviewee";
                  return (
                    <div key={slot.id} className="bg-[#1C1F26] border border-white/8 rounded-xl px-4 py-3 flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold">{displayName}</p>
                        <p className="text-white/45 text-xs font-body mt-0.5">
                          {formatDateTime(slot.datetime)}
                          {slot.bookerEmail ? ` · ${slot.bookerEmail}` : ""}
                          {slot.interviewerName ? ` · Interviewer: ${slot.interviewerName}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {canDeleteInterviews ? (
                          <Btn size="sm" variant="danger" onClick={() => cancelBookedInterview(slot)}>
                            Cancel
                          </Btn>
                        ) : (
                          <span className="text-white/30 text-xs font-body">View only</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "availability" && (
        <div className="space-y-4">
          <div className="bg-[#1C1F26] border border-white/8 rounded-xl p-4">
            <p className="text-white/65 text-sm font-semibold">Weekly Availability</p>
            <p className="text-white/35 text-xs mt-1 font-body">
              Select hour blocks to control what times are visible on the booking page.
            </p>
            {!canDeleteInterviews && (
              <p className="text-white/35 text-xs mt-1 font-body">
                Interviewer role can add hours but cannot remove existing visible times.
              </p>
            )}
            <div className="flex flex-wrap gap-2 items-center mt-3">
              <span className="text-white/40 text-xs font-body mr-1">Quick fill:</span>
              <button
                onClick={() => applyPreset(9, 12)}
                className="px-3 py-1 rounded-lg bg-white/8 hover:bg-white/12 text-white/65 hover:text-white text-xs font-body transition-colors"
              >
                Morning (9-12)
              </button>
              <button
                onClick={() => applyPreset(12, 17)}
                className="px-3 py-1 rounded-lg bg-white/8 hover:bg-white/12 text-white/65 hover:text-white text-xs font-body transition-colors"
              >
                Afternoon (12-5)
              </button>
              <button
                onClick={() => applyPreset(9, 17)}
                className="px-3 py-1 rounded-lg bg-white/8 hover:bg-white/12 text-white/65 hover:text-white text-xs font-body transition-colors"
              >
                Business Hours (9-5)
              </button>
              <button
                onClick={() => applyPreset(6, 24)}
                className="px-3 py-1 rounded-lg bg-white/8 hover:bg-white/12 text-white/65 hover:text-white text-xs font-body transition-colors"
              >
                Full Day (6 AM-11 PM)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={() => setSlotWeek((w) => Math.max(0, w - 1))}
              disabled={slotWeek === 0}
              className="px-3 py-1.5 rounded-lg bg-white/8 text-white/65 hover:text-white hover:bg-white/12 transition-colors text-sm disabled:opacity-30"
            >
              ← Prev
            </button>
            <span className="text-white/65 text-sm font-body flex-1 text-center">
              {weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} -{" "}
              {weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
            <button
              onClick={() => setSlotWeek((w) => Math.min(MAX_WEEK_OFFSET, w + 1))}
              disabled={slotWeek === MAX_WEEK_OFFSET}
              className="px-3 py-1.5 rounded-lg bg-white/8 text-white/65 hover:text-white hover:bg-white/12 transition-colors text-sm disabled:opacity-30"
            >
              Next →
            </button>
            <button
              onClick={() => setSlotWeek(0)}
              className="px-3 py-1.5 rounded-lg bg-white/8 text-white/65 hover:text-white hover:bg-white/12 transition-colors text-sm"
            >
              Today
            </button>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-white/35 text-xs font-body">Jump to week:</span>
              <input
                type="date"
                value={jumpToDate}
                onChange={(e) => onJumpDateChange(e.target.value)}
                className="bg-[#0F1014] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#85CC17]/45"
              />
            </div>
          </div>
          <p className="text-white/30 text-xs font-body">Planning window: up to 3 years ahead.</p>

          <div className="bg-[#1C1F26] border border-white/8 rounded-xl overflow-hidden">
            <div className="grid border-b border-white/8" style={{ gridTemplateColumns: "64px repeat(7, 1fr)" }}>
              <div className="p-2 text-[10px] text-white/20 font-body text-center">hour</div>
              {weekDates.map((day, i) => {
                const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                const isToday = toDateString(day) === toDateString(new Date());
                const isPastDay = day < new Date(new Date().setHours(0, 0, 0, 0));
                const visibleCount = getDayVisibleCount(day);
                return (
                  <button
                    key={i}
                    onClick={() => !isPastDay && toggleDay(day)}
                    disabled={isPastDay}
                    title={isPastDay ? undefined : canDeleteInterviews ? "Toggle entire day" : "Add missing hours for this day"}
                    className={`py-2 text-center text-xs font-medium font-body border-l border-white/6 transition-colors ${
                      isPastDay ? "opacity-30 cursor-default" : "hover:bg-white/5 cursor-pointer"
                    } ${isToday ? "text-[#85CC17]" : "text-white/45"}`}
                  >
                    <div>{dayNames[day.getDay()]}</div>
                    <div className={`text-[10px] mt-0.5 ${isToday ? "text-[#85CC17]/80" : "text-white/25"}`}>
                      {day.getMonth() + 1}/{day.getDate()}
                    </div>
                    <div className="text-[10px] mt-1 text-white/30">{visibleCount} visible</div>
                  </button>
                );
              })}
            </div>

            {GRID_HOURS.map((hour) => (
              <div key={hour} className="grid border-b border-white/4" style={{ gridTemplateColumns: "64px repeat(7, 1fr)" }}>
                <button
                  onClick={() => toggleHourRow(hour)}
                  title={canDeleteInterviews ? "Toggle this hour across all days" : "Add this hour across all days"}
                  className="flex items-center justify-center py-3 text-[11px] text-white/35 hover:text-white/70 font-body transition-colors cursor-pointer hover:bg-white/5"
                >
                  {fmtHour(hour)}
                </button>

                {weekDates.map((day, dayIdx) => {
                  const d = toDateString(day);
                  const h = String(hour).padStart(2, "0");
                  const keys = hourSlotKeys(day, hour);
                  const quarterSlots = keys.map((k) => slotMap[k]).filter(Boolean);
                  const visibleCount = quarterSlots.filter((s) => s.available && !s.bookedBy).length;
                  const isPastHour = new Date(`${d}T${h}:59`).getTime() < now;
                  const isVisible = visibleCount > 0;
                  const cannotRemoveVisible = !canDeleteInterviews && isVisible;
                  const disabled = isPastHour || cannotRemoveVisible;
                  const isPartiallyVisible = visibleCount > 0 && visibleCount < 4;
                  const selectionKey = `${d}|${hour}`;
                  const isSelectedInDrag = !!dragSelection[selectionKey];

                  let cellClass = "bg-white/10 hover:bg-white/25";
                  if (isVisible) cellClass = "bg-[#85CC17]/70 hover:bg-[#85CC17]/45";
                  if (isPartiallyVisible) cellClass = "bg-[#85CC17]/45 hover:bg-[#85CC17]/35";

                  const title = (() => {
                    const label = fmtHour(hour);
                    if (isPastHour) return `${label} - Past`;
                    if (cannotRemoveVisible) return `${label} - Visible (interviewer cannot remove)`;
                    if (isVisible) return `${label} - Visible on booking page`;
                    return `${label} - Hidden on booking page`;
                  })();

                  return (
                    <div key={dayIdx} className="relative border-l border-white/6">
                      <button
                        disabled={disabled}
                        onPointerDown={(e) => {
                          if (disabled) return;
                          e.preventDefault();
                          startDragSelection(day, hour, isVisible, isPastHour);
                        }}
                        onPointerEnter={() => {
                          if (disabled) return;
                          extendDragSelection(day, hour, isVisible, isPastHour);
                        }}
                        onClick={() => {
                          if (Date.now() < suppressCellClickUntilRef.current) return;
                          void toggleHour(day, hour);
                        }}
                        title={title}
                        className={`w-full h-11 rounded-none transition-colors ${
                          disabled ? `${cellClass} cursor-default ${isPastHour ? "opacity-20" : "opacity-70"}` : `${cellClass} cursor-pointer`
                        } ${isSelectedInDrag ? "ring-2 ring-inset ring-[#85CC17]" : ""}`}
                        style={{
                          touchAction: "none",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-white/40 font-body">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[#85CC17]/20 border border-[#85CC17]/40" />
              Visible to applicants
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-white/8" />
              {canDeleteInterviews
                ? "Click to toggle · drag across cells to batch apply recurring changes"
                : "Click hidden hour blocks (or quick fill) to add visible times · drag for batch add"}
            </span>
          </div>
        </div>
      )}

      <Modal
        open={showBatchModal}
        onClose={closeBatchModal}
        title={dragMode === "remove" ? "Remove Selected Availability" : "Add Selected Availability"}
      >
        <div className="space-y-4">
          <p className="text-white/55 text-sm font-body">
            {Object.keys(dragSelection).length} hour blocks selected in this week.
          </p>
          <Field label="Repeat For (Weeks)">
            <Input
              type="number"
              min={1}
              max={208}
              value={repeatWeeksInput}
              onChange={(e) => setRepeatWeeksInput(e.target.value)}
            />
          </Field>
          {dragMode === "add" && (
            <Field label="Interviewer Name">
              {interviewerOptions.length > 0 ? (
                <Select
                  options={interviewerOptions}
                  value={batchInterviewer}
                  onChange={(e) => setBatchInterviewer(e.target.value)}
                />
              ) : (
                <Input
                  value={batchInterviewer}
                  onChange={(e) => setBatchInterviewer(e.target.value)}
                  placeholder="Optional interviewer assignment"
                />
              )}
            </Field>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="ghost" onClick={closeBatchModal} disabled={applyingBatch}>
            Cancel
          </Btn>
          <Btn
            variant={dragMode === "remove" ? "danger" : "primary"}
            onClick={applyBatchSelection}
            disabled={applyingBatch}
          >
            {applyingBatch ? "Applying..." : "Apply"}
          </Btn>
        </div>
      </Modal>
    </>
  );
}

export default function InterviewsPage() {
  return (
    <MembersLayout>
      <InterviewsContent />
    </MembersLayout>
  );
}
