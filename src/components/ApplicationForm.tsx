"use client";

import { useState, useRef, useEffect } from "react";
import { CheckIcon } from "@/components/Icons";
import { validateApplicationForm, REFERRAL_NEEDS_NAME, type ApplicationFormValues } from "@/lib/schemas";
import { TRACK_NAMES, MARKETING_TRACK, MARKETING_SUBTRACKS } from "@/data";
import { CLASS_GRADE_OPTIONS } from "@/lib/grades";
import Combobox from "@/components/Combobox";
import SelectMenu from "@/components/SelectMenu";
import { COUNTRIES, STATE_ABBRS, citiesForState } from "@/lib/usPlaces";
import { EMAIL } from "@/lib/mail";
import { trackEvent, GA_EVENTS } from "@/lib/analytics";

const REFERRAL_OPTIONS = ["School counselor", "Friend", "Social media", "Online", "Referral", "Other"];
const GRADE_OPTIONS = CLASS_GRADE_OPTIONS.filter((grade) => grade !== "Class of 2022");
const RESUME_MAX_MB = 4;
const RESUME_MAX_BYTES = RESUME_MAX_MB * 1024 * 1024;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} role="alert" className="mt-1 font-body text-xs text-red-500">{message}</p>;
}

const EMPTY: ApplicationFormValues = {
  fullName: "", email: "", city: "", state: "", isInternational: false, chapter: "", schoolName: "",
  grade: "", referral: "", referralName: "", tracks: [], marketingSubtrack: "",
  hasResume: null, tools: "", accomplishment: "",
};

export default function ApplicationForm({ chapters }: { chapters: string[] }) {
  const [form, setForm] = useState<ApplicationFormValues>(EMPTY);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [schoolOptions, setSchoolOptions] = useState<string[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [resumeName, setResumeName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [openSubtrack, setOpenSubtrack] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/school-names")
      .then((r) => r.json())
      .then((names: string[]) => setSchoolOptions(names))
      .catch(() => setSchoolOptions([]))
      .finally(() => setLoadingSchools(false));
  }, []);

  const set = <K extends keyof ApplicationFormValues>(k: K, v: ApplicationFormValues[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const clearError = (k: string) =>
    setErrors((p) => { const next = { ...p }; delete next[k]; return next; });

  // Dropping Marketing must also drop the focus area, or a stale one submits.
  const toggleTrack = (t: string) => {
    const next = form.tracks.includes(t) ? form.tracks.filter((x) => x !== t) : [...form.tracks, t];
    setForm((p) => ({
      ...p,
      tracks: next,
      marketingSubtrack: next.includes(MARKETING_TRACK) ? p.marketingSubtrack : "",
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateApplicationForm(form);
    if (!result.success) {
      setErrors(result.errors);
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    setErrors({});
    setStatus("loading");

    // Upload resume to Google Drive via Apps Script if a file was selected.
    let resumeUrl = "";
    const file = fileRef.current?.files?.[0];
    if (form.hasResume === true && !file) {
      setErrors({ resumeUrl: "Attach your resume before submitting" });
      setStatus("idle");
      return;
    }
    if (file && file.size > RESUME_MAX_BYTES) {
      setErrors({ resumeUrl: `Resume must be under ${RESUME_MAX_MB}MB. Please compress it and try again.` });
      setStatus("idle");
      return;
    }
    if (form.hasResume === true && file) {
      setUploadProgress("Uploading resume…");
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/upload-resume", { method: "POST", body: fd });
        const text = await res.text();
        let json: Record<string, unknown> = {};
        try {
          json = JSON.parse(text) as Record<string, unknown>;
        } catch {
          throw new Error("Resume upload failed before reaching Google Drive. Please compress the file and try again.");
        }
        if (!res.ok) {
          throw new Error(typeof json.error === "string" ? json.error : "Resume upload failed");
        }
        resumeUrl = typeof json.url === "string" ? json.url : "";
        if (!resumeUrl) throw new Error("Resume upload did not return a Drive link");
      } catch (err) {
        setUploadProgress("");
        const message = err instanceof Error ? err.message : "Resume upload failed. Please try again.";
        setErrors({ resumeUrl: message });
        setStatus("error");
        return;
      }
      setUploadProgress("");
    }

    const payload: Record<string, string> = {
      formType: "application",
      "Full Name": form.fullName,
      Email: form.email,
      "School Name": form.schoolName,
      Grade: form.grade,
      "City, State": [form.city, form.state].filter(Boolean).join(", "),
      State: form.state,
      City: form.city,
      Chapter: form.chapter,
      "How They Heard": form.referral,
      "Referral Name": REFERRAL_NEEDS_NAME.includes(form.referral) ? form.referralName : "",
      "Tracks Selected": form.tracks.join(", "),
      "Marketing Subtrack": form.tracks.includes(MARKETING_TRACK) ? form.marketingSubtrack : "",
      "Has Resume": form.hasResume ? "Yes" : "No",
      "Resume URL": resumeUrl,
    };
    if (form.hasResume === false) {
      payload["Tools/Software"] = form.tools;
      payload["Accomplishment"] = form.accomplishment;
    }

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("submit_failed");
      setStatus("success");
      // Fired only after the API confirms the write, so this counts real
      // applications rather than attempts.
      trackEvent(GA_EVENTS.applicationSubmitted);
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div role="status" aria-live="polite" className="bg-white border border-n-border rounded-2xl p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-n-orange/20 flex items-center justify-center mx-auto mb-5">
          <CheckIcon className="w-8 h-8 text-n-orange" aria-hidden="true" />
        </div>
        <h3 className="font-display font-bold text-2xl text-n-ink mb-3">Application received.</h3>
        <p className="font-body text-n-muted max-w-sm mx-auto">
          We&apos;ll review your application. If a current opening fits your interests and availability, we&apos;ll email your onboarding steps.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-9">

      <div>
        <label htmlFor="application-full-name" className="block font-body text-sm font-semibold text-n-ink mb-2">Full Name *</label>
        <input
          id="application-full-name"
          value={form.fullName}
          onChange={(e) => { set("fullName", e.target.value); clearError("fullName"); }}
          aria-invalid={Boolean(errors.fullName)}
          aria-describedby={errors.fullName ? "application-full-name-error" : undefined}
          className={`novus-input ${errors.fullName ? "border-red-400" : ""}`}
          placeholder="Your full name"
        />
        <FieldError id="application-full-name-error" message={errors.fullName} />
      </div>

      <div>
        <label htmlFor="application-email" className="block font-body text-sm font-semibold text-n-ink mb-2">Email Address *</label>
        <p id="application-email-help" className="text-xs text-n-muted mt-1 mb-2 font-body">
          Please use your personal email address, not a school email.
        </p>
        <input
          id="application-email"
          type="email"
          value={form.email}
          onChange={(e) => { set("email", e.target.value); clearError("email"); }}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={`application-email-help${errors.email ? " application-email-error" : ""}`}
          className={`novus-input ${errors.email ? "border-red-400" : ""}`}
          placeholder="you@email.com"
        />
        <FieldError id="application-email-error" message={errors.email} />
      </div>

      <div>
        <label htmlFor="application-school" className="block font-body text-sm font-semibold text-n-ink mb-2">School Name *</label>
        <p id="application-school-help" className="text-xs text-n-muted mt-1 mb-2 font-body">
          Don&apos;t see your school? Just type it in.
        </p>
        <Combobox
          id="application-school"
          ariaLabel="School name"
          ariaDescribedBy={`application-school-help${errors.schoolName ? " application-school-error" : ""}`}
          invalid={Boolean(errors.schoolName)}
          value={form.schoolName}
          onChange={(value) => { set("schoolName", value); clearError("schoolName"); }}
          options={loadingSchools ? [] : schoolOptions}
          placeholder="Begin typing your school name"
          isDisabled={status === "loading"}
          theme="light"
        />
        {loadingSchools && (
          <p className="mt-2 flex items-center gap-2 font-body text-xs text-n-muted" aria-live="polite">
            <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-n-orange" />
            Loading school suggestions
          </p>
        )}
        <FieldError id="application-school-error" message={errors.schoolName} />
      </div>

      <div>
        <label htmlFor="application-grade" className="block font-body text-sm font-semibold text-n-ink mb-2">High School Class Year *</label>
        <SelectMenu
          id="application-grade"
          ariaLabel="High school class year"
          ariaDescribedBy={errors.grade ? "application-grade-error" : undefined}
          value={form.grade}
          onChange={(next) => { set("grade", next); clearError("grade"); }}
          options={GRADE_OPTIONS}
          placeholder="Select your graduation year"
          invalid={!!errors.grade}
        />
        <FieldError id="application-grade-error" message={errors.grade} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="application-state" className="block font-body text-sm font-semibold text-n-ink mb-2">
            {form.isInternational ? "Country *" : "State *"}
          </label>
          <SelectMenu
            id="application-state"
            ariaLabel={form.isInternational ? "Country" : "State"}
            ariaDescribedBy={errors.state ? "application-state-error" : undefined}
            value={form.state}
            onChange={(next) => {
              // Cities are state-specific, so a state change invalidates the city.
              setForm((p) => ({ ...p, state: next, city: "" }));
              clearError("state");
            }}
            options={form.isInternational ? COUNTRIES : STATE_ABBRS}
            placeholder="Select"
            invalid={!!errors.state}
          />
          <FieldError id="application-state-error" message={errors.state} />
        </div>
        <div>
          <label htmlFor="application-city" className="block font-body text-sm font-semibold text-n-ink mb-2">City *</label>
          {form.isInternational ? (
            // No city list exists for 196 countries, so this is the one location
            // field that has to accept free text. It is under 1% of applicants.
            <input
              id="application-city"
              type="text"
              aria-label="City"
              aria-describedby={errors.city ? "application-city-error" : undefined}
              value={form.city}
              onChange={(e) => { set("city", e.target.value); clearError("city"); }}
              className={`novus-input ${errors.city ? "border-red-500" : ""}`}
              placeholder={form.state ? "Your city" : "Pick a country first"}
              disabled={!form.state}
            />
          ) : (
            <SelectMenu
              id="application-city"
              ariaLabel="City"
              ariaDescribedBy={errors.city ? "application-city-error" : undefined}
              value={form.city}
              onChange={(next) => { set("city", next); clearError("city"); }}
              options={form.state ? citiesForState(form.state) : []}
              placeholder={form.state ? "Select" : "Pick a state first"}
              disabled={!form.state}
              invalid={!!errors.city}
            />
          )}
          <FieldError id="application-city-error" message={errors.city} />
        </div>
        <div className="sm:col-span-2 -mt-2">
          <button
            type="button"
            onClick={() => {
              // Switching modes invalidates both values: state abbreviations and
              // country names share no vocabulary.
              setForm((p) => ({ ...p, isInternational: !p.isInternational, state: "", city: "" }));
              clearError("state");
              clearError("city");
            }}
            className="font-body text-xs text-n-muted underline underline-offset-2 hover:text-n-ink transition-colors"
          >
            {form.isInternational ? "Applying from the United States?" : "Not in the United States?"}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="application-chapter" className="block font-body text-sm font-semibold text-n-ink mb-2">Chapter *</label>
        <p id="application-chapter-help" className="font-body text-xs text-n-muted mb-2">
          If you&apos;re not near any of these, select New York and you&apos;ll work remotely with the
          core team. If you&apos;d want to establish a chapter in your area, let us know.
        </p>
        <SelectMenu
          id="application-chapter"
          ariaLabel="Chapter"
          ariaDescribedBy={`application-chapter-help${errors.chapter ? " application-chapter-error" : ""}`}
          value={form.chapter}
          onChange={(next) => { set("chapter", next); clearError("chapter"); }}
          options={chapters}
          placeholder="Select a chapter"
          invalid={!!errors.chapter}
        />
        <FieldError id="application-chapter-error" message={errors.chapter} />
      </div>

      <div>
        <label htmlFor="application-referral" className="block font-body text-sm font-semibold text-n-ink mb-2">How did you hear about Novus? *</label>
        <SelectMenu
          id="application-referral"
          ariaLabel="How did you hear about Novus"
          ariaDescribedBy={errors.referral ? "application-referral-error" : undefined}
          value={form.referral}
          onChange={(next) => {
            // Switching away from a person-named answer must drop the name, or
            // a stale referrer submits alongside "Social media".
            setForm((p) => ({
              ...p,
              referral: next,
              referralName: REFERRAL_NEEDS_NAME.includes(next) ? p.referralName : "",
            }));
            clearError("referral");
          }}
          options={REFERRAL_OPTIONS}
          placeholder="Select one"
          invalid={!!errors.referral}
        />
        <FieldError id="application-referral-error" message={errors.referral} />
      </div>

      {REFERRAL_NEEDS_NAME.includes(form.referral) && (
        <div>
          <label htmlFor="application-referral-name" className="block font-body text-sm font-semibold text-n-ink mb-2">Who referred you? *</label>
          <input
            id="application-referral-name"
            type="text"
            value={form.referralName}
            onChange={(e) => { set("referralName", e.target.value); clearError("referralName"); }}
            aria-invalid={Boolean(errors.referralName)}
            aria-describedby={errors.referralName ? "application-referral-name-error" : undefined}
            className={`novus-input ${errors.referralName ? "border-red-400" : ""}`}
            placeholder="Their full name"
          />
          <FieldError id="application-referral-name-error" message={errors.referralName} />
        </div>
      )}

      <fieldset aria-describedby={errors.tracks ? "application-tracks-error" : undefined}>
        <legend className="block font-body text-sm font-semibold text-n-ink mb-1">
          Select your track(s) *{" "}
          <a href="/join#tracks" target="_blank" rel="noopener noreferrer" className="text-n-orange font-normal hover:underline text-xs">
            (see what each track does →)
          </a>
        </legend>
        <p className="font-body text-xs text-n-muted mb-3">You may select more than one.</p>
        <div className="flex flex-col gap-3">
          {TRACK_NAMES.map((t) => {
            const active = form.tracks.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={active}
                onClick={() => { toggleTrack(t); clearError("tracks"); }}
                className={`w-full text-left px-5 py-3 rounded-xl border font-body text-sm font-medium transition-all flex items-center gap-3 ${
                  active ? "bg-n-orange/10 border-n-orange text-n-ink" : "bg-white border-n-border text-n-muted hover:border-n-ink"
                }`}
              >
                <span className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${active ? "bg-n-orange border-n-orange" : "border-n-border"}`}>
                  {active && <CheckIcon className="w-3 h-3 text-n-ink" />}
                </span>
                {t}
              </button>
            );
          })}
        </div>
        <FieldError id="application-tracks-error" message={errors.tracks} />
      </fieldset>

      {form.tracks.includes(MARKETING_TRACK) && (
        <fieldset aria-describedby={errors.marketingSubtrack ? "application-marketing-error" : undefined}>
          <legend className="block font-body text-sm font-semibold text-n-ink mb-1">
            Which marketing focus area? *
          </legend>
          <p className="font-body text-xs text-n-muted mb-3">
            Select one. Tap a name to read what it involves.
          </p>
          <div className="flex flex-col gap-2">
            {MARKETING_SUBTRACKS.map((sub) => {
              const active = form.marketingSubtrack === sub.title;
              const open = openSubtrack === sub.title;
              return (
                <div
                  key={sub.title}
                  className={`rounded-xl border transition-all ${
                    active ? "bg-n-orange/10 border-n-orange" : "bg-white border-n-border"
                  }`}
                >
                  <div className="flex items-stretch">
                    <button
                      type="button"
                      onClick={() => { set("marketingSubtrack", sub.title); clearError("marketingSubtrack"); }}
                      aria-pressed={active}
                      className="flex flex-1 items-center gap-3 px-5 py-3 text-left font-body text-sm font-medium"
                    >
                      <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${active ? "border-n-orange" : "border-n-border"}`}>
                        {active && <span className="w-2 h-2 rounded-full bg-n-orange" />}
                      </span>
                      <span className={active ? "text-n-ink" : "text-n-muted"}>{sub.title}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenSubtrack(open ? null : sub.title)}
                      aria-expanded={open}
                      aria-label={`What ${sub.title} involves`}
                      className="px-4 text-n-muted hover:text-n-ink transition-colors"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
                      >
                        <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                  {open && (
                    <p className="font-body text-sm leading-relaxed text-n-ink/75 px-5 pb-4 -mt-1">
                      {sub.desc}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <FieldError id="application-marketing-error" message={errors.marketingSubtrack} />
        </fieldset>
      )}

      <div>
        <p id="application-resume-question" className="block font-body text-sm font-semibold text-n-ink mb-1">Do you have a resume to attach?</p>
        <p id="application-resume-help" className="font-body text-xs text-n-muted mb-3">
          We strongly encourage you to attach a resume, even if it is not fully fleshed out yet. A resume is required to be considered for any role above the entry-level Analyst position.
        </p>
        <div
          className="flex gap-3"
          role="radiogroup"
          aria-labelledby="application-resume-question"
          aria-describedby={`application-resume-help${errors.hasResume ? " application-resume-choice-error" : ""}`}
        >
          <button
            type="button"
            role="radio"
            aria-checked={form.hasResume === true}
            onClick={() => { set("hasResume", true); clearError("hasResume"); }}
            className={`flex-1 py-3 rounded-xl border font-body text-sm font-medium transition-all ${form.hasResume === true ? "bg-n-orange border-n-orange text-n-ink" : "bg-white border-n-border text-n-muted hover:border-n-ink"}`}
          >
            Yes, attach resume
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={form.hasResume === false}
            onClick={() => { set("hasResume", false); clearError("hasResume"); }}
            className={`flex-1 py-3 rounded-xl border font-body text-sm font-medium transition-all ${form.hasResume === false ? "bg-n-ink border-n-ink text-white" : "bg-white border-n-border text-n-muted hover:border-n-ink"}`}
          >
            No resume
          </button>
        </div>
        <FieldError id="application-resume-choice-error" message={errors.hasResume} />

        {form.hasResume === true && (
          <div className="mt-5">
            <p id="application-resume-label" className="block font-body text-sm font-semibold text-n-ink mb-2">Attach Resume *</p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center rounded-full bg-n-orange px-5 py-2.5 font-body text-sm font-semibold text-n-ink transition-colors hover:bg-n-orange-dark focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-n-ink">
                Choose file
                <input
                  id="application-resume-file"
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="sr-only"
                  aria-labelledby="application-resume-label"
                  aria-invalid={Boolean(errors.resumeUrl)}
                  aria-describedby={errors.resumeUrl ? "application-resume-error" : undefined}
                  onChange={(event) => setResumeName(event.target.files?.[0]?.name ?? "")}
                />
              </label>
              <span className="font-body text-sm text-n-muted">{resumeName || "No file chosen"}</span>
            </div>
            <p className="text-xs text-n-muted mt-1.5">PDF, DOC, or DOCX. Max {RESUME_MAX_MB}MB.</p>
            {uploadProgress && (
              <p className="text-xs text-n-muted mt-2">{uploadProgress}</p>
            )}
            <FieldError id="application-resume-error" message={errors.resumeUrl} />
          </div>
        )}

        {form.hasResume === false && (
          <div className="mt-6 space-y-6 border-l-2 border-n-orange pl-5">
            <div>
              <label htmlFor="application-tools" className="block font-body text-sm font-semibold text-n-ink mb-2">
                List any specific tools or software you have experience with *
              </label>
              <textarea
                id="application-tools"
                value={form.tools}
                aria-invalid={Boolean(errors.tools)}
                aria-describedby={errors.tools ? "application-tools-error" : undefined}
                onChange={(e) => { set("tools", e.target.value); clearError("tools"); }}
                className={`novus-input resize-none ${errors.tools ? "border-red-400" : ""}`}
                rows={3}
                placeholder="e.g. Figma, React, Excel, Canva, Python, Google Ads…"
              />
              <FieldError id="application-tools-error" message={errors.tools} />
            </div>
            <div>
              <label htmlFor="application-accomplishment" className="block font-body text-sm font-semibold text-n-ink mb-2">
                What is your most impressive accomplishment, or a goal you&apos;re passionate about? *
              </label>
              <textarea
                id="application-accomplishment"
                value={form.accomplishment}
                aria-invalid={Boolean(errors.accomplishment)}
                aria-describedby={errors.accomplishment ? "application-accomplishment-error" : undefined}
                onChange={(e) => { set("accomplishment", e.target.value); clearError("accomplishment"); }}
                className={`novus-input resize-none ${errors.accomplishment ? "border-red-400" : ""}`}
                rows={5}
                placeholder="Tell us something you're proud of or working toward."
              />
              <FieldError id="application-accomplishment-error" message={errors.accomplishment} />
            </div>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full bg-n-orange text-n-ink font-display font-bold text-base py-4 rounded-xl hover:bg-n-orange-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === "loading"
          ? uploadProgress || "Submitting…"
          : "Submit Application →"}
      </button>

      {status === "error" && (
        <p role="alert" className="text-red-500 text-sm text-center font-body">
          Something went wrong. Email us at {EMAIL.info}
        </p>
      )}
      <p className="text-xs text-n-muted text-center font-body">
        Rolling admissions. We review applications as teams have room to grow.
      </p>
    </form>
  );
}
