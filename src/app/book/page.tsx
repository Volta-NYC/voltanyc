"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { InterviewSlot } from "@/lib/members/storage";

function downloadICS(slot: InterviewSlot, zoomLink: string) {
  const start = new Date(slot.datetime);
  const end = new Date(start.getTime() + (slot.durationMinutes ?? 30) * 60000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Volta NYC//Interview//EN",
    "BEGIN:VEVENT",
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    "SUMMARY:Interview - Volta NYC",
  ];

  const descParts: string[] = [];
  if (zoomLink) descParts.push(`Join Zoom: ${zoomLink}`);
  descParts.push("Organized by Volta NYC");
  lines.push(`DESCRIPTION:${descParts.join("\\n")}`);
  if (slot.location) lines.push(`LOCATION:${slot.location}`);
  if (zoomLink) lines.push(`URL:${zoomLink}`);
  lines.push(
    `DTSTAMP:${fmt(new Date())}`,
    `UID:volta-${slot.id}@voltanyc.org`,
    "END:VEVENT",
    "END:VCALENDAR"
  );

  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "volta-nyc-interview.ics";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatDayTab(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDayHeading(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatTime(isoDatetime: string): string {
  const d = new Date(isoDatetime);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
}

function formatConfirmed(iso: string): string {
  const d = new Date(iso);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const mos = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${days[d.getDay()]}, ${mos[d.getMonth()]} ${d.getDate()} - ${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
}

type PageState = "loading" | "enter_info" | "choose_slot" | "confirmed" | "error";

export default function BookPage() {
  const [state, setState] = useState<PageState>("loading");
  const [slots, setSlots] = useState<InterviewSlot[]>([]);
  const [zoomLink, setZoomLink] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmedSlot, setConfirmedSlot] = useState<InterviewSlot | null>(null);
  const [copied, setCopied] = useState(false);

  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");

  const [bookerName, setBookerName] = useState("");
  const [bookerEmail, setBookerEmail] = useState("");
  const [infoError, setInfoError] = useState("");

  const loadLatestZoomLink = useCallback(async (): Promise<string> => {
    try {
      const res = await fetch("/api/booking/zoom", { cache: "no-store" });
      if (!res.ok) return "";
      const data = await res.json() as { zoomLink?: string };
      const latest = (data.zoomLink ?? "").trim();
      setZoomLink(latest);
      return latest;
    } catch {
      return "";
    }
  }, []);

  const dateSlotMap = useMemo(() => {
    const map: Record<string, InterviewSlot[]> = {};
    for (const s of slots) {
      const day = s.datetime.slice(0, 10);
      if (!map[day]) map[day] = [];
      map[day].push(s);
    }
    return map;
  }, [slots]);

  const sortedDates = useMemo(() => Object.keys(dateSlotMap).sort(), [dateSlotMap]);
  const timesForDate = dateSlotMap[selectedDate] ?? [];
  const selectedSlot = timesForDate.find((s) => s.datetime === selectedTime) ?? null;

  useEffect(() => {
    if (!selectedDate) return;
    const daySlots = dateSlotMap[selectedDate] ?? [];
    if (daySlots.length === 0) return;
    const selectedStillExists = daySlots.some((s) => s.datetime === selectedTime);
    if (!selectedStillExists) setSelectedTime(daySlots[0].datetime);
  }, [dateSlotMap, selectedDate, selectedTime]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/booking", { cache: "no-store" });
        const data = await res.json() as {
          error?: string;
          slots?: InterviewSlot[];
          zoomLink?: string;
        };

        if (!res.ok) {
          setState("error");
          return;
        }

        const loaded = data.slots ?? [];
        setSlots(loaded);
        setZoomLink(data.zoomLink ?? "");

        if (loaded.length > 0) {
          const firstDay = loaded[0].datetime.slice(0, 10);
          setSelectedDate(firstDay);
          setSelectedTime(loaded[0].datetime);
        }

        setState("enter_info");
      } catch (err) {
        console.error("Booking page load error:", err);
        setState("error");
      }
    })();
  }, [loadLatestZoomLink]);

  // Keep the Zoom link fresh for applicants who keep the page open while admins update it.
  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const latest = await loadLatestZoomLink();
      if (cancelled) return;
      if (latest) setZoomLink(latest);
    };

    void refresh();

    const intervalId = window.setInterval(() => {
      void refresh();
    }, 15000);

    const onFocus = () => {
      void refresh();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadLatestZoomLink]);

  const handleInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookerName.trim()) {
      setInfoError("Please enter your name.");
      return;
    }
    if (!bookerEmail.trim()) {
      setInfoError("Please enter your email.");
      return;
    }
    setInfoError("");
    setState("choose_slot");
  };

  const handleBook = async () => {
    if (!selectedSlot) return;
    if (!bookerName.trim() || !bookerEmail.trim()) {
      setState("enter_info");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: selectedSlot.id,
          bookerName: bookerName.trim(),
          bookerEmail: bookerEmail.trim(),
        }),
      });

      if (!res.ok) {
        setState("error");
        return;
      }
      setConfirmedSlot(selectedSlot);
      setState("confirmed");
    } catch (err) {
      console.error("Booking slot error:", err);
      setState("error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyZoom = async () => {
    try {
      const latest = await loadLatestZoomLink();
      if (!latest) return;
      await navigator.clipboard.writeText(latest);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="min-h-screen bg-[#0F1014] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#85CC17] flex items-center justify-center">
              <span className="text-[#0D0D0D] font-bold text-sm">V</span>
            </div>
            <span className="text-white font-bold text-lg tracking-tight">VOLTA NYC</span>
          </div>
          <p className="text-white/40 text-sm font-body">Interview Scheduling</p>
        </div>

        {state === "loading" && (
          <div className="bg-[#1C1F26] border border-white/8 rounded-2xl p-8 text-center">
            <div className="w-8 h-8 border-2 border-[#85CC17]/30 border-t-[#85CC17] rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/40 text-sm font-body">Loading...</p>
          </div>
        )}

        {state === "error" && (
          <div className="bg-[#1C1F26] border border-white/8 rounded-2xl p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-orange-500/15 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="text-white font-bold text-lg">Something went wrong</h2>
            <p className="text-white/40 text-sm font-body">Please refresh and try again.</p>
          </div>
        )}

        {state === "enter_info" && (
          <div className="bg-[#1C1F26] border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-white/8">
              <h2 className="text-white font-bold text-xl">Schedule an Interview</h2>
              <p className="text-white/50 text-sm mt-1 font-body">Enter your information first.</p>
            </div>
            <form onSubmit={handleInfoSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Your Name</label>
                <input
                  required
                  value={bookerName}
                  onChange={(e) => setBookerName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full bg-[#0F1014] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#85CC17]/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Your Email</label>
                <input
                  required
                  type="email"
                  value={bookerEmail}
                  onChange={(e) => setBookerEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="w-full bg-[#0F1014] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#85CC17]/50 transition-colors"
                />
              </div>
              {infoError && <p className="text-red-400 text-xs">{infoError}</p>}
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-[#85CC17] text-[#0D0D0D] font-display font-bold text-sm hover:bg-[#72b314] transition-colors"
              >
                See Available Times →
              </button>
            </form>
          </div>
        )}

        {state === "choose_slot" && (
          <div className="bg-[#1C1F26] border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-white/8">
              <h2 className="text-white font-bold text-xl">Hi, {bookerName || "there"}!</h2>
              <p className="text-white/50 text-sm mt-1 font-body">Pick a time that works for you.</p>
            </div>

            {slots.length === 0 ? (
              <div className="text-center py-10 px-6 space-y-2">
                <p className="text-white/40 text-sm font-body">No available times right now.</p>
                <p className="text-white/25 text-xs font-body">Please contact Volta NYC to arrange a time.</p>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-5">
                <div className="grid md:grid-cols-[210px,1fr] gap-4">
                  <div className="space-y-2">
                    <p className="text-white/35 text-[11px] uppercase tracking-wider font-body">Choose a day</p>
                    <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                      {sortedDates.map((date) => (
                        <button
                          key={date}
                          onClick={() => {
                            setSelectedDate(date);
                            const first = dateSlotMap[date]?.[0];
                            if (first) setSelectedTime(first.datetime);
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-left transition-colors ${
                            selectedDate === date
                              ? "bg-[#85CC17]/15 border-[#85CC17]/40 text-white"
                              : "bg-white/3 border-white/8 text-white/65 hover:bg-white/7 hover:text-white"
                          }`}
                        >
                          <span className="text-sm font-semibold font-body">{formatDayTab(date)}</span>
                          <span className="text-[11px] text-white/35 font-body">{dateSlotMap[date].length}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#0F1014] p-4">
                    <p className="text-white text-sm font-semibold font-body mb-1">
                      {selectedDate ? formatDayHeading(selectedDate) : "Select a day"}
                    </p>
                    <p className="text-white/40 text-xs font-body mb-3">
                      {timesForDate.length} available time{timesForDate.length !== 1 ? "s" : ""}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {timesForDate.map((slot) => {
                        const active = selectedTime === slot.datetime;
                        return (
                          <button
                            key={slot.id}
                            onClick={() => setSelectedTime(slot.datetime)}
                            className={`px-3 py-2 rounded-lg border text-sm font-body transition-colors ${
                              active
                                ? "bg-[#85CC17] border-[#85CC17] text-[#0D0D0D] font-semibold"
                                : "bg-white/5 border-white/10 text-white/75 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            {formatTime(slot.datetime)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleBook}
                  disabled={!selectedSlot || submitting}
                  className={`w-full py-3 rounded-xl font-display font-bold text-sm transition-all ${
                    selectedSlot && !submitting
                      ? "bg-[#85CC17] text-[#0D0D0D] hover:bg-[#72b314]"
                      : "bg-white/8 text-white/25 cursor-not-allowed"
                  }`}
                >
                  {submitting
                    ? "Booking..."
                    : selectedSlot
                    ? `Confirm - ${formatDayTab(selectedDate)}, ${formatTime(selectedSlot.datetime)}`
                    : "Select a time above"}
                </button>
              </div>
            )}
          </div>
        )}

        {state === "confirmed" && confirmedSlot && (
          <div className="bg-[#1C1F26] border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-6 pt-8 pb-5 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-[#85CC17]/15 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-[#85CC17]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <h2 className="text-white font-bold text-xl">You&apos;re booked!</h2>
                <p className="text-white/50 text-sm mt-1 font-body">See you soon, {bookerName}.</p>
              </div>
            </div>

            <div className="mx-6 mb-5 bg-[#0F1014] border border-white/10 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2.5 text-sm">
                <svg className="w-4 h-4 text-white/40 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span className="text-white">{formatConfirmed(confirmedSlot.datetime)}</span>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <svg className="w-4 h-4 text-white/40 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="text-white/70">{confirmedSlot.durationMinutes} minutes</span>
              </div>
              {confirmedSlot.location && (
                <div className="flex items-center gap-2.5 text-sm">
                  <svg className="w-4 h-4 text-white/40 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span className="text-white/70">{confirmedSlot.location}</span>
                </div>
              )}
            </div>

            <div className="px-6 pb-5 space-y-2.5">
              <button
                onClick={async () => {
                  const latest = await loadLatestZoomLink();
                  downloadICS(confirmedSlot, latest);
                }}
                className="w-full py-3 rounded-xl bg-white/6 border border-white/10 text-white font-display font-bold text-sm hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <line x1="12" y1="15" x2="12" y2="19" />
                  <line x1="10" y1="17" x2="14" y2="17" />
                </svg>
                Add to Calendar
              </button>

              {zoomLink && (
                <button
                  onClick={handleCopyZoom}
                  className="w-full py-3 rounded-xl bg-[#2D8CFF]/12 border border-[#2D8CFF]/25 text-[#6DB8FF] font-display font-bold text-sm hover:bg-[#2D8CFF]/20 transition-colors flex items-center justify-center gap-2"
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                      Copy Zoom Link
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="px-6 pb-6">
              <p className="text-white/25 text-xs text-center font-body">
                Need to reschedule? Book a new time with the same email and your old slot will be replaced automatically.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
