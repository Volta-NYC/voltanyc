"use client";

import { useState, useRef } from "react";
import { CheckIcon } from "@/components/Icons";
import { validateApplicationForm, type ApplicationFormValues } from "@/lib/schemas";
import { TRACK_NAMES } from "@/data";

const REFERRAL_OPTIONS = ["School counselor", "Friend", "Social media", "Online", "Referral", "Other"];
const GRADE_OPTIONS = ["Freshman", "Sophomore", "Junior", "Senior", "College / Other"];

const EMPTY: ApplicationFormValues = {
  fullName: "", email: "", city: "", schoolName: "", grade: "", referral: "",
  tracks: [], hasResume: null, tools: "", accomplishment: "",
};

export default function ApplicationForm() {
  const [form, setForm] = useState<ApplicationFormValues>(EMPTY);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof ApplicationFormValues>(k: K, v: ApplicationFormValues[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const clearError = (k: string) =>
    setErrors((p) => { const next = { ...p }; delete next[k]; return next; });

  const toggleTrack = (t: string) =>
    set("tracks", form.tracks.includes(t) ? form.tracks.filter((x) => x !== t) : [...form.tracks, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateApplicationForm(form);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setStatus("loading");

    // Upload resume to Google Drive via Apps Script if a file was selected.
    let resumeUrl = "";
    const file = fileRef.current?.files?.[0];
    if (form.hasResume === true && file) {
      setUploadProgress("Uploading resume…");
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/upload-resume", { method: "POST", body: fd });
        const json = await res.json();
        resumeUrl = json.url ?? "";
      } catch {
        // Non-fatal: submit without URL if upload fails.
      }
      setUploadProgress("");
    }

    const payload: Record<string, string> = {
      formType: "application",
      "Full Name": form.fullName,
      Email: form.email,
      "School Name": form.schoolName,
      Grade: form.grade,
      "City, State": form.city,
      "How They Heard": form.referral,
      "Tracks Selected": form.tracks.join(", "),
      "Has Resume": form.hasResume ? "Yes" : "No",
      "Resume URL": resumeUrl,
    };
    if (form.hasResume === false) {
      payload["Tools/Software"] = form.tools;
      payload["Accomplishment"] = form.accomplishment;
    }

    fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});

    setStatus("success");
  };

  if (status === "success") {
    return (
      <div className="bg-white border border-v-border rounded-2xl p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-v-green/20 flex items-center justify-center mx-auto mb-5">
          <CheckIcon className="w-8 h-8 text-v-green" />
        </div>
        <h3 className="font-display font-bold text-2xl text-v-ink mb-3">Application received.</h3>
        <p className="font-body text-v-muted max-w-sm mx-auto">
          We&apos;ll review your application and reach out within a few days to schedule a quick conversation.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-7">

      <div>
        <label className="block font-body text-sm font-semibold text-v-ink mb-2">Full Name *</label>
        <input
          value={form.fullName}
          onChange={(e) => { set("fullName", e.target.value); clearError("fullName"); }}
          className={`volta-input ${errors.fullName ? "border-red-400" : ""}`}
          placeholder="Your full name"
        />
        {errors.fullName && <p className="text-red-500 text-xs mt-1 font-body">{errors.fullName}</p>}
      </div>

      <div>
        <label className="block font-body text-sm font-semibold text-v-ink mb-2">Email Address *</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => { set("email", e.target.value); clearError("email"); }}
          className={`volta-input ${errors.email ? "border-red-400" : ""}`}
          placeholder="you@email.com"
        />
        {errors.email && <p className="text-red-500 text-xs mt-1 font-body">{errors.email}</p>}
      </div>

      <div>
        <label className="block font-body text-sm font-semibold text-v-ink mb-2">School Name *</label>
        <input
          value={form.schoolName}
          onChange={(e) => { set("schoolName", e.target.value); clearError("schoolName"); }}
          className={`volta-input ${errors.schoolName ? "border-red-400" : ""}`}
          placeholder="e.g. Stuyvesant High School"
        />
        {errors.schoolName && <p className="text-red-500 text-xs mt-1 font-body">{errors.schoolName}</p>}
      </div>

      <div>
        <label className="block font-body text-sm font-semibold text-v-ink mb-2">Grade *</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {GRADE_OPTIONS.map((grade) => {
            const active = form.grade === grade;
            return (
              <button
                key={grade}
                type="button"
                onClick={() => { set("grade", grade); clearError("grade"); }}
                className={`w-full text-left px-4 py-3 rounded-xl border font-body text-sm font-medium transition-all flex items-center gap-3 ${
                  active ? "bg-v-green/10 border-v-green text-v-ink" : "bg-white border-v-border text-v-muted hover:border-v-ink"
                }`}
              >
                <span className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${active ? "bg-v-green border-v-green" : "border-v-border"}`}>
                  {active && <CheckIcon className="w-3 h-3 text-v-ink" />}
                </span>
                {grade}
              </button>
            );
          })}
        </div>
        {errors.grade && <p className="text-red-500 text-xs mt-2 font-body">{errors.grade}</p>}
      </div>

      <div>
        <label className="block font-body text-sm font-semibold text-v-ink mb-2">City, State *</label>
        <input
          value={form.city}
          onChange={(e) => { set("city", e.target.value); clearError("city"); }}
          className={`volta-input ${errors.city ? "border-red-400" : ""}`}
          placeholder="e.g. New York, New York"
        />
        {errors.city && <p className="text-red-500 text-xs mt-1 font-body">{errors.city}</p>}
      </div>

      <div>
        <label className="block font-body text-sm font-semibold text-v-ink mb-2">How did you hear about Volta? *</label>
        <select
          value={form.referral}
          onChange={(e) => { set("referral", e.target.value); clearError("referral"); }}
          className={`volta-input ${errors.referral ? "border-red-400" : ""}`}
        >
          <option value="">Select one</option>
          {REFERRAL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {errors.referral && <p className="text-red-500 text-xs mt-1 font-body">{errors.referral}</p>}
      </div>

      <div>
        <label className="block font-body text-sm font-semibold text-v-ink mb-1">
          Select your track(s) *{" "}
          <a href="/showcase#tracks" target="_blank" rel="noopener noreferrer" className="text-v-blue font-normal hover:underline text-xs">
            (see what each track does →)
          </a>
        </label>
        <p className="font-body text-xs text-v-muted mb-3">You may select more than one.</p>
        <div className="flex flex-col gap-3">
          {TRACK_NAMES.map((t) => {
            const active = form.tracks.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => { toggleTrack(t); clearError("tracks"); }}
                className={`w-full text-left px-5 py-3 rounded-xl border font-body text-sm font-medium transition-all flex items-center gap-3 ${
                  active ? "bg-v-green/10 border-v-green text-v-ink" : "bg-white border-v-border text-v-muted hover:border-v-ink"
                }`}
              >
                <span className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${active ? "bg-v-green border-v-green" : "border-v-border"}`}>
                  {active && <CheckIcon className="w-3 h-3 text-v-ink" />}
                </span>
                {t}
              </button>
            );
          })}
        </div>
        {errors.tracks && <p className="text-red-500 text-xs mt-2 font-body">{errors.tracks}</p>}
      </div>

      <div>
        <label className="block font-body text-sm font-semibold text-v-ink mb-3">Do you have a resume to attach?</label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { set("hasResume", true); clearError("hasResume"); }}
            className={`flex-1 py-3 rounded-xl border font-body text-sm font-medium transition-all ${form.hasResume === true ? "bg-v-green border-v-green text-v-ink" : "bg-white border-v-border text-v-muted hover:border-v-ink"}`}
          >
            Yes — attach resume
          </button>
          <button
            type="button"
            onClick={() => { set("hasResume", false); clearError("hasResume"); }}
            className={`flex-1 py-3 rounded-xl border font-body text-sm font-medium transition-all ${form.hasResume === false ? "bg-v-ink border-v-ink text-white" : "bg-white border-v-border text-v-muted hover:border-v-ink"}`}
          >
            No resume
          </button>
        </div>
        {errors.hasResume && <p className="text-red-500 text-xs mt-2 font-body">{errors.hasResume}</p>}

        {form.hasResume === true && (
          <div className="mt-5">
            <label className="block font-body text-sm font-semibold text-v-ink mb-2">Attach Resume *</label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx"
              className="block w-full text-sm text-v-muted file:mr-4 file:py-2.5 file:px-5 file:rounded-full file:border-0 file:font-body file:font-semibold file:text-sm file:bg-v-green file:text-v-ink hover:file:bg-v-green-dark cursor-pointer"
            />
            <p className="text-xs text-v-muted/60 mt-1.5">PDF, DOC, or DOCX. Max 5MB.</p>
            {uploadProgress && (
              <p className="text-xs text-v-muted mt-2">{uploadProgress}</p>
            )}
          </div>
        )}

        {form.hasResume === false && (
          <div className="mt-6 space-y-6 border-l-2 border-v-green pl-5">
            <div>
              <label className="block font-body text-sm font-semibold text-v-ink mb-2">
                List any specific tools or software you have experience with *
              </label>
              <textarea
                value={form.tools}
                onChange={(e) => { set("tools", e.target.value); clearError("tools"); }}
                className={`volta-input resize-none ${errors.tools ? "border-red-400" : ""}`}
                rows={3}
                placeholder="e.g. Figma, React, Excel, Canva, Python, Google Ads…"
              />
              {errors.tools && <p className="text-red-500 text-xs mt-1 font-body">{errors.tools}</p>}
            </div>
            <div>
              <label className="block font-body text-sm font-semibold text-v-ink mb-2">
                What is your most impressive accomplishment, or a goal you&apos;re passionate about? *
              </label>
              <textarea
                value={form.accomplishment}
                onChange={(e) => { set("accomplishment", e.target.value); clearError("accomplishment"); }}
                className={`volta-input resize-none ${errors.accomplishment ? "border-red-400" : ""}`}
                rows={5}
                placeholder="Tell us something you're proud of or working toward."
              />
              {errors.accomplishment && <p className="text-red-500 text-xs mt-1 font-body">{errors.accomplishment}</p>}
            </div>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full bg-v-green text-v-ink font-display font-bold text-base py-4 rounded-xl hover:bg-v-green-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === "loading"
          ? uploadProgress || "Submitting…"
          : "Submit Application →"}
      </button>

      {status === "error" && (
        <p className="text-red-500 text-sm text-center font-body">
          Something went wrong. Email us at info@voltanyc.org
        </p>
      )}
      <p className="text-xs text-v-muted text-center font-body">
        Rolling admissions — we&apos;ll follow up within a few days.
      </p>
    </form>
  );
}
