import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import AnimatedSection from "@/components/AnimatedSection";
import HomeStats from "@/components/HomeStats";
import HeroSection from "@/components/HeroSection";
import HomeScrollBridge from "@/components/HomeScrollBridge";
import HomeNetworkSection from "@/components/HomeNetworkSection";
import { MapPinIcon } from "@/components/Icons";
import { currentProjects as fallbackCurrentProjects, type CommunityPartner } from "@/data";
import TracksTabbed from "@/components/TracksTabbed";
import HomeProjectMobileCarousel from "@/components/HomeProjectMobileCarousel";
import HomeProjectMasonry from "@/components/HomeProjectMasonry";
import { getPublicShowcaseCards } from "@/lib/server/publicShowcase";
import { getPublicStatSnapshot, PUBLISHED_IMPACT_TOTALS } from "@/lib/server/publicStats";
import { getPublicCommunityPartners } from "@/lib/server/publicPartners";


export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { absolute: "Novus NYC | Free Consulting for NYC Small Businesses" },
    description:
      `Digital equity is economic equity. Novus connects student teams with New York City small businesses to provide free support in technology, marketing, finance, operations, websites, SEO, social media, and grant development. ${PUBLISHED_IMPACT_TOTALS.students} students, ${PUBLISHED_IMPACT_TOTALS.businesses} businesses served.`,
    openGraph: {
      title: "Novus NYC",
      description: "Digital equity is economic equity. Student teams providing free consulting support for New York City small businesses.",
      images: ["/api/og"],
    },
  };
}

const SHOWCASE_COLOR_CLASS: Record<string, string> = {
  "blue-soft": "bg-violet-200",
  "blue-mid": "bg-violet-300",
  "blue-deep": "bg-violet-400",
  "lime-soft": "bg-orange-200",
  "lime-mid": "bg-orange-300",
  "lime-deep": "bg-orange-400",
  "amber-soft": "bg-amber-200",
  "amber-mid": "bg-amber-300",
  "amber-deep": "bg-amber-400",
  "pink-soft": "bg-fuchsia-200",
  "pink-mid": "bg-fuchsia-300",
  "pink-deep": "bg-fuchsia-400",
  "purple-mid": "bg-purple-300",
  "red-soft": "bg-rose-200",
  "red-mid": "bg-rose-300",
  "red-deep": "bg-rose-400",
  // Safety mapping for older entries.
  green: "bg-orange-300",
  blue: "bg-violet-300",
  orange: "bg-rose-300",
  amber: "bg-amber-300",
  pink: "bg-fuchsia-300",
  purple: "bg-purple-300",
  "green-soft": "bg-orange-200",
  "green-mid": "bg-orange-300",
  "green-deep": "bg-orange-400",
};

type HomeProject = {
  name: string;
  type: string;
  neighborhood: string;
  services: string[];
  status: "Ongoing" | "Upcoming" | "Completed";
  colorClass: string;
  url?: string;
  imageUrl?: string;
  desc?: string;
  quote?: string;
};

const FLAGSHIP_PARTNER_ORDER = [
  "NYC Small Business Services",
  "NYC Small Business Resource Network",
  "Queens Chamber of Commerce",
  "Brooklyn Chamber of Commerce",
  "Manhattan Chamber of Commerce",
] as const;

const FLAGSHIP_PARTNER_NAMES = new Set<string>(FLAGSHIP_PARTNER_ORDER);

function getPartnerLogoClass(partner: CommunityPartner, baseClass: string): string {
  if (partner.name === "NYC Small Business Services") {
    return `${baseClass} scale-[1.42]`;
  }
  return baseClass;
}

function getServiceTagClass(service: string): string {
  const key = service.trim().toLowerCase();
  if (key.includes("website") || key.includes("seo") || key.includes("google")) {
    return "bg-n-purple/20 text-n-ink border-n-purple/40";
  }
  if (key.includes("social")) {
    return "bg-n-orange/20 text-n-ink border-n-orange/40";
  }
  if (key.includes("finance") || key.includes("grant") || key.includes("payment")) {
    return "bg-n-yellow/40 text-n-ink border-n-yellow";
  }
  return "bg-n-border text-n-muted border-n-border";
}

async function getHomeProjects(): Promise<HomeProject[]> {
  const publicShowcase = await getPublicShowcaseCards();
  const featuredHomeCards = publicShowcase
    .filter((card) => card.featuredOnHome)
    .sort((a, b) => (a.homeSortIndex ?? Number.MAX_SAFE_INTEGER) - (b.homeSortIndex ?? Number.MAX_SAFE_INTEGER)
      || a.name.localeCompare(b.name));

  const homeProjects = featuredHomeCards.length > 0
    ? featuredHomeCards.map((card) => ({
      name: card.name,
      type: card.type,
      neighborhood: card.neighborhood,
      services: card.services,
      status: card.status,
      colorClass: SHOWCASE_COLOR_CLASS[card.color] ?? "bg-violet-300",
      url: card.url,
      imageUrl: card.imageUrl,
      desc: card.desc,
      quote: undefined as string | undefined,
    }))
    : (publicShowcase.length === 0
      ? fallbackCurrentProjects.slice(0, 6).map((project) => ({
      name: project.name,
      type: "Digital & Tech",
      neighborhood: project.neighborhood,
      services: project.services,
      status: "Ongoing" as const,
      colorClass: project.color,
      url: project.url,
      imageUrl: undefined as string | undefined,
      desc: project.desc,
      quote: project.quote,
      }))
      : []);

  return homeProjects;
}

function CurrentProjectsFallback() {
  return (
    <section className="home-depth-section home-showcase-depth py-20 bg-n-bg">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <AnimatedSection className="mb-10 flex items-end justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-display font-bold text-n-ink text-3xl md:text-4xl">Selected projects</h2>
          </div>
          <Link href="/showcase" className="font-body text-sm font-semibold text-n-purple hover:underline">
            See all work →
          </Link>
        </AnimatedSection>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading featured projects">
          {[0, 1, 2].map((item) => (
            <div key={item} className="overflow-hidden rounded-xl border border-n-border bg-white p-5">
              <div className="mb-5 h-32 animate-pulse rounded-lg bg-n-orange/10" />
              <div className="mb-3 h-3 w-20 animate-pulse rounded-full bg-n-border" />
              <div className="mb-2 h-5 w-3/4 animate-pulse rounded-full bg-n-border" />
              <div className="h-3 w-1/2 animate-pulse rounded-full bg-n-border" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HomeScrollProgress() {
  return (
    <div aria-hidden="true" className="home-scroll-rail">
      <span className="home-scroll-rail-label">NYC / IN MOTION</span>
      <span className="home-scroll-rail-track">
        <span className="home-scroll-rail-fill" />
      </span>
    </div>
  );
}

function HomeProjectDesktopCard({ project, index }: { project: HomeProject; index: number }) {
  const card = (
    <div className="home-project-card bg-n-bg border border-n-border rounded-2xl overflow-hidden project-card flex flex-col">
      <div className={`${project.colorClass} home-project-card-accent h-2`} />
      {project.imageUrl ? (
        <div className="home-project-card-media showcase-card-media mx-4 sm:mx-7 mt-7 rounded-xl border border-n-border bg-white overflow-hidden">
          <Image
            src={project.imageUrl}
            alt={`Preview of ${project.name}, a ${project.type.toLowerCase()} project in ${project.neighborhood}`}
            width={1600}
            height={1000}
            sizes="(min-width: 1280px) 370px, (min-width: 1024px) 29vw, 44vw"
            className="block w-full h-auto"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="home-project-card-media showcase-card-media mx-4 sm:mx-7 mt-7 rounded-xl border border-n-border bg-white h-40 flex items-center justify-center">
          <span className="font-body text-xs text-n-muted uppercase tracking-wider">Project photo coming soon</span>
        </div>
      )}
      <div className="home-project-card-content showcase-card-content p-7 flex flex-col">
        <div className="flex items-start justify-between mb-4">
          <div className="home-project-card-tags flex gap-2 flex-wrap">
            {project.services.map((service) => (
              <span key={`desktop-${project.name}-${service}`} className={`tag border ${getServiceTagClass(service)}`}>{service}</span>
            ))}
          </div>
          <span className={`home-project-card-tags tag text-xs flex-shrink-0 ${project.status === "Completed" ? "bg-n-orange/25 text-n-ink" : project.status === "Ongoing" ? "bg-n-purple/25 text-n-ink" : "bg-n-yellow/35 text-n-ink"}`}>
            {project.status}
          </span>
        </div>
        <h3 className="home-project-card-title font-display font-bold text-n-ink text-2xl mb-4">{project.name}</h3>
        {project.quote && (
          <blockquote className="border-l-2 border-n-orange pl-3 font-body text-sm text-n-muted italic leading-relaxed">
            &ldquo;{project.quote}&rdquo;
          </blockquote>
        )}
        <div className="flex items-center justify-between mt-4">
          <p className="font-body text-xs text-n-muted flex items-center gap-1.5">
            <MapPinIcon className="w-3.5 h-3.5 flex-shrink-0" /> {project.neighborhood}
          </p>
          {project.url && (
            <span className="font-body text-xs font-semibold text-n-purple">View live site →</span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className={`scroll-reveal scroll-reveal-card scroll-reveal-${index % 3}`}>
      {project.url ? (
        <a href={project.url} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${project.name} live site`} className="block">
          {card}
        </a>
      ) : card}
    </div>
  );
}

function HomeProjectStack({ projects }: { projects: HomeProject[] }) {
  return (
    <HomeProjectMasonry>
      {projects.map((project, index) => (
        <HomeProjectDesktopCard key={`${project.name}-${index}`} project={project} index={index} />
      ))}
    </HomeProjectMasonry>
  );
}

async function CurrentProjectsSection() {
  const homeProjects = await getHomeProjects();

  return (
    <section className="home-depth-section home-showcase-depth py-20 bg-n-bg">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <AnimatedSection className="mb-10 flex items-end justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-display font-bold text-n-ink text-3xl md:text-4xl">Selected projects</h2>
          </div>
          <Link href="/showcase" className="font-body text-sm font-semibold text-n-purple hover:underline">
            See all work →
          </Link>
        </AnimatedSection>
        {homeProjects.length > 0 ? (
          <>
            <HomeProjectMobileCarousel projects={homeProjects} />

            <HomeProjectStack projects={homeProjects} />
          </>
        ) : (
          <div className="border border-n-border rounded-xl bg-white px-6 py-8 text-center">
            <p className="font-display text-lg font-bold text-n-ink">New work is on the way.</p>
            <p className="mx-auto mt-2 max-w-md font-body text-sm leading-relaxed text-n-muted">Our teams are preparing the next set of project stories. Explore the full body of work while we update this selection.</p>
            <Link href="/showcase" className="mt-4 inline-flex font-body text-sm font-semibold text-n-purple hover:underline">Explore our work →</Link>
          </div>
        )}
      </div>
    </section>
  );
}

async function LiveHomeStats() {
  const { effectiveValues } = await getPublicStatSnapshot();
  const liveHomeStats = [
    { value: effectiveValues.homeStudentMembers, label: "Student Members" },
    { value: effectiveValues.homeBusinessesSupported, label: "Businesses Supported" },
    { value: effectiveValues.communityOrganizations, label: "Community Partners" },
    { value: effectiveValues.homeSchoolsRepresented, label: "Schools Represented" },
  ];

  return <HomeStats stats={liveHomeStats} />;
}

function FlagshipPartnerCard({
  partner,
  className = "",
  isDuplicate = false,
}: {
  partner: CommunityPartner;
  className?: string;
  isDuplicate?: boolean;
}) {
  return (
    <a
      href={partner.website}
      target="_blank"
      rel="noreferrer"
      aria-label={isDuplicate ? undefined : `Visit ${partner.name} website`}
      aria-hidden={isDuplicate || undefined}
      tabIndex={isDuplicate ? -1 : undefined}
      className={`bg-white border-2 border-n-orange/35 rounded-xl px-5 py-5 min-h-[164px] flex flex-col items-center justify-center text-center no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-n-orange/50 focus-visible:ring-offset-2 ${className}`}
    >
      <div className="relative w-full h-[78px] mb-4">
        <Image
          src={partner.logo}
          alt={isDuplicate ? "" : `${partner.name} logo`}
          fill
          sizes="(max-width: 640px) 45vw, 180px"
          className={getPartnerLogoClass(partner, "object-contain p-1")}
        />
      </div>
      <p className="font-body text-[9px] uppercase tracking-widest text-n-orange font-bold mb-1">
        Flagship partner
      </p>
      <h3 className="font-display font-bold text-n-ink text-sm leading-tight">
        {partner.name}
      </h3>
    </a>
  );
}

function PartnerLogoCard({
  partner,
  important,
  accent,
  tabIndex,
  isDuplicate = false,
}: {
  partner: CommunityPartner;
  important: boolean;
  accent: "purple" | "yellow";
  tabIndex?: number;
  isDuplicate?: boolean;
}) {
  const borderClass = accent === "purple" ? "border-n-purple/35" : "border-n-yellow/60";

  return (
    <a
      href={partner.website}
      target="_blank"
      rel="noreferrer"
      tabIndex={tabIndex}
      aria-hidden={isDuplicate || undefined}
      aria-label={`Visit ${partner.name} website`}
      className={`partner-logo-card partner-logo-card--${accent} shrink-0 bg-white border-2 flex flex-col items-center justify-between text-center no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-n-orange/50 focus-visible:ring-offset-2 ${
        important
          ? `w-[230px] h-[168px] rounded-xl ${borderClass} px-4 py-5`
          : `w-[230px] h-[168px] rounded-lg ${borderClass} px-4 py-5`
      }`}
    >
      <div className="relative w-full h-[72px] shrink-0">
        <Image
          src={partner.logo}
          alt={isDuplicate ? "" : `${partner.name} logo`}
          fill
          sizes="190px"
          className={getPartnerLogoClass(partner, "object-contain partner-logo-image p-1")}
        />
      </div>
      <div className="min-w-0 w-full">
        {important && (
          <p className="font-body text-[9px] uppercase tracking-widest text-n-orange font-bold mb-1">
            Key partner
          </p>
        )}
        <p className="font-display font-bold text-n-ink leading-tight text-xs partner-logo-label">
          {partner.name}
        </p>
      </div>
    </a>
  );
}

function PartnerMarquee({
  partners,
  important = false,
  reverse = false,
  accent,
}: {
  partners: CommunityPartner[];
  important?: boolean;
  reverse?: boolean;
  accent: "purple" | "yellow";
}) {
  return (
    <div className="partner-marquee -mx-5 overflow-hidden py-1 md:-mx-8">
      <div className={`partner-marquee-track flex gap-3 md:gap-4 ${reverse ? "partner-marquee-track-reverse" : ""}`}>
        {[0, 1].map((copy) => (
          <div key={copy} className="flex gap-3 md:gap-4" aria-hidden={copy === 1}>
            {partners.map((partner) => (
              <PartnerLogoCard
                key={`${copy}-${partner.name}`}
                partner={partner}
                important={important}
                accent={accent}
                tabIndex={copy === 1 ? -1 : undefined}
                isDuplicate={copy === 1}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Mobile-only. Five full-width cards stacked vertically pushed the scrolling
// partner rows most of a screen further down, so on narrow viewports the same
// cards ride a marquee instead. Runs rightward because the two rows beneath it
// run left then right, and a shared direction reads as one sliding mass.
function FlagshipPartnerMarquee({ partners }: { partners: CommunityPartner[] }) {
  return (
    <div className="partner-marquee -mx-5 overflow-hidden py-1 sm:hidden">
      <div className="partner-marquee-track partner-marquee-track-reverse partner-marquee-track-flagship flex gap-3">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex gap-3" aria-hidden={copy === 1}>
            {partners.map((partner) => (
              <FlagshipPartnerCard
                key={`${copy}-${partner.name}`}
                partner={partner}
                className="w-[240px] shrink-0"
                isDuplicate={copy === 1}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

async function CommunityPartnersSection() {
  const partners = await getPublicCommunityPartners();
  const partnerByName = new Map(partners.map((partner) => [partner.name, partner]));
  const flagshipPartners = FLAGSHIP_PARTNER_ORDER
    .map((name) => partnerByName.get(name))
    .filter((partner): partner is CommunityPartner => Boolean(partner));
  const scrollingPartners = partners.filter((partner) => !FLAGSHIP_PARTNER_NAMES.has(partner.name));
  const importantPartners = scrollingPartners.filter((partner) => partner.important);
  const neighborhoodPartners = scrollingPartners.filter((partner) => !partner.important);

  return (
    <section className="home-depth-section home-partners-depth py-16 md:py-20 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <div className="mb-8 md:mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-5">
          <div>
            <p className="font-body text-xs uppercase tracking-[0.22em] text-n-orange font-bold mb-3">
              Community partners
            </p>
            <h2 className="font-display font-bold text-n-ink text-3xl md:text-5xl max-w-3xl leading-tight">
              Working with the organizations trusted by NYC small businesses.
            </h2>
          </div>
          <p className="font-body text-n-muted text-sm md:text-base max-w-md leading-relaxed">
            Chambers, BIDs, local development corporations, and merchant groups connect Novus teams directly with the businesses that need support.
          </p>
        </div>
        <div>
          <div className="relative isolate">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-x-16 top-12 bottom-0 z-0 bg-[radial-gradient(ellipse_at_center,rgba(35,31,36,0.08)_0%,rgba(35,31,36,0.035)_40%,transparent_72%)] blur-2xl"
            />
            <div className="relative z-10 space-y-2 md:space-y-3">
              <FlagshipPartnerMarquee partners={flagshipPartners} />
              <div className="hidden gap-3 py-1 sm:grid sm:grid-cols-2 md:gap-4 lg:grid-cols-5">
                {flagshipPartners.map((partner, index) => (
                  <AnimatedSection
                    key={partner.name}
                    delay={index * 0.055}
                    duration={0.32}
                    // An odd count leaves the last card alone on the bottom row of
                    // the two-column band, hugging the left edge as if a sibling
                    // failed to load. Span both columns and centre it at exactly
                    // one column's width so it still matches the cards above.
                    className={
                      flagshipPartners.length % 2 === 1 && index === flagshipPartners.length - 1
                        ? "sm:col-span-2 sm:mx-auto sm:w-[calc(50%-0.375rem)] md:w-[calc(50%-0.5rem)] lg:col-span-1 lg:mx-0 lg:w-auto"
                        : undefined
                    }
                  >
                    <FlagshipPartnerCard partner={partner} />
                  </AnimatedSection>
                ))}
              </div>
              <AnimatedSection delay={0.3} duration={0.32}>
                <PartnerMarquee partners={importantPartners} important accent="purple" />
              </AnimatedSection>
              <AnimatedSection delay={0.37} duration={0.32}>
                <PartnerMarquee partners={neighborhoodPartners} reverse accent="yellow" />
              </AnimatedSection>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function Home() {

  return (
    <div className="home-scroll-story">
      <div aria-hidden="true" className="home-scroll-backdrop" />
      <HomeScrollProgress />
      <HeroSection>
        <section aria-label="Novus impact at a glance" data-home-dark-end="true" className="relative pb-6 pt-10 sm:pb-8 sm:pt-12 z-20">
          <LiveHomeStats />
        </section>
      </HeroSection>

      <HomeScrollBridge
        index={0}
        eyebrow="THE RIGHT CONNECTIONS"
        title="A citywide network of local partnerships."
        detail="Novus works with neighborhood organizations that know the businesses they serve and help us connect with owners who could use support."
        imageSrc="/brooklyn-bridge.jpg"
      />

      <Suspense fallback={<div className="h-72 bg-white" />}>
        <CommunityPartnersSection />
      </Suspense>

      <HomeScrollBridge
        index={1}
        eyebrow="SUPPORT WITH A PURPOSE"
        title="One small business stronger. One city moving forward."
        detail="We turn a business owner’s priorities into websites, marketing, and other practical work they can use."
        imageSrc="/soho-streetscape.webp"
      />

      <Suspense fallback={<CurrentProjectsFallback />}>
        <CurrentProjectsSection />
      </Suspense>

      <HomeScrollBridge
        index={2}
        eyebrow="FIND YOUR PLACE"
        title="Three ways to work with local businesses."
        detail="Choose Digital & Tech, Marketing, or Finance & Operations and help deliver work that businesses can use."
        imageSrc="/student-collaboration-wide.webp"
      />

      {/* ── THREE TRACKS ─────────────────────────────────────── */}
      <section className="home-depth-section home-tracks-depth py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 md:px-8">
          <AnimatedSection className="mb-8">
            <h2 className="font-display font-bold text-n-ink text-3xl md:text-4xl">The three tracks</h2>
            <p className="font-body text-n-muted mt-3 max-w-xl">
              Every project is staffed by students across our three tracks. Work ships to production quickly and includes ongoing support after delivery.
            </p>
          </AnimatedSection>
          <AnimatedSection>
            <TracksTabbed />
          </AnimatedSection>
        </div>
      </section>

      <HomeNetworkSection />

    </div>
  );
}
