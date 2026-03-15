import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import AnimatedSection from "@/components/AnimatedSection";
import { MapPinIcon } from "@/components/Icons";
import { projects as fallbackProjects, joinTracks } from "@/data";
import { neighborhoods } from "@/data/neighborhoods";
import { VOLTA_STATS, formatStat } from "@/data/stats";
import { getPublicShowcaseCards } from "@/lib/server/publicShowcase";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Our Work | Volta NYC",
  description:
    `Interactive map and project portfolio showing Volta NYC's active work across ${formatStat(VOLTA_STATS.nycNeighborhoods)} NYC neighborhoods — websites, social media, SEO, and grant writing for small businesses.`,
  openGraph: {
    title: "Our Work | Volta NYC",
    description: `${formatStat(VOLTA_STATS.businessesServed)} businesses across ${formatStat(VOLTA_STATS.nycNeighborhoods)} NYC neighborhoods. See every project.`,
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

const NeighborhoodMap = dynamic(() => import("@/components/NeighborhoodMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-v-border/30 flex items-center justify-center">
      <p className="font-body text-sm text-v-muted">Loading map…</p>
    </div>
  ),
});

export default async function Showcase() {
  const publicShowcase = await getPublicShowcaseCards();
  const projects = publicShowcase.length > 0
    ? publicShowcase.map((card) => ({
      name: card.name,
      type: card.type,
      neighborhood: card.neighborhood,
      services: card.services,
      status: card.status,
      colorClass: SHOWCASE_COLOR_CLASS[card.color] ?? "bg-v-green",
      desc: card.desc,
      url: card.url,
      imageUrl: card.imageUrl,
      quote: undefined as string | undefined,
    }))
    : fallbackProjects.map((project) => ({
      name: project.name,
      type: project.type,
      neighborhood: project.neighborhood,
      services: project.services,
      status: project.status,
      colorClass: project.color,
      desc: project.desc,
      url: project.url,
      imageUrl: undefined as string | undefined,
      quote: project.quote,
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
      {/* ── INTRO ─────────────────────────────────────────────── */}
      <section className="bg-v-dark pt-32 pb-0 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-5 md:px-8 pb-10">
          <AnimatedSection>
            <p className="font-body text-sm font-semibold text-v-green uppercase tracking-widest mb-4">
              Our Work
            </p>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <h1
                className="font-display font-bold text-white leading-none tracking-tight"
                style={{ fontSize: "clamp(2.5rem, 7vw, 5rem)" }}
              >
                Projects across<br />
                <span className="text-v-green">NYC.</span>
              </h1>
              <div className="flex gap-8 md:pb-2">
                {[
                  { value: formatStat(VOLTA_STATS.businessesServed), label: "Businesses" },
                  { value: formatStat(VOLTA_STATS.nycNeighborhoods), label: "Neighborhoods" },
                  { value: formatStat(VOLTA_STATS.bidPartners), label: "BID partners" },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className="font-display font-bold text-v-green text-3xl leading-none">{s.value}</p>
                    <p className="font-body text-xs text-white/40 uppercase tracking-widest mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </AnimatedSection>
        </div>

        {/* ── MAP ───────────────────────────────────────────────── */}
        <div className="w-full h-[520px] md:h-[600px] relative border-t border-white/10">
          <NeighborhoodMap projects={projects.map(p => ({
            name: p.name,
            type: p.type,
            services: p.services,
            neighborhood: p.neighborhood,
            status: p.status,
            url: p.url,
            colorClass: p.colorClass
          }))} />
        </div>
      </section>

      {/* ── NEIGHBORHOOD STRIP ───────────────────────────────── */}
      <section className="bg-white border-b border-v-border py-6 overflow-hidden">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <p className="font-body text-xs font-semibold text-v-muted uppercase tracking-widest mb-4">
            Active neighborhoods
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 divide-x divide-v-border border border-v-border rounded-xl overflow-hidden">
            {neighborhoods.map((n) => (
              <div key={n.name} className="px-3 py-3 text-center">
                <p className="font-display font-bold text-v-ink text-xs uppercase tracking-wide leading-tight">
                  {n.name}
                </p>
                <p className="font-body text-[10px] text-v-muted mt-0.5">{n.borough}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROJECT CARDS ─────────────────────────────────────── */}
      <section className="py-20 bg-v-bg">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <AnimatedSection className="mb-10 flex items-end justify-between flex-wrap gap-3">
            <h2 className="font-display font-bold text-v-ink text-2xl md:text-3xl">
              Every project, documented.
            </h2>
            <Link href="/updates" className="font-body text-sm font-semibold text-v-blue hover:underline">
              See progress updates →
            </Link>
          </AnimatedSection>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((p, i) => (
              <AnimatedSection key={p.name} delay={i * 0.07}>
                <div className="bg-white border border-v-border rounded-2xl overflow-hidden project-card h-full flex flex-col">
                  <div className={`${p.colorClass} h-2`} />
                  <div
                    className="mx-7 mt-7 rounded-xl border border-v-border bg-v-bg h-40 flex items-center justify-center bg-cover bg-center"
                    style={p.imageUrl ? { backgroundImage: `url("${p.imageUrl.replace(/"/g, "%22")}")` } : undefined}
                  >
                    {!p.imageUrl && (
                      <span className="font-body text-xs text-v-muted uppercase tracking-wider">Project photo coming soon</span>
                    )}
                  </div>
                  <div className="p-7 flex-1 flex flex-col">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex gap-2 flex-wrap">
                        {p.services.map((s) => (
                          <span key={s} className={`tag border ${getServiceTagClass(s)}`}>{s}</span>
                        ))}
                      </div>
                      <span
                        className={`tag text-xs flex-shrink-0 ${
                          p.status === "Active"
                            ? "bg-lime-100 text-lime-700"
                            : p.status === "In Progress"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-v-border text-v-muted"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <h3 className="font-display font-bold text-v-ink text-xl mb-1">{p.name}</h3>
                    <p className="font-body text-sm text-v-muted mb-3">{p.type}</p>
                    <p className="font-body text-sm text-v-ink/70 leading-relaxed flex-1">{p.desc}</p>
                    {p.quote && (
                      <blockquote className="mt-4 border-l-2 border-v-green pl-3 font-body text-sm text-v-muted italic leading-relaxed">
                        &ldquo;{p.quote}&rdquo;
                      </blockquote>
                    )}
                    <div className="flex items-center justify-between mt-4">
                      <p className="font-body text-xs text-v-muted/70 flex items-center gap-1.5">
                        <MapPinIcon className="w-3.5 h-3.5 flex-shrink-0" />
                        {p.neighborhood}
                      </p>
                      {p.url && (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-body text-xs font-semibold text-v-blue hover:underline"
                        >
                          View →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── THREE TRACKS ──────────────────────────────────────── */}
      <section id="tracks" className="py-20 bg-white border-b border-v-border">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <AnimatedSection className="mb-14">
            <p className="font-body text-sm font-semibold text-v-green uppercase tracking-widest mb-3">How we work</p>
            <h2 className="font-display font-bold text-v-ink text-3xl md:text-4xl">The three tracks</h2>
            <p className="font-body text-v-muted mt-3 max-w-xl">
              Every project is staffed by students from one or more of our three service tracks. Here&apos;s what each track does and who fits in.
            </p>
          </AnimatedSection>
          <div className="grid md:grid-cols-3 gap-6">
            {joinTracks.map((t, i) => (
              <AnimatedSection key={t.name} delay={i * 0.1}>
                <div className={`border rounded-2xl p-8 h-full flex flex-col ${t.color}`}>
                  <div className={`w-11 h-11 rounded-xl ${t.iconBg} flex items-center justify-center mb-5`}>
                    <t.icon className={`w-5 h-5 ${t.iconColor}`} />
                  </div>
                  <h3 className="font-display font-bold text-v-ink text-xl mb-5">{t.name}</h3>

                  <p className="font-body text-xs font-semibold text-v-muted uppercase tracking-widest mb-3">What you&apos;ll do</p>
                  <ul className="space-y-2 mb-6">
                    {t.doWhat.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 font-body text-sm text-v-muted">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${t.iconColor.replace("text-", "bg-")}`} />
                        {item}
                      </li>
                    ))}
                  </ul>

                  <p className="font-body text-xs font-semibold text-v-muted uppercase tracking-widest mb-3 mt-auto pt-4 border-t border-black/6">Who fits in</p>
                  <ul className="space-y-2">
                    {t.skills.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 font-body text-sm text-v-muted">
                        <span className="w-1.5 h-1.5 rounded-full bg-v-muted/30 flex-shrink-0 mt-1.5" />
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

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className="py-16 bg-v-green text-center">
        <div className="max-w-2xl mx-auto px-5">
          <AnimatedSection>
            <h2 className="font-display font-bold text-v-ink text-3xl md:text-4xl mb-4">
              Your business could be next.
            </h2>
            <p className="font-body text-v-ink/70 mb-8">
              We&apos;re actively taking on projects in Brooklyn, Queens, Manhattan, the Bronx, and Staten Island.
            </p>
            <Link
              href="/partners#contact"
              className="inline-block bg-v-ink text-white font-display font-bold text-base px-8 py-4 rounded-full hover:bg-v-ink/80 transition-colors"
            >
              Work with us →
            </Link>
          </AnimatedSection>
        </div>
      </section>
    </>
  );
}
