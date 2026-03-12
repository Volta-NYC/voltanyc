import type { Metadata } from "next";
import Link from "next/link";
import AnimatedSection from "@/components/AnimatedSection";
import CountUp from "@/components/CountUp";
import HeroSection from "@/components/HeroSection";
import { MapPinIcon } from "@/components/Icons";
import { homeStats, currentProjects as fallbackCurrentProjects, joinTracks } from "@/data";
import { VOLTA_STATS, formatStat } from "@/data/stats";
import { getPublicShowcaseCards } from "@/lib/server/publicShowcase";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Volta NYC — Free Consulting for NYC Small Businesses",
  description:
    `Volta NYC places student teams on real consulting projects for NYC small businesses — websites, social media, grant writing, and SEO. Free of charge. ${formatStat(VOLTA_STATS.nycNeighborhoods)} neighborhoods, ${formatStat(VOLTA_STATS.studentMembers)} students.`,
  openGraph: {
    title: "Volta NYC",
    description: "Student consultants. Real deliverables. Free for NYC small businesses.",
  },
};

const SHOWCASE_COLOR_CLASS: Record<string, string> = {
  green: "bg-v-green",
  blue: "bg-v-blue",
  orange: "bg-orange-400",
  amber: "bg-amber-400",
  pink: "bg-pink-400",
  purple: "bg-purple-400",
};

export default async function Home() {
  const publicShowcase = await getPublicShowcaseCards();
  const publicHomeCards = publicShowcase
    .filter((card) => card.featuredOnHome)
    .slice(0, 3)
    .map((card) => ({
      name: card.name,
      type: card.type,
      neighborhood: card.neighborhood,
      services: card.services,
      colorClass: SHOWCASE_COLOR_CLASS[card.color] ?? "bg-v-green",
      desc: card.desc,
      url: card.url,
      imageUrl: card.imageUrl,
    }));

  const currentProjects = publicHomeCards.length > 0
    ? publicHomeCards
    : fallbackCurrentProjects.map((project) => ({
      name: project.name,
      type: project.type,
      neighborhood: project.neighborhood,
      services: project.services,
      colorClass: project.color,
      desc: project.desc,
      url: project.url,
      imageUrl: undefined as string | undefined,
    }));

  const getServiceTagClass = (service: string) => {
    const key = service.trim().toLowerCase();
    if (key.includes("website") || key.includes("seo") || key.includes("google")) {
      return "bg-blue-100 text-blue-700 border-blue-200";
    }
    if (key.includes("social")) {
      return "bg-lime-100 text-lime-700 border-lime-200";
    }
    if (key.includes("finance") || key.includes("grant") || key.includes("payment")) {
      return "bg-amber-100 text-amber-700 border-amber-200";
    }
    return "bg-v-border text-v-muted border-v-border";
  };

  return (
    <>
      <HeroSection />

      {/* ── STATS ────────────────────────────────────────────── */}
      <section className="bg-v-dark py-20">
        <div className="max-w-5xl mx-auto px-5 grid grid-cols-2 md:grid-cols-4 gap-10">
          {homeStats.map((s) => (
            <AnimatedSection key={s.label} className="text-center">
              <div className="font-display font-bold text-5xl md:text-6xl text-v-green mb-2">
                <CountUp end={s.value} suffix={s.suffix} />
              </div>
              <div className="font-body text-xs uppercase tracking-widest text-white/40">{s.label}</div>
            </AnimatedSection>
          ))}
        </div>
      </section>

      {/* ── HOW VOLTA WORKS ──────────────────────────────────── */}
      <section className="py-20 bg-white border-b border-v-border">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <AnimatedSection className="mb-12">
            <p className="font-body text-sm font-semibold text-v-muted uppercase tracking-widest mb-3">How Volta works</p>
            <h2 className="font-display font-bold text-v-ink text-3xl md:text-4xl">Students build real deliverables for local businesses.</h2>
            <p className="font-body text-v-muted text-lg mt-4 max-w-4xl">
              Volta connects student teams with business owners who need support in websites, social media, and grant work.
              The model is simple: businesses get high-quality execution at no cost, and students gain real project experience.
            </p>
          </AnimatedSection>
          <div className="grid md:grid-cols-2 gap-6">
            <AnimatedSection direction="left">
              <div className="bg-v-bg border border-v-border rounded-2xl p-8 h-full">
                <p className="font-body text-xs font-semibold text-v-green uppercase tracking-widest mb-3">Join a project team</p>
                <h3 className="font-display font-bold text-v-ink text-2xl leading-tight mb-3">Student application</h3>
                <p className="font-body text-sm text-v-muted leading-relaxed mb-5">
                  5-minute application, rolling admissions, and real client work across three tracks.
                  We usually respond within 3 days.
                </p>
                <ul className="space-y-2.5 mb-6">
                  {[
                    "Digital & Tech: websites, SEO, and platform setup",
                    "Marketing & Strategy: social media, content, and growth analytics",
                    "Finance & Operations: grants, reporting, and operational analysis",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 font-body text-sm text-v-muted">
                      <span className="w-1.5 h-1.5 rounded-full bg-v-green flex-shrink-0 mt-1.5" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/join"
                  className="inline-block bg-v-ink text-white font-display font-bold text-sm px-7 py-3.5 rounded-full hover:bg-v-ink/80 transition-colors"
                >
                  Learn More & Apply →
                </Link>
              </div>
            </AnimatedSection>
            <AnimatedSection direction="right">
              <div className="bg-v-dark border border-white/5 rounded-2xl p-8 h-full">
                <p className="font-body text-xs font-semibold text-v-blue uppercase tracking-widest mb-3">Request support</p>
                <h3 className="font-display font-bold text-white text-2xl leading-tight mb-3">Business interest form</h3>
                <p className="font-body text-sm text-white/70 leading-relaxed mb-5">
                  Tell us what your business needs and we&apos;ll follow up quickly. Teams can support websites, social media, grant applications, and visibility improvements.
                </p>
                <ul className="space-y-2.5 mb-6">
                  {[
                    "Short intake form with your goals and contact info",
                    "Fast follow-up to scope the highest-impact work",
                    "Work tracked and delivered through dedicated student teams",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 font-body text-sm text-white/60">
                      <span className="w-1.5 h-1.5 rounded-full bg-v-blue flex-shrink-0 mt-1.5" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/partners#contact"
                  className="inline-block bg-v-blue text-white font-display font-bold text-sm px-7 py-3.5 rounded-full hover:bg-v-blue-dark transition-colors"
                >
                  Open Interest Form →
                </Link>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ── THREE TRACKS ─────────────────────────────────────── */}
      <section className="py-24 bg-v-bg border-t border-v-border">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <AnimatedSection className="mb-14">
            <p className="font-body text-sm font-semibold text-v-green uppercase tracking-widest mb-3">What we do</p>
            <h2 className="font-display font-bold text-v-ink" style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}>
              Three tracks.
            </h2>
            <p className="font-body text-v-muted text-lg mt-3 max-w-3xl">
              Each track has clear deliverables and hands-on skill development. Teams collaborate across tracks to ship complete outcomes for business owners.
            </p>
          </AnimatedSection>
          <div className="grid md:grid-cols-3 gap-5">
            {joinTracks.map((t, i) => (
              <AnimatedSection key={t.name} delay={i * 0.1}>
                <div className={`border-2 ${t.color} rounded-2xl p-8 h-full project-card`}>
                  <div className={`w-12 h-12 rounded-xl ${t.iconBg} flex items-center justify-center mb-5`}>
                    <t.icon className={`w-6 h-6 ${t.iconColor}`} />
                  </div>
                  <span className={`tag ${t.tagColor} mb-4 inline-block`}>{t.name}</span>
                  <h3 className="font-display font-bold text-v-ink text-base mb-3">What teams deliver</h3>
                  <ul className="space-y-2 mb-5">
                    {t.doWhat.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 font-body text-sm text-v-muted">
                        <span className="text-v-green mt-0.5 flex-shrink-0">→</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <h3 className="font-display font-bold text-v-ink text-xs uppercase tracking-wider mb-3">Core skills</h3>
                  <ul className="space-y-2">
                    {t.skills.map((item) => (
                      <li key={item} className="flex items-start gap-2 font-body text-xs text-v-muted">
                        <span className="text-v-muted/50 mt-0.5 flex-shrink-0">·</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── CURRENT PROJECTS ─────────────────────────────────── */}
      <section className="py-20 bg-white border-y border-v-border">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <AnimatedSection className="mb-10 flex items-end justify-between flex-wrap gap-4">
            <div>
              <p className="font-body text-sm font-semibold text-v-green uppercase tracking-widest mb-2">Currently active</p>
              <h2 className="font-display font-bold text-v-ink text-3xl md:text-4xl">In the field right now</h2>
            </div>
            <Link href="/showcase" className="font-body text-sm font-semibold text-v-blue hover:underline">
              See all work →
            </Link>
          </AnimatedSection>
          <div className="grid md:grid-cols-3 gap-5">
            {currentProjects.map((p, i) => (
              <AnimatedSection key={p.name} delay={i * 0.1}>
                <div className="border border-v-border rounded-2xl overflow-hidden project-card bg-v-bg">
                  <div className={`${p.colorClass} h-2`} />
                  <div
                    className="mx-6 mt-6 rounded-xl border border-v-border h-36 flex items-center justify-center bg-white bg-cover bg-center"
                    style={p.imageUrl ? { backgroundImage: `url("${p.imageUrl.replace(/"/g, "%22")}")` } : undefined}
                  >
                    {!p.imageUrl && (
                      <span className="font-body text-xs text-v-muted uppercase tracking-wider">Project photo coming soon</span>
                    )}
                  </div>
                  <div className="p-6">
                    <span className={`tag border mb-4 inline-block ${getServiceTagClass(p.services[0])}`}>{p.services[0]}</span>
                    <h3 className="font-display font-bold text-v-ink text-xl mb-1">{p.name}</h3>
                    <p className="font-body text-sm text-v-muted">{p.type}</p>
                    <p className="font-body text-xs text-v-muted/70 mt-2 flex items-center gap-1.5">
                      <MapPinIcon className="w-3.5 h-3.5 flex-shrink-0" /> {p.neighborhood}
                    </p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── NYC REACH ────────────────────────────────────────── */}
      <section className="py-20 bg-v-dark">
        <div className="max-w-4xl mx-auto px-5 md:px-8 text-center">
          <AnimatedSection className="mb-10">
            <p className="font-body text-xs font-semibold text-v-green uppercase tracking-widest mb-3">Our reach</p>
            <h2 className="font-display font-bold text-white text-3xl md:text-4xl mb-4">
              Across all five boroughs.
            </h2>
            <p className="font-body text-white/50 text-lg max-w-xl mx-auto">
              {formatStat(VOLTA_STATS.nycNeighborhoods)} active neighborhoods and growing — we go where NYC&apos;s small businesses are.
            </p>
          </AnimatedSection>
          <div className="flex flex-wrap justify-center gap-3 mt-8">
            {[
              { name: "Brooklyn", cls: "border-lime-500/30 text-lime-400 bg-lime-500/10" },
              { name: "Queens", cls: "border-blue-400/30 text-blue-300 bg-blue-400/10" },
              { name: "Manhattan", cls: "border-amber-400/30 text-amber-400 bg-amber-400/10" },
              { name: "The Bronx", cls: "border-purple-400/30 text-purple-400 bg-purple-400/10" },
              { name: "Staten Island", cls: "border-rose-400/30 text-rose-400 bg-rose-400/10" },
            ].map((b, i) => (
              <AnimatedSection key={b.name} delay={i * 0.08}>
                <span className={`inline-block border rounded-full px-6 py-2.5 font-display font-bold text-base ${b.cls}`}>
                  {b.name}
                </span>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

    </>
  );
}
