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
  updateInterviewSettings,
  deleteBookedInterview,
  deleteInterviewSlot,
  type TeamMember,
  type InterviewSlot,
} from "@/lib/members/storage";
import { Btn, Field, Modal, AutocompleteInput, useConfirm } from "@/components/members/ui";
import { DEFAULT_INTERVIEW_ZOOM_LINK } from "@/lib/interviews/config";

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

const FALLBACK_BOOKING_URL = "https://voltanyc.org/book";

function getMondayForDate(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dowFromMonday = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  d.setDate(d.getDate() - dowFromMonday);
  return d;
}

function getWeekDates(weekOffset: number, referenceDate: Date): Date[] {
  const monday = getMondayForDate(referenceDate);
  monday.setDate(monday.getDate() + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

const GRID_HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6 AM -> 11 PM
const QUARTER_MINUTES = [0, 15, 30, 45] as const;
const GRID_ROWS = GRID_HOURS.length * QUARTER_MINUTES.length;
const MAX_WEEK_OFFSET = 2; // current week + next 2 weeks

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function slotKey(dateISO: string, hour: number, minute: number): string {
  const h = String(hour).padStart(2, "0");
  const m = String(minute).padStart(2, "0");
  return `${dateISO}T${h}:${m}`;
}

function rowIndexFromTime(hour: number, minute: number): number {
  const hourOffset = hour - GRID_HOURS[0];
  const quarterIndex = QUARTER_MINUTES.indexOf(minute as (typeof QUARTER_MINUTES)[number]);
  return hourOffset * QUARTER_MINUTES.length + quarterIndex;
}

function timeFromRowIndex(rowIndex: number): { hour: number; minute: number } | null {
  if (rowIndex < 0 || rowIndex >= GRID_ROWS) return null;
  const hourOffset = Math.floor(rowIndex / QUARTER_MINUTES.length);
  const quarterIndex = rowIndex % QUARTER_MINUTES.length;
  const hour = GRID_HOURS[0] + hourOffset;
  const minute = QUARTER_MINUTES[quarterIndex];
  if (!GRID_HOURS.includes(hour)) return null;
  return { hour, minute };
}

function fmtHour(h: number): string {
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12} ${ampm}`;
}

function fmtTimeOption(hour: number, minute: number): string {
  const ampm = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${ampm}`;
}

function parseDateInput(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const y = Number.parseInt(isoMatch[1], 10);
    const m = Number.parseInt(isoMatch[2], 10);
    const d = Number.parseInt(isoMatch[3], 10);
    const dt = new Date(y, m - 1, d);
    if (
      !Number.isNaN(dt.getTime())
      && dt.getFullYear() === y
      && dt.getMonth() === m - 1
      && dt.getDate() === d
    ) {
      return toDateString(dt);
    }
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDateString(parsed);
}

function parseTimeInput(raw: string): { hour: number; minute: number } | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;

  const match = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;

  const hourPart = Number.parseInt(match[1], 10);
  const minutePart = match[2] ? Number.parseInt(match[2], 10) : 0;
  const meridiem = match[3] ?? null;
  if (Number.isNaN(hourPart) || Number.isNaN(minutePart)) return null;
  if (!QUARTER_MINUTES.includes(minutePart as (typeof QUARTER_MINUTES)[number])) return null;

  let hour24 = hourPart;
  if (meridiem) {
    if (hourPart < 1 || hourPart > 12) return null;
    hour24 = hourPart % 12;
    if (meridiem === "pm") hour24 += 12;
  } else {
    if (hourPart < 0 || hourPart > 23) return null;
  }

  if (!GRID_HOURS.includes(hour24)) return null;
  return { hour: hour24, minute: minutePart };
}

function mapZoomSaveError(code: string): string {
  if (code.includes("not_authenticated") || code.includes("unauthorized")) {
    return "Could not save zoom link: sign in again and retry.";
  }
  if (code.includes("forbidden")) {
    return "Could not save zoom link: your account is missing admin/project lead permissions.";
  }
  if (code.includes("db_patch_failed")) {
    return "Could not save zoom link: server could not write interviewSettings in Firebase.";
  }
  return "Could not save zoom link. Try again.";
}

function weekOffsetFromDate(date: Date, referenceDate: Date): number {
  const currentMonday = getMondayForDate(referenceDate);
  const targetMonday = getMondayForDate(date);
  const diffMs = targetMonday.getTime() - currentMonday.getTime();
  return Math.floor(diffMs / 604800000);
}

type DragCell = { dateISO: string; hour: number; minute: number; rowIndex: number };
type DragMode = "add" | "remove";
type DragAnchor = { dayIndex: number; rowIndex: number };

function InterviewsContent() {
  const { user, authRole, loading } = useAuth();
  const router = useRouter();
  const { ask, Dialog } = useConfirm();

  const [activeTab, setActiveTab] = useState<"upcoming" | "availability">("upcoming");
  const [slots, setSlots] = useState<InterviewSlot[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const [copiedBookingLink, setCopiedBookingLink] = useState(false);
  const [bookingLink, setBookingLink] = useState(FALLBACK_BOOKING_URL);
  const [zoomLinkInput, setZoomLinkInput] = useState(DEFAULT_INTERVIEW_ZOOM_LINK);
  const [effectiveZoomLink, setEffectiveZoomLink] = useState(DEFAULT_INTERVIEW_ZOOM_LINK);
  const [editingZoom, setEditingZoom] = useState(false);
  const [copiedZoom, setCopiedZoom] = useState(false);
  const [zoomSaveMessage, setZoomSaveMessage] = useState<string | null>(null);
  const [savingZoom, setSavingZoom] = useState(false);

  const [slotWeek, setSlotWeek] = useState(0);
  const [windowAnchor, setWindowAnchor] = useState(() => new Date());
  const [jumpToDate, setJumpToDate] = useState(toDateString(new Date()));
  const [dragSelection, setDragSelection] = useState<Record<string, DragCell>>({});
  const [dragMode, setDragMode] = useState<DragMode | null>(null);
  const [draggingSelection, setDraggingSelection] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [removeWeekly, setRemoveWeekly] = useState(false);
  const [batchInterviewer, setBatchInterviewer] = useState("");
  const [applyingBatch, setApplyingBatch] = useState(false);
  const [manualStartDateInput, setManualStartDateInput] = useState(toDateString(new Date()));
  const [manualEndDateInput, setManualEndDateInput] = useState(toDateString(new Date()));
  const [manualStartTimeInput, setManualStartTimeInput] = useState("9:00 AM");
  const [manualEndTimeInput, setManualEndTimeInput] = useState("10:00 AM");
  const [manualRepeatWeekly, setManualRepeatWeekly] = useState(false);
  const [manualInterviewer, setManualInterviewer] = useState("");
  const [manualAddMessage, setManualAddMessage] = useState<string | null>(null);
  const [addingManualAvailability, setAddingManualAvailability] = useState(false);
  const dragSelectionRef = useRef<Record<string, DragCell>>({});
  const dragModeRef = useRef<DragMode | null>(null);
  const dragAnchorRef = useRef<DragAnchor | null>(null);

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
    if (typeof window === "undefined") return;
    setBookingLink(`${window.location.origin}/book`);
  }, []);

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
        const effective = (data.zoomLink ?? "").trim() || DEFAULT_INTERVIEW_ZOOM_LINK;
        const custom = (data.customZoomLink ?? "").trim();
        setEffectiveZoomLink(effective);
        setZoomLinkInput(custom || effective);
      } catch {
        if (cancelled) return;
        setEffectiveZoomLink(DEFAULT_INTERVIEW_ZOOM_LINK);
        setZoomLinkInput(DEFAULT_INTERVIEW_ZOOM_LINK);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the rolling 3-week planner current without requiring a reload.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setWindowAnchor(new Date());
    }, 12 * 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const saveZoomSettings = async () => {
    if (!canEditZoom) return;
    setSavingZoom(true);
    setZoomSaveMessage(null);
    const trimmedZoom = zoomLinkInput.trim();
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
          zoomLink: trimmedZoom,
          updatedBy: user?.uid ?? "",
        }),
        cache: "no-store",
      });

      if (!saveRes.ok) {
        let saveErr = "save_failed";
        try {
          const data = await saveRes.json() as { error?: string; reason?: string };
          if (data.reason) saveErr = `${data.error ?? "save_failed"}:${data.reason}`;
          else if (data.error) saveErr = data.error;
        } catch {
          // ignore parse errors
        }
        throw new Error(saveErr);
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
    } catch (err) {
      const code = err instanceof Error ? err.message : "save_failed";
      try {
        await updateInterviewSettings({
          zoomLink: trimmedZoom,
          zoomEnabled: true,
          updatedAt: Date.now(),
          updatedBy: user?.uid ?? "",
        });
        setEffectiveZoomLink(trimmedZoom || DEFAULT_INTERVIEW_ZOOM_LINK);
        setZoomLinkInput(trimmedZoom || DEFAULT_INTERVIEW_ZOOM_LINK);
        setEditingZoom(false);
        setZoomSaveMessage("Zoom link saved.");
      } catch (fallbackErr) {
        console.error("Zoom save failed:", { code, fallbackErr });
        setZoomSaveMessage(mapZoomSaveError(code));
      }
    } finally {
      setSavingZoom(false);
      setTimeout(() => setZoomSaveMessage(null), 2200);
    }
  };

  const copyBookingLink = async () => {
    await navigator.clipboard.writeText(bookingLink);
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
  const weekDates = useMemo(() => getWeekDates(slotWeek, windowAnchor), [slotWeek, windowAnchor]);

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

  const typedDateOptions = useMemo(() => {
    const start = new Date(windowAnchor);
    start.setHours(0, 0, 0, 0);
    const days = MAX_WEEK_OFFSET * 7 + 7;
    const options: string[] = [];
    for (let i = 0; i < days; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      options.push(toDateString(d));
    }
    return options;
  }, [windowAnchor]);

  const typedTimeOptions = useMemo(
    () => GRID_HOURS.flatMap((hour) => QUARTER_MINUTES.map((minute) => fmtTimeOption(hour, minute))),
    []
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

  const applySlotAction = async (
    dateISO: string,
    hour: number,
    minute: number,
    mode: DragMode,
    interviewerName?: string
  ) => {
    const key = slotKey(dateISO, hour, minute);
    const slot = slotMap[key];
    const cleanInterviewer = interviewerName?.trim() ?? "";

    if (mode === "remove") {
      if (!canDeleteInterviews || !slot || !slot.available || slot.bookedBy) return;
      await deleteInterviewSlot(slot.id);
      return;
    }

    if (slot) {
      if (slot.bookedBy) return;
      const patch: Partial<InterviewSlot> = {};
      if (!slot.available) patch.available = true;
      if (cleanInterviewer && slot.interviewerName !== cleanInterviewer) {
        patch.interviewerName = cleanInterviewer;
      }
      if (Object.keys(patch).length > 0) {
        await updateInterviewSlot(slot.id, patch);
      }
      return;
    }

    await createInterviewSlot({
      datetime: `${key}:00`,
      durationMinutes: 15,
      available: true,
      location: "",
      interviewerName: cleanInterviewer,
      createdBy: user?.uid ?? "",
      createdAt: Date.now(),
    });
  };

  const toggleDay = async (date: Date) => {
    const dateISO = toDateString(date);
    const hasVisible = GRID_HOURS.some((hour) =>
      QUARTER_MINUTES.some((minute) => {
        const slot = slotMap[slotKey(dateISO, hour, minute)];
        return !!slot && slot.available && !slot.bookedBy;
      })
    );
    const mode: DragMode = hasVisible && canDeleteInterviews ? "remove" : "add";
    for (const hour of GRID_HOURS) {
      for (const minute of QUARTER_MINUTES) {
        const slotTs = new Date(`${dateISO}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`).getTime();
        if (slotTs < now) continue;
        // eslint-disable-next-line no-await-in-loop
        await applySlotAction(dateISO, hour, minute, mode);
      }
    }
  };

  const toggleHourRow = async (hour: number) => {
    const futureDays = weekDates.filter((d) => {
      const dt = new Date(`${toDateString(d)}T${String(hour).padStart(2, "0")}:00`).getTime();
      return dt >= now;
    });

    const hasVisible = futureDays.some((date) => {
      const dateISO = toDateString(date);
      return QUARTER_MINUTES.some((minute) => {
        const slot = slotMap[slotKey(dateISO, hour, minute)];
        return !!slot && slot.available && !slot.bookedBy;
      });
    });
    const mode: DragMode = hasVisible && canDeleteInterviews ? "remove" : "add";
    for (const date of futureDays) {
      const dateISO = toDateString(date);
      for (const minute of QUARTER_MINUTES) {
        // eslint-disable-next-line no-await-in-loop
        await applySlotAction(dateISO, hour, minute, mode);
      }
    }
  };

  const addTypedAvailability = async () => {
    const startDate = parseDateInput(manualStartDateInput);
    const endDate = parseDateInput(manualEndDateInput);
    const startTime = parseTimeInput(manualStartTimeInput);
    const endTime = parseTimeInput(manualEndTimeInput);

    if (!startDate || !endDate) {
      setManualAddMessage("Enter valid start and end dates.");
      return;
    }
    if (!startTime || !endTime) {
      setManualAddMessage("Enter valid start and end times in 15-minute increments.");
      return;
    }

    const startDateObj = new Date(`${startDate}T00:00:00`);
    const endDateObj = new Date(`${endDate}T00:00:00`);
    if (endDateObj.getTime() < startDateObj.getTime()) {
      setManualAddMessage("End date must be on or after start date.");
      return;
    }

    const startMinutes = startTime.hour * 60 + startTime.minute;
    const endMinutes = endTime.hour * 60 + endTime.minute;
    if (endMinutes <= startMinutes) {
      setManualAddMessage("End time must be after start time.");
      return;
    }

    const baseDates: string[] = [];
    for (let d = new Date(startDateObj); d.getTime() <= endDateObj.getTime(); d.setDate(d.getDate() + 1)) {
      baseDates.push(toDateString(d));
    }

    const repeatCount = manualRepeatWeekly ? 3 : 1;
    const uniqueTargets: Record<string, DragCell> = {};
    baseDates.forEach((baseDate) => {
      for (let week = 0; week < repeatCount; week += 1) {
        const date = new Date(`${baseDate}T00:00:00`);
        date.setDate(date.getDate() + week * 7);
        const dateISO = toDateString(date);
        for (let t = startMinutes; t < endMinutes; t += 15) {
          const hour = Math.floor(t / 60);
          const minute = t % 60;
          if (!GRID_HOURS.includes(hour) || !QUARTER_MINUTES.includes(minute as (typeof QUARTER_MINUTES)[number])) continue;
          const rowIndex = rowIndexFromTime(hour, minute);
          uniqueTargets[`${dateISO}|${hour}|${minute}`] = { dateISO, hour, minute, rowIndex };
        }
      }
    });

    setAddingManualAvailability(true);
    setManualAddMessage(null);

    let applied = 0;
    try {
      for (const cell of Object.values(uniqueTargets)) {
        const slotTs = new Date(
          `${cell.dateISO}T${String(cell.hour).padStart(2, "0")}:${String(cell.minute).padStart(2, "0")}:00`
        ).getTime();
        if (slotTs < Date.now()) continue;

        // eslint-disable-next-line no-await-in-loop
        await applySlotAction(cell.dateISO, cell.hour, cell.minute, "add", manualInterviewer);
        applied += 1;
      }

      setManualStartDateInput(startDate);
      setManualEndDateInput(endDate);
      setManualStartTimeInput(fmtTimeOption(startTime.hour, startTime.minute));
      setManualEndTimeInput(fmtTimeOption(endTime.hour, endTime.minute));
      setManualAddMessage(
        applied > 0
          ? `Added ${applied} availability slot(s).`
          : "No future slots to add."
      );
    } finally {
      setAddingManualAvailability(false);
      setTimeout(() => setManualAddMessage(null), 2400);
    }
  };

  const startDragSelection = (
    date: Date,
    dayIndex: number,
    hour: number,
    minute: number,
    isVisible: boolean,
    isPastSlot: boolean,
    isBooked: boolean
  ) => {
    if (isPastSlot || isBooked) return;
    if (isVisible && !canDeleteInterviews) return;
    const mode: DragMode = isVisible && canDeleteInterviews ? "remove" : "add";
    const dateISO = toDateString(date);
    const rowIndex = rowIndexFromTime(hour, minute);
    const key = `${dateISO}|${hour}|${minute}`;
    const initial: Record<string, DragCell> = { [key]: { dateISO, hour, minute, rowIndex } };
    dragSelectionRef.current = initial;
    setDragSelection(initial);
    dragModeRef.current = mode;
    dragAnchorRef.current = { dayIndex, rowIndex };
    setDragMode(mode);
    setDraggingSelection(true);
  };

  const extendDragSelection = (dayIndex: number, rowIndex: number, isPastSlot: boolean) => {
    if (!draggingSelection || !dragModeRef.current || isPastSlot) return;
    const mode = dragModeRef.current;
    const anchor = dragAnchorRef.current;
    if (!anchor) return;
    if (mode === "remove" && !canDeleteInterviews) return;

    const minDay = Math.min(anchor.dayIndex, dayIndex);
    const maxDay = Math.max(anchor.dayIndex, dayIndex);
    const minRow = Math.min(anchor.rowIndex, rowIndex);
    const maxRow = Math.max(anchor.rowIndex, rowIndex);

    const next: Record<string, DragCell> = {};
    for (let day = minDay; day <= maxDay; day += 1) {
      const cellDate = weekDates[day];
      if (!cellDate) continue;
      const dateISO = toDateString(cellDate);

      for (let cellRow = minRow; cellRow <= maxRow; cellRow += 1) {
        const parsed = timeFromRowIndex(cellRow);
        if (!parsed) continue;
        const { hour, minute } = parsed;
        const slotTs = new Date(
          `${dateISO}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:59`
        ).getTime();
        if (slotTs < now) continue;

        const slot = slotMap[slotKey(dateISO, hour, minute)];
        const isVisible = !!slot && slot.available && !slot.bookedBy;
        const isBooked = !!slot?.bookedBy;
        if (isBooked) continue;
        if (mode === "remove" && !isVisible) continue;

        const key = `${dateISO}|${hour}|${minute}`;
        next[key] = { dateISO, hour, minute, rowIndex: cellRow };
      }
    }

    dragSelectionRef.current = next;
    setDragSelection(next);
  };

  const resetDragSelection = () => {
    dragSelectionRef.current = {};
    dragModeRef.current = null;
    dragAnchorRef.current = null;
    setDragSelection({});
    setDragMode(null);
    setDraggingSelection(false);
  };

  const closeBatchModal = () => {
    setShowBatchModal(false);
    setRepeatWeekly(false);
    setRemoveWeekly(false);
    setBatchInterviewer("");
    resetDragSelection();
  };

  const applyBatchSelection = async () => {
    if (!dragMode || Object.keys(dragSelection).length === 0) {
      closeBatchModal();
      return;
    }

    const shouldRepeatWeekly = dragMode === "remove" ? removeWeekly : repeatWeekly;
    const repeatCount = shouldRepeatWeekly ? MAX_WEEK_OFFSET + 1 : 1;
    const planningWindowEnd = new Date();
    planningWindowEnd.setDate(planningWindowEnd.getDate() + MAX_WEEK_OFFSET * 7 + 6);
    const uniqueTargets: Record<string, DragCell> = {};

    Object.values(dragSelection).forEach((cell) => {
      for (let week = 0; week < repeatCount; week += 1) {
        const date = new Date(`${cell.dateISO}T00:00:00`);
        date.setDate(date.getDate() + week * 7);
        if (date.getTime() > planningWindowEnd.getTime()) break;
        const dateISO = toDateString(date);
        const key = `${dateISO}|${cell.hour}|${cell.minute}`;
        uniqueTargets[key] = { dateISO, hour: cell.hour, minute: cell.minute, rowIndex: cell.rowIndex };
      }
    });

    setApplyingBatch(true);
    try {
      for (const cell of Object.values(uniqueTargets)) {
        const slotTs = new Date(
          `${cell.dateISO}T${String(cell.hour).padStart(2, "0")}:${String(cell.minute).padStart(2, "0")}:00`
        ).getTime();
        if (slotTs < Date.now()) continue;
        // eslint-disable-next-line no-await-in-loop
        await applySlotAction(
          cell.dateISO,
          cell.hour,
          cell.minute,
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
      if (selectionCount >= 1 && dragModeRef.current) {
        setRepeatWeekly(false);
        setRemoveWeekly(false);
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
    const offset = weekOffsetFromDate(parsed, windowAnchor);
    setSlotWeek(Math.max(0, Math.min(MAX_WEEK_OFFSET, offset)));
  };

  useEffect(() => {
    const dates = getWeekDates(slotWeek, windowAnchor);
    setJumpToDate(toDateString(dates[0]));
  }, [slotWeek, windowAnchor]);

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
                value={bookingLink}
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3 items-end">
            <Field label="Start Date">
              <AutocompleteInput
                value={manualStartDateInput}
                onChange={setManualStartDateInput}
                options={typedDateOptions}
                placeholder="YYYY-MM-DD"
              />
            </Field>
            <Field label="End Date">
              <AutocompleteInput
                value={manualEndDateInput}
                onChange={setManualEndDateInput}
                options={typedDateOptions}
                placeholder="YYYY-MM-DD"
              />
            </Field>
            <Field label="Start Time">
              <AutocompleteInput
                value={manualStartTimeInput}
                onChange={setManualStartTimeInput}
                options={typedTimeOptions}
                placeholder="e.g. 9:00 AM"
              />
            </Field>
            <Field label="End Time">
              <AutocompleteInput
                value={manualEndTimeInput}
                onChange={setManualEndTimeInput}
                options={typedTimeOptions}
                placeholder="e.g. 10:00 AM"
              />
            </Field>
            <Field label="Interviewer Name">
              <AutocompleteInput
                value={manualInterviewer}
                onChange={setManualInterviewer}
                options={interviewerOptions}
                placeholder="Start typing interviewer name (optional)"
              />
            </Field>
            <Btn
              variant="primary"
              className="w-full justify-center"
              onClick={() => void addTypedAvailability()}
              disabled={addingManualAvailability}
            >
              {addingManualAvailability ? "Adding..." : "Add Availability"}
            </Btn>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-white/65 font-body select-none">
            <input
              type="checkbox"
              checked={manualRepeatWeekly}
              onChange={(e) => setManualRepeatWeekly(e.target.checked)}
              className="accent-[#85CC17] w-4 h-4"
            />
            Repeat weekly (same time range for future weeks)
          </label>
          {manualAddMessage && <p className="text-xs text-white/55">{manualAddMessage}</p>}
          {!canDeleteInterviews && (
            <p className="text-white/35 text-xs font-body">
              Interviewer role can add hours but cannot remove existing visible times.
            </p>
          )}

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

                  return (
                    <div key={dayIdx} className="border-l border-white/6">
                      <div className="grid grid-cols-2 grid-rows-2 h-12">
                        {QUARTER_MINUTES.map((minute) => {
                          const minuteLabel = String(minute).padStart(2, "0");
                          const key = slotKey(d, hour, minute);
                          const slot = slotMap[key];
                          const isVisible = !!slot && slot.available && !slot.bookedBy;
                          const isBooked = !!slot?.bookedBy;
                          const isPastSlot = new Date(`${d}T${h}:${minuteLabel}:59`).getTime() < now;
                          const cannotRemoveVisible = !canDeleteInterviews && isVisible;
                          const disabled = isPastSlot || isBooked || cannotRemoveVisible;
                          const rowIndex = rowIndexFromTime(hour, minute);
                          const selectionKey = `${d}|${hour}|${minute}`;
                          const isSelectedInDrag = !!dragSelection[selectionKey];

                          let cellClass = "bg-white/10 hover:bg-white/25";
                          if (isVisible) cellClass = "bg-[#85CC17]/70 hover:bg-[#85CC17]/45";
                          if (isBooked) cellClass = "bg-red-500/45";

                          const title = (() => {
                            const label = fmtTimeOption(hour, minute);
                            if (isPastSlot) return `${label} - Past`;
                            if (isBooked) return `${label} - Booked`;
                            if (cannotRemoveVisible) return `${label} - Visible (interviewer cannot remove)`;
                            if (isVisible) return `${label} - Visible on booking page`;
                            return `${label} - Hidden on booking page`;
                          })();

                          return (
                            <button
                              key={minute}
                              disabled={disabled}
                              onPointerDown={(e) => {
                                if (disabled) return;
                                e.preventDefault();
                                startDragSelection(day, dayIdx, hour, minute, isVisible, isPastSlot, isBooked);
                              }}
                              onPointerEnter={() => {
                                if (disabled) return;
                                extendDragSelection(dayIdx, rowIndex, isPastSlot);
                              }}
                              title={title}
                              className={`w-full h-full border border-white/6 transition-colors ${
                                disabled
                                  ? `${cellClass} cursor-default ${isPastSlot ? "opacity-20" : "opacity-70"}`
                                  : `${cellClass} cursor-pointer`
                              } ${isSelectedInDrag ? "ring-2 ring-inset ring-[#85CC17]" : ""}`}
                              style={{
                                touchAction: "none",
                              }}
                            />
                          );
                        })}
                      </div>
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
                ? "Click or drag to select 15-minute slots, then apply changes in the popup"
                : "Click or drag hidden 15-minute slots to select, then apply additions in the popup"}
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
            {Object.keys(dragSelection).length} 15-minute slot(s) selected in this week.
          </p>
          {dragMode === "add" ? (
            <>
              <label className="inline-flex items-center gap-2 text-sm text-white/70 font-body select-none">
                <input
                  type="checkbox"
                  checked={repeatWeekly}
                  onChange={(e) => setRepeatWeekly(e.target.checked)}
                  className="accent-[#85CC17] w-4 h-4"
                />
                Repeat weekly (same slots for future weeks)
              </label>
              <Field label="Interviewer Name">
                <AutocompleteInput
                  value={batchInterviewer}
                  onChange={(value) => setBatchInterviewer(value)}
                  options={interviewerOptions}
                  placeholder="Start typing interviewer name (optional)"
                />
              </Field>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-white/65 font-body">How should this removal apply?</p>
              <label className="flex items-center gap-2 text-sm text-white/70 font-body cursor-pointer">
                <input
                  type="radio"
                  name="remove-scope"
                  checked={!removeWeekly}
                  onChange={() => setRemoveWeekly(false)}
                  className="accent-[#85CC17] w-4 h-4"
                />
                Remove this availability only
              </label>
              <label className="flex items-center gap-2 text-sm text-white/70 font-body cursor-pointer">
                <input
                  type="radio"
                  name="remove-scope"
                  checked={removeWeekly}
                  onChange={() => setRemoveWeekly(true)}
                  className="accent-[#85CC17] w-4 h-4"
                />
                Remove all weekly availability for this time
              </label>
            </div>
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
            {applyingBatch
              ? "Applying..."
              : dragMode === "remove"
                ? (removeWeekly ? "Remove Weekly Availability" : "Remove Availability")
                : (repeatWeekly ? "Add Weekly Availability" : "Add Availability")}
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
