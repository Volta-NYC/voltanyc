import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import Link from "next/link";
import AnimatedSection from "@/components/AnimatedSection";
import { joinTracks, joinFaqs } from "@/data";

export const metadata: Metadata = {
  title: "Get Involved | Volta NYC",
  description:
    "Join Volta NYC to work on real projects for real businesses. All experience levels welcome. 5-minute application and rolling admissions.",
  openGraph: {
    title: "Get Involved | Volta NYC",
    description: "Real projects. Real clients. All experience levels welcome.",
  },
};

interface SchoolGroup {
  category: string;
  schools: string[];
}

function dedupeSchools(schools: string[]): string[] {
  const seen = new Set<string>();
  return schools.filter((school) => {
    const key = school.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseSchools(markdown: string): SchoolGroup[] {
  const sections: SchoolGroup[] = [];
  let current: SchoolGroup | null = null;
  for (const line of markdown.split("\n")) {
    const t = line.trim();
    if (t.startsWith("## ")) {
      if (current) {
        sections.push({ ...current, schools: dedupeSchools(current.schools) });
      }
      current = { category: t.slice(3), schools: [] };
    } else if (t.startsWith("- ") && current) {
      current.schools.push(t.slice(2));
    }
  }
  if (current) sections.push({ ...current, schools: dedupeSchools(current.schools) });
  return sections;
}

const leadershipSteps = [
  {
    role: "Analyst",
    desc: "Contribute on live projects and ship your first client-facing deliverables.",
  },
  {
    role: "Senior Analyst",
    desc: "Take ownership of workstreams and mentor newer analysts on execution quality.",
  },
  {
    role: "Associate",
    desc: "Manage core project pieces, coordinate with teammates, and keep client progress on track.",
  },
  {
    role: "Senior Associate",
    desc: "Lead larger initiatives across teams and help drive standards across active projects.",
  },
  {
    role: "Project Lead",
    desc: "Run projects end to end, lead pods, and serve as the main client-facing owner.",
  },
];

const otherRoles = [
  {
    role: "Neighborhood Liaison",
    desc: "Coordinate between project teams and neighborhood business owners, including BID tours and on-the-ground merchant outreach.",
  },
  {
    role: "School Ambassador",
    desc: "Represent Volta at your school, expand student outreach, and help build a reliable pipeline of project teams.",
  },
  {
    role: "Head of City Expansion",
    desc: "Launch Volta in a new city, build local partnerships, and set up the first student teams and operating structure.",
  },
];

export default function Join() {
  const schoolsRaw = fs.readFileSync(
    path.join(process.cwd(), "src/data/schools.md"),
    "utf-8"
  );
  const schoolGroups = parseSchools(schoolsRaw);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: joinFaqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.a,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <section className="bg-v-ink pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <AnimatedSection>
            <p className="font-body text-sm font-semibold text-v-green uppercase tracking-widest mb-4">
              Join Volta NYC
            </p>
            <h1 className="font-display font-bold text-white leading-none tracking-tight mb-5" style={{ fontSize: "clamp(2.4rem, 7vw, 4.6rem)" }}>
              Student teams on
              <br />
              <span className="text-v-green">real client work.</span>
            </h1>
            <p className="font-body text-white/80 text-lg mb-3">
              All levels of experience welcome.
            </p>
            <p className="font-body text-white/65 text-base leading-relaxed mb-7 max-w-2xl">
              You&apos;ll work on websites, marketing, or finance projects that local businesses actually use.
              It&apos;s practical, fast-moving, and built to help you ship real work.
            </p>
            <div className="flex flex-wrap items-center gap-4 mb-3">
              <Link
                href="/apply"
                className="bg-v-green text-v-ink font-display font-bold text-base px-8 py-4 rounded-full hover:bg-v-green-dark transition-colors"
              >
                Apply Now →
              </Link>
            </div>
            <p className="font-body text-sm text-white/50">
              Takes 5 minutes · Rolling admissions.
            </p>
          </AnimatedSection>
        </div>
      </section>

      <section className="py-20 bg-white border-b border-v-border">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <AnimatedSection className="mb-12">
            <p className="font-body text-sm font-semibold text-v-blue uppercase tracking-widest mb-3">Pick your path</p>
            <h2 className="font-display font-bold text-v-ink text-3xl md:text-4xl">Three tracks</h2>
            <p className="font-body text-v-muted text-lg mt-3 max-w-xl">
              Three tracks, one goal: ship something real for a real business.
            </p>
          </AnimatedSection>
          <div className="grid md:grid-cols-3 gap-6">
            {joinTracks.map((t, i) => (
              <AnimatedSection key={t.name} delay={i * 0.1}>
                <div className={`border-2 ${t.color} rounded-2xl p-8 h-full`}>
                  <div className={`w-12 h-12 rounded-xl ${t.iconBg} flex items-center justify-center mb-5`}>
                    <t.icon className={`w-6 h-6 ${t.iconColor}`} />
                  </div>
                  <span className={`tag ${t.tagColor} mb-4 inline-block`}>{t.name}</span>
                  <h3 className="font-display font-bold text-v-ink text-lg mb-4">What you&apos;ll do</h3>
                  <ul className="space-y-2 mb-6">
                    {t.doWhat.map((d) => (
                      <li key={d} className="font-body text-sm text-v-muted flex items-start gap-2.5">
                        <span className="text-v-green mt-0.5 flex-shrink-0">→</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                  <h3 className="font-display font-bold text-v-ink text-sm mb-3 uppercase tracking-wide">We look for</h3>
                  <ul className="space-y-2">
                    {t.skills.map((s) => (
                      <li key={s} className="font-body text-xs text-v-muted flex items-start gap-2">
                        <span className="text-v-muted/50 mt-0.5 flex-shrink-0">·</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-v-bg border-b border-v-border">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <AnimatedSection className="mb-12">
            <p className="font-body text-sm font-semibold text-v-green uppercase tracking-widest mb-3">Our members</p>
            <h2 className="font-display font-bold text-v-ink text-3xl md:text-4xl">Where we come from</h2>
          </AnimatedSection>
          <div className="space-y-10">
            {schoolGroups.map((group, gi) => (
              <AnimatedSection key={group.category} delay={gi * 0.08}>
                <h3 className="font-body text-xs font-semibold text-v-muted uppercase tracking-widest mb-4">{group.category}</h3>
                <div className="bg-white border border-v-border rounded-2xl px-5 py-5 md:px-6 md:py-6">
                  <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2 list-disc pl-5">
                    {group.schools.map((school) => (
                      <li key={school} className="font-body text-sm text-v-ink marker:text-v-green">
                        {school}
                      </li>
                    ))}
                  </ul>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-white border-b border-v-border">
        <div className="max-w-5xl mx-auto px-5 md:px-8">
          <AnimatedSection className="mb-12">
            <p className="font-body text-sm font-semibold text-v-blue uppercase tracking-widest mb-3">How you grow</p>
            <h2 className="font-display font-bold text-v-ink text-3xl md:text-4xl">The leadership track</h2>
            <p className="font-body text-v-muted text-lg mt-3 max-w-xl">
              There&apos;s no ceiling. Strong contributors move up fast because we always need more leaders.
            </p>
          </AnimatedSection>
          <div className="relative">
            <div className="hidden md:block absolute top-5 left-[10%] right-[10%] h-px bg-v-border" />
            <div className="grid md:grid-cols-5 gap-6">
              {leadershipSteps.map((step, i) => (
                <AnimatedSection key={step.role} delay={i * 0.1}>
                  <div className="relative flex flex-col items-start md:items-center">
                    <div className="w-10 h-10 rounded-full bg-v-green flex items-center justify-center mb-4 z-10 flex-shrink-0">
                      <span className="font-display font-bold text-v-ink text-sm">{i + 1}</span>
                    </div>
                    <h3 className="font-display font-bold text-v-ink text-base mb-2 md:text-center">{step.role}</h3>
                    <p className="font-body text-sm text-v-muted leading-relaxed md:text-center">{step.desc}</p>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
          <AnimatedSection className="mt-10">
            <h3 className="font-body text-xs font-semibold text-v-muted uppercase tracking-widest mb-4">Other roles</h3>
            <div className="grid md:grid-cols-3 gap-4">
              {otherRoles.map((role) => (
                <div key={role.role} className="bg-v-bg border border-v-border rounded-2xl p-5">
                  <h4 className="font-display font-bold text-v-ink text-base mb-2">{role.role}</h4>
                  <p className="font-body text-sm text-v-muted leading-relaxed">{role.desc}</p>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-5 md:px-8">
          <AnimatedSection className="mb-10">
            <h2 className="font-display font-bold text-v-ink text-3xl">Questions</h2>
          </AnimatedSection>
          <div className="space-y-4">
            {joinFaqs.map((f, i) => (
              <AnimatedSection key={f.q} delay={i * 0.06}>
                <div className="bg-v-bg border border-v-border rounded-xl p-6">
                  <h3 className="font-display font-bold text-v-ink mb-2">{f.q}</h3>
                  <p className="font-body text-sm text-v-muted leading-relaxed">{f.a}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
