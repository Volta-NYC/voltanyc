"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MembersLayout from "@/components/members/MembersLayout";
import { useAuth } from "@/lib/members/authContext";
import {
  subscribeInterviewInvites,
  createInterviewInvite,
  updateInterviewInvite,
  subscribeInterviewSlots,
  createInterviewSlot,
  updateInterviewSlot,
  deleteInterviewSlot,
  type InterviewInvite,
  type InterviewSlot,
} from "@/lib/members/storage";
import { Btn, Modal, Field, Input, Select, TextArea, useConfirm } from "@/components/members/ui";
import { generateToken } from "@/lib/interviews";

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

function buildBookingUrl(token: string): string {
  if (typeof window === "undefined") return `/book/${token}`;
  return `${window.location.origin}/book/${token}`;
}

function getWeekDates(weekOffset: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow + 1 + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

const GRID_HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 8 AM -> 7 PM

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

function inviteStatusColor(status: string): string {
  if (status === "booked") return "text-green-400";
  if (status === "expired") return "text-white/35";
  if (status === "cancelled") return "text-red-400";
  return "text-[#85CC17]";
}

const BLANK_INVITE_FORM = {
  applicantName: "",
  applicantEmail: "",
  note: "",
  expiryDays: "7",
  multiUse: false,
};

function InterviewsContent() {
  const { user, authRole, loading } = useAuth();
  const router = useRouter();
  const { ask, Dialog } = useConfirm();

  const [activeTab, setActiveTab] = useState<"upcoming" | "invites" | "availability">("upcoming");
  const [invites, setInvites] = useState<InterviewInvite[]>([]);
  const [slots, setSlots] = useState<InterviewSlot[]>([]);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState(BLANK_INVITE_FORM);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [assignSlotByInvite, setAssignSlotByInvite] = useState<Record<string, string>>({});
  const [zoomLinkInput, setZoomLinkInput] = useState("");
  const [effectiveZoomLink, setEffectiveZoomLink] = useState("");
  const [editingZoom, setEditingZoom] = useState(false);
  const [copiedZoom, setCopiedZoom] = useState(false);
  const [zoomSaveMessage, setZoomSaveMessage] = useState<string | null>(null);
  const [savingZoom, setSavingZoom] = useState(false);

  const [slotWeek, setSlotWeek] = useState(0);

  useEffect(() => {
    if (!loading && authRole !== "admin" && authRole !== "project_lead") {
      router.replace("/members/projects");
    }
  }, [authRole, loading, router]);

  useEffect(() => {
    const unsubInvites = subscribeInterviewInvites(setInvites);
    const unsubSlots = subscribeInterviewSlots(setSlots);
    return () => {
      unsubInvites();
      unsubSlots();
    };
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

  const invitesById = useMemo(() => {
    const m: Record<string, InterviewInvite> = {};
    invites.forEach((i) => {
      m[i.id] = i;
    });
    return m;
  }, [invites]);

  const sortedInvites = useMemo(
    () => [...invites].sort((a, b) => b.createdAt - a.createdAt),
    [invites]
  );

  const sortedSlots = useMemo(
    () => [...slots].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()),
    [slots]
  );

  const upcomingBookedSlots = useMemo(
    () => sortedSlots.filter((s) => !!s.bookedBy && new Date(s.datetime).getTime() >= now),
    [sortedSlots, now]
  );

  const availableUpcomingSlots = useMemo(
    () => sortedSlots.filter((s) => !s.bookedBy && new Date(s.datetime).getTime() >= now),
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

  const setInviteField = (key: string, value: string | boolean) =>
    setInviteForm((prev) => ({ ...prev, [key]: value }));

  const copyInviteLink = async (token: string) => {
    await navigator.clipboard.writeText(buildBookingUrl(token));
    setCopiedInviteId(token);
    setTimeout(() => setCopiedInviteId(null), 1800);
  };

  const handleCreateInvite = async () => {
    if (!inviteForm.multiUse) {
      if (!inviteForm.applicantName.trim() || !inviteForm.applicantEmail.trim()) return;
    }

    const token = generateToken();
    const expiresAt = Date.now() + parseInt(inviteForm.expiryDays, 10) * 86400000;

    const inviteData: Omit<InterviewInvite, "id"> = {
      role: "",
      note: inviteForm.note.trim(),
      multiUse: inviteForm.multiUse,
      expiresAt,
      status: "pending",
      createdBy: user?.uid ?? "",
      createdAt: Date.now(),
    };

    if (!inviteForm.multiUse) {
      inviteData.applicantName = inviteForm.applicantName.trim();
      inviteData.applicantEmail = inviteForm.applicantEmail.trim();
    }

    await createInterviewInvite(token, inviteData);
    setNewToken(token);
    setInviteForm(BLANK_INVITE_FORM);
  };

  const cancelInvite = (token: string) =>
    ask(
      async () => updateInterviewInvite(token, { status: "cancelled" }),
      "Cancel this invite link? Existing interviews under this link will remain unless removed separately."
    );

  const assignInterviewToInvite = async (invite: InterviewInvite) => {
    const selectedSlotId = assignSlotByInvite[invite.id];
    if (!selectedSlotId) return;

    const selectedSlot = availableUpcomingSlots.find((s) => s.id === selectedSlotId);
    if (!selectedSlot) return;

    await updateInterviewSlot(selectedSlot.id, {
      available: false,
      bookedBy: invite.id,
      bookerName: invite.multiUse ? "" : invite.applicantName ?? "",
      bookerEmail: invite.multiUse ? "" : invite.applicantEmail ?? "",
    });

    if (!invite.multiUse) {
      await updateInterviewInvite(invite.id, {
        status: "booked",
        bookedSlotId: selectedSlot.id,
      });
    }

    setAssignSlotByInvite((prev) => ({ ...prev, [invite.id]: "" }));
  };

  const cancelBookedInterview = (slot: InterviewSlot) => {
    ask(async () => {
      await updateInterviewSlot(slot.id, {
        available: true,
        bookedBy: "",
        bookerName: "",
        bookerEmail: "",
      });

      if (slot.bookedBy) {
        const invite = invitesById[slot.bookedBy];
        if (invite && !invite.multiUse) {
          await updateInterviewInvite(invite.id, {
            status: "pending",
            bookedSlotId: "",
          });
        }
      }
    }, "Remove this booked interview and return the time to available?");
  };

  const toggleHour = async (date: Date, hour: number) => {
    const keys = hourSlotKeys(date, hour);
    const quarterSlots = keys.map((k) => slotMap[k]).filter(Boolean);
    const visibleSlots = quarterSlots.filter((s) => !s.bookedBy);

    const missingKeys = keys.filter((k) => !slotMap[k]);
    if (missingKeys.length > 0 && quarterSlots.some((s) => !s.bookedBy)) {
      await Promise.all(
        missingKeys.map((k) =>
          createInterviewSlot({
            datetime: `${k}:00`,
            durationMinutes: 15,
            available: true,
            location: "",
            createdBy: user?.uid ?? "",
            createdAt: Date.now(),
          })
        )
      );
      return;
    }

    if (visibleSlots.length > 0) {
      await Promise.all(visibleSlots.map((s) => deleteInterviewSlot(s.id)));
      return;
    }

    if (missingKeys.length > 0) {
      await Promise.all(
        missingKeys.map((k) =>
          createInterviewSlot({
            datetime: `${k}:00`,
            durationMinutes: 15,
            available: true,
            location: "",
            createdBy: user?.uid ?? "",
            createdAt: Date.now(),
          })
        )
      );
    }
  };

  const toggleDay = async (date: Date) => {
    const daySlots = GRID_HOURS.flatMap((hour) => hourSlotKeys(date, hour).map((k) => slotMap[k])).filter(Boolean);
    const removable = daySlots.filter((s) => !s.bookedBy);

    if (removable.length > 0) {
      await Promise.all(removable.map((s) => deleteInterviewSlot(s.id)));
      return;
    }

    await Promise.all(
      GRID_HOURS.flatMap((hour) =>
        hourSlotKeys(date, hour)
          .filter((k) => !slotMap[k])
          .map((k) =>
          createInterviewSlot({
            datetime: `${k}:00`,
            durationMinutes: 15,
            available: true,
            location: "",
            createdBy: user?.uid ?? "",
            createdAt: Date.now(),
          })
        )
      )
    );
  };

  const toggleHourRow = async (hour: number) => {
    const futureDays = weekDates.filter((d) => {
      const dt = new Date(toDateString(d) + "T" + String(hour).padStart(2, "0") + ":00").getTime();
      return dt >= now;
    });

    const rowSlots = futureDays
      .flatMap((d) => hourSlotKeys(d, hour).map((k) => slotMap[k]))
      .filter(Boolean);

    const removable = rowSlots.filter((s) => !s.bookedBy);
    if (removable.length > 0) {
      await Promise.all(removable.map((s) => deleteInterviewSlot(s.id)));
      return;
    }

    await Promise.all(
      futureDays.flatMap((date) => {
        return hourSlotKeys(date, hour)
          .filter((k) => !slotMap[k])
          .map((k) =>
          createInterviewSlot({
            datetime: `${k}:00`,
            durationMinutes: 15,
            available: true,
            location: "",
            createdBy: user?.uid ?? "",
            createdAt: Date.now(),
          })
        );
      })
    );
  };

  const ensureHourVisible = async (date: Date, hour: number) => {
    const keys = hourSlotKeys(date, hour);
    const missingKeys = keys.filter((k) => !slotMap[k]);
    if (missingKeys.length === 0) return;
    await Promise.all(
      missingKeys.map((k) =>
        createInterviewSlot({
          datetime: `${k}:00`,
          durationMinutes: 15,
          available: true,
          location: "",
          createdBy: user?.uid ?? "",
          createdAt: Date.now(),
        })
      )
    );
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

  const getDayVisibleCount = (date: Date) => {
    const d = toDateString(date);
    let visible = 0;
    slots.forEach((slot) => {
      if (!slot.datetime.startsWith(d) || new Date(slot.datetime).getTime() < now) return;
      if (!slot.bookedBy) visible += 1;
    });
    return visible;
  };

  const TABS: { key: "upcoming" | "invites" | "availability"; label: string }[] = [
    { key: "upcoming", label: "Upcoming Interviews" },
    { key: "invites", label: "Invite Links" },
    { key: "availability", label: "Availability" },
  ];

  if (loading || (authRole !== "admin" && authRole !== "project_lead")) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#85CC17]/30 border-t-[#85CC17] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Dialog />

      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-white text-2xl">Interviews</h1>
          <p className="text-white/40 text-sm mt-1 font-body">
            Calendly-style scheduling for links, availability, and booked interviews.
          </p>
        </div>
        {activeTab === "invites" && (
          <Btn variant="primary" onClick={() => setShowInviteModal(true)}>
            + New Invite
          </Btn>
        )}
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
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-white/85 text-sm font-semibold">Interview Zoom Link</p>
                <p className="text-white/40 text-xs mt-1 font-body">
                  Used for applicant confirmation pages and calendar .ics invites.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Btn variant="secondary" size="sm" onClick={() => setEditingZoom(true)}>
                  Edit
                </Btn>
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

            {editingZoom && (
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
                  const invite = slot.bookedBy ? invitesById[slot.bookedBy] : undefined;
                  const displayName = slot.bookerName || invite?.applicantName || "Interviewee";
                  return (
                    <div key={slot.id} className="bg-[#1C1F26] border border-white/8 rounded-xl px-4 py-3 flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold">{displayName}</p>
                        <p className="text-white/45 text-xs font-body mt-0.5">
                          {formatDateTime(slot.datetime)}
                          {slot.bookerEmail ? ` · ${slot.bookerEmail}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {slot.bookedBy && (
                          <button
                            onClick={() => copyInviteLink(slot.bookedBy!)}
                            className="text-xs text-[#85CC17]/75 hover:text-[#85CC17] transition-colors font-body px-2 py-1 rounded-lg bg-[#85CC17]/10 hover:bg-[#85CC17]/20"
                          >
                            {copiedInviteId === slot.bookedBy ? "Copied!" : "Copy Link"}
                          </button>
                        )}
                        <Btn size="sm" variant="danger" onClick={() => cancelBookedInterview(slot)}>
                          Cancel
                        </Btn>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "invites" && (
        <div className="space-y-3">
          {sortedInvites.length === 0 && (
            <div className="bg-[#1C1F26] border border-white/8 rounded-xl p-8 text-center text-white/30 text-sm font-body">
              No invite links yet. Create one to send to an applicant.
            </div>
          )}
          {sortedInvites.map((invite) => {
            const bookedForInvite = sortedSlots.filter((slot) => slot.bookedBy === invite.id);
            const upcomingForInvite = bookedForInvite.filter((slot) => new Date(slot.datetime).getTime() >= now);
            const canUseLink = invite.status !== "cancelled" && invite.status !== "expired";

            return (
              <div key={invite.id} className="bg-[#1C1F26] border border-white/8 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white font-semibold text-sm">
                        {invite.multiUse ? "Multi-use invite" : invite.applicantName || "Single-use invite"}
                      </p>
                      <span className={`text-xs font-medium ${inviteStatusColor(invite.status)}`}>
                        {invite.status.charAt(0).toUpperCase() + invite.status.slice(1)}
                      </span>
                      <span className="text-white/35 text-xs bg-white/6 px-2 py-0.5 rounded-full">
                        {bookedForInvite.length} total
                      </span>
                    </div>
                    {!invite.multiUse && invite.applicantEmail && (
                      <p className="text-white/45 text-xs mt-0.5 font-mono">{invite.applicantEmail}</p>
                    )}
                    {invite.note && (
                      <p className="text-white/30 text-xs mt-1 italic">{invite.note}</p>
                    )}
                    <p className="text-white/25 text-xs mt-1 font-body">
                      Expires {new Date(invite.expiresAt).toLocaleDateString()} · Created{" "}
                      {new Date(invite.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => copyInviteLink(invite.id)}
                      className="text-xs text-[#85CC17]/75 hover:text-[#85CC17] transition-colors font-body px-2 py-1 rounded-lg bg-[#85CC17]/10 hover:bg-[#85CC17]/20"
                    >
                      {copiedInviteId === invite.id ? "Copied!" : "Copy Link"}
                    </button>
                    {canUseLink && (
                      <Btn size="sm" variant="danger" onClick={() => cancelInvite(invite.id)}>
                        Cancel Link
                      </Btn>
                    )}
                  </div>
                </div>

                {canUseLink && (
                  <div className="bg-[#111318] border border-white/8 rounded-xl px-3 py-3">
                    <p className="text-white/45 text-[11px] uppercase tracking-wider mb-2">Add Interview Under This Link</p>
                    <div className="flex gap-2 flex-col sm:flex-row">
                      <select
                        value={assignSlotByInvite[invite.id] ?? ""}
                        onChange={(e) => setAssignSlotByInvite((prev) => ({ ...prev, [invite.id]: e.target.value }))}
                        className="flex-1 bg-[#0F1014] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#85CC17]/45"
                      >
                        <option value="">Select an available time…</option>
                        {availableUpcomingSlots.map((slot) => (
                          <option key={slot.id} value={slot.id}>
                            {formatDateTime(slot.datetime)}
                          </option>
                        ))}
                      </select>
                      <Btn
                        variant="primary"
                        size="sm"
                        disabled={!assignSlotByInvite[invite.id]}
                        onClick={() => assignInterviewToInvite(invite)}
                      >
                        Add Interview
                      </Btn>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-white/45 text-[11px] uppercase tracking-wider mb-2">Interviews Under This Link</p>
                  {upcomingForInvite.length === 0 ? (
                    <p className="text-white/30 text-xs font-body">No upcoming interviews for this link.</p>
                  ) : (
                    <div className="space-y-2">
                      {upcomingForInvite.map((slot) => (
                        <div key={slot.id} className="bg-[#111318] border border-white/8 rounded-lg px-3 py-2.5 flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-white/80 text-xs font-semibold">{formatDateTime(slot.datetime)}</p>
                            <p className="text-white/35 text-xs mt-0.5">
                              {slot.bookerName || "Interviewee"}
                              {slot.bookerEmail ? ` · ${slot.bookerEmail}` : ""}
                            </p>
                          </div>
                          <Btn size="sm" variant="danger" onClick={() => cancelBookedInterview(slot)}>
                            Remove
                          </Btn>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "availability" && (
        <div className="space-y-4">
          <div className="bg-[#1C1F26] border border-white/8 rounded-xl p-4">
            <p className="text-white/65 text-sm font-semibold">Weekly Availability</p>
            <p className="text-white/35 text-xs mt-1 font-body">
              Select hour blocks to control what times are visible on invite booking links.
            </p>
            <div className="flex flex-wrap gap-2 items-center mt-3">
              <span className="text-white/40 text-xs font-body mr-1">Quick fill:</span>
              <button
                onClick={() => applyPreset(9, 12)}
                className="px-3 py-1 rounded-lg bg-white/8 hover:bg-white/12 text-white/65 hover:text-white text-xs font-body transition-colors"
              >
                Morning (9–12)
              </button>
              <button
                onClick={() => applyPreset(12, 17)}
                className="px-3 py-1 rounded-lg bg-white/8 hover:bg-white/12 text-white/65 hover:text-white text-xs font-body transition-colors"
              >
                Afternoon (12–5)
              </button>
              <button
                onClick={() => applyPreset(9, 17)}
                className="px-3 py-1 rounded-lg bg-white/8 hover:bg-white/12 text-white/65 hover:text-white text-xs font-body transition-colors"
              >
                Business Hours (9–5)
              </button>
              <button
                onClick={() => applyPreset(8, 20)}
                className="px-3 py-1 rounded-lg bg-white/8 hover:bg-white/12 text-white/65 hover:text-white text-xs font-body transition-colors"
              >
                Full Day (8–8)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setSlotWeek((w) => Math.max(0, w - 1))}
              disabled={slotWeek === 0}
              className="px-3 py-1.5 rounded-lg bg-white/8 text-white/65 hover:text-white hover:bg-white/12 transition-colors text-sm disabled:opacity-30"
            >
              ← Prev
            </button>
            <span className="text-white/65 text-sm font-body flex-1 text-center">
              {weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} –{" "}
              {weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
            <button
              onClick={() => setSlotWeek((w) => Math.min(2, w + 1))}
              disabled={slotWeek === 2}
              className="px-3 py-1.5 rounded-lg bg-white/8 text-white/65 hover:text-white hover:bg-white/12 transition-colors text-sm disabled:opacity-30"
            >
              Next →
            </button>
          </div>

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
                    title={isPastDay ? undefined : "Toggle entire day"}
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
                  title="Toggle this hour across all days"
                  className="flex items-center justify-center py-3 text-[11px] text-white/35 hover:text-white/70 font-body transition-colors cursor-pointer hover:bg-white/5"
                >
                  {fmtHour(hour)}
                </button>

                {weekDates.map((day, dayIdx) => {
                  const d = toDateString(day);
                  const h = String(hour).padStart(2, "0");
                  const keys = hourSlotKeys(day, hour);
                  const quarterSlots = keys.map((k) => slotMap[k]).filter(Boolean);
                  const visibleCount = quarterSlots.filter((s) => !s.bookedBy).length;
                  const isPastHour = new Date(`${d}T${h}:59`).getTime() < now;
                  const disabled = isPastHour;
                  const isVisible = visibleCount > 0;
                  const isPartiallyVisible = visibleCount > 0 && visibleCount < 4;

                  let cellClass = "bg-white/10 hover:bg-white/25";
                  if (isVisible) cellClass = "bg-[#85CC17]/70 hover:bg-[#85CC17]/45";
                  if (isPartiallyVisible) cellClass = "bg-[#85CC17]/45 hover:bg-[#85CC17]/35";

                  const title = (() => {
                    const label = fmtHour(hour);
                    if (isPastHour) return `${label} — Past`;
                    if (isVisible) return `${label} — Visible on booking links`;
                    return `${label} — Hidden on booking links`;
                  })();

                  return (
                    <div key={dayIdx} className="relative border-l border-white/6">
                      <button
                        disabled={disabled}
                        onClick={() => toggleHour(day, hour)}
                        title={title}
                        className={`w-full h-11 rounded-none transition-colors ${
                          disabled ? `${cellClass} cursor-default ${isPastHour ? "opacity-20" : ""}` : `${cellClass} cursor-pointer`
                        }`}
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
              Click hour blocks to toggle full hours · click day header to toggle day
            </span>
          </div>
        </div>
      )}

      <Modal
        open={showInviteModal && !newToken}
        onClose={() => {
          setShowInviteModal(false);
          setNewToken(null);
        }}
        title="New Invite Link"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white/4 border border-white/8 rounded-xl px-4 py-3">
            <div>
              <p className="text-white text-sm font-medium">Multi-use link</p>
              <p className="text-white/40 text-xs mt-0.5 font-body">
                Anyone with the link can book a slot. Each person enters their own name and email.
              </p>
            </div>
            <button
              onClick={() => setInviteField("multiUse", !inviteForm.multiUse)}
              className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                inviteForm.multiUse ? "bg-[#85CC17]" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                  inviteForm.multiUse ? "left-5" : "left-1"
                }`}
              />
            </button>
          </div>

          {!inviteForm.multiUse && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Applicant Name" required>
                <Input
                  value={inviteForm.applicantName}
                  onChange={(e) => setInviteField("applicantName", e.target.value)}
                  placeholder="Jane Smith"
                />
              </Field>
              <Field label="Applicant Email" required>
                <Input
                  type="email"
                  value={inviteForm.applicantEmail}
                  onChange={(e) => setInviteField("applicantEmail", e.target.value)}
                  placeholder="jane@example.com"
                />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Link expires in">
              <Select
                options={["1", "3", "7", "14", "30"]}
                value={inviteForm.expiryDays}
                onChange={(e) => setInviteField("expiryDays", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Internal note">
            <TextArea
              rows={2}
              value={inviteForm.note}
              onChange={(e) => setInviteField("note", e.target.value)}
              placeholder="Optional context…"
            />
          </Field>
        </div>

        <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-white/8">
          <Btn variant="ghost" onClick={() => setShowInviteModal(false)}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={handleCreateInvite}>
            Generate Link
          </Btn>
        </div>
      </Modal>

      <Modal
        open={!!newToken}
        onClose={() => {
          setNewToken(null);
          setShowInviteModal(false);
        }}
        title="Invite Link Created"
      >
        <div className="space-y-4">
          <p className="text-white/60 text-sm font-body">
            Share this link with the applicant. It expires based on the days you selected.
          </p>
          <div className="bg-[#0F1014] border border-white/10 rounded-xl p-3 font-mono text-sm text-[#85CC17] break-all">
            {newToken ? buildBookingUrl(newToken) : ""}
          </div>
          <button
            onClick={() => newToken && copyInviteLink(newToken)}
            className="w-full py-2.5 rounded-xl bg-[#85CC17] text-[#0D0D0D] font-display font-bold text-sm hover:bg-[#72b314] transition-colors"
          >
            {copiedInviteId === newToken ? "Copied!" : "Copy Link"}
          </button>
        </div>
        <div className="flex justify-end mt-4 pt-4 border-t border-white/8">
          <Btn
            variant="ghost"
            onClick={() => {
              setNewToken(null);
              setShowInviteModal(false);
            }}
          >
            Done
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
