import type { Metadata } from "next";
import Link from "next/link";
import AnimatedSection from "@/components/AnimatedSection";
import ContactForm from "@/components/ContactForm";
import { partnerServices } from "@/data";
import { VOLTA_STATS, formatStat } from "@/data/stats";

export const metadata: Metadata = {
  title: "Free Help for NYC Small Businesses | Volta NYC",
  description:
    "NYC small businesses: get a free website, social media strategy, grant writing, or SEO from a dedicated student team. No cost, no catch. Volta NYC is a registered 501(c)(3) nonprofit.",
  openGraph: {
    title: "Free Help for NYC Small Businesses | Volta NYC",
    description:
      "Student teams build websites, grow social media, write grants, and optimize SEO for NYC small businesses — at no cost. Reach out to get started.",
  },
};

export default function Partners() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How can I get free website help for my NYC small business?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Volta NYC pairs NYC small businesses with student consulting teams at no cost. Fill out the interest form on this page and a team lead will follow up within a few days to discuss your project.",
        },
      },
      {
        "@type": "Question",
        name: "Is Volta NYC's consulting really free?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes, completely free. Volta NYC is a registered 501(c)(3) nonprofit. There is no cost, no hidden fees, and no catch.",
        },
      },
      {
        "@type": "Question",
        name: "What services does Volta NYC provide for small businesses?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Volta NYC student teams offer website design and development, social media strategy and content creation, grant research and writing, and SEO and Google Maps optimization — all at no cost to the business.",
        },
      },
      {
        "@type": "Question",
        name: "Which NYC neighborhoods does Volta NYC serve?",
        acceptedAnswer: {
          "@type": "Answer",
          text: `Volta NYC currently serves small businesses across ${formatStat(VOLTA_STATS.nycNeighborhoods)} NYC neighborhoods, with active projects in areas including Brooklyn, Queens, Manhattan, and the Bronx.`,
        },
      },
      {
        "@type": "Question",
        name: "How does the student consulting process work?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "After you reach out, Volta NYC matches your business with a student team based on your needs. The team works with you to scope a project, then delivers the work — a website, social media strategy, grant application, or SEO improvements — over several weeks.",
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="bg-v-dark pt-32 pb-24 relative overflow-hidden">
        <div className="absolute inset-0 dot-grid opacity-[0.06]" />
        <div className="relative max-w-7xl mx-auto px-5 md:px-8">
          <AnimatedSection>
            <p className="font-body text-sm font-semibold text-v-green uppercase tracking-widest mb-4">
              For Businesses & BIDs
            </p>
            <h1
              className="font-display font-bold text-white leading-none tracking-tight mb-6"
              style={{ fontSize: "clamp(2.5rem, 7vw, 5rem)" }}
            >
              A dedicated team<br />
              <span className="text-v-green">for your business.</span>
            </h1>
            <p className="font-body text-white/70 text-lg max-w-2xl leading-relaxed mb-8">
              Volta places student teams on real projects for NYC small businesses —
              websites, social media, grant writing, SEO, and more.
              Professional-grade work, no cost to you.
            </p>
            <div className="flex gap-4 flex-wrap">
              <a
                href="#contact"
                className="bg-v-green text-v-ink font-display font-bold text-base px-8 py-4 rounded-full hover:bg-v-green-dark transition-colors"
              >
                Work with us →
              </a>
              <Link
                href="/showcase"
                className="border border-white/20 text-white font-display font-bold text-base px-8 py-4 rounded-full hover:border-white/50 transition-colors"
              >
                See our work
              </Link>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── SERVICES ─────────────────────────────────────────── */}
      <section className="py-14 bg-v-bg border-b border-v-border">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <AnimatedSection className="mb-8">
            <p className="font-body text-sm font-semibold text-v-blue uppercase tracking-widest mb-3">
              What we deliver
            </p>
            <h2 className="font-display font-bold text-v-ink text-3xl md:text-4xl">
              Six service areas.
            </h2>
          </AnimatedSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {partnerServices.map((s, i) => (
              <AnimatedSection key={s.title} delay={i * 0.07}>
                <div className="bg-white border border-v-border rounded-2xl p-5 project-card h-full">
                  <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
                    <s.icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                  <h3 className="font-display font-bold text-v-ink text-base mb-1.5">{s.title}</h3>
                  <p className="font-body text-xs text-v-muted leading-relaxed">{s.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTACT FORM ─────────────────────────────────────── */}
      <section className="py-16 bg-v-bg" id="contact">
        <div className="max-w-3xl mx-auto px-5 md:px-8">
          <AnimatedSection className="mb-10">
            <p className="font-body text-sm font-semibold text-v-green uppercase tracking-widest mb-3">
              Request support
            </p>
            <h2 className="font-display font-bold text-v-ink text-3xl md:text-4xl mb-4">
              Work with us
            </h2>
            <p className="font-body text-v-muted max-w-xl">
              Tell us about your business and what you need. Switch the form to your
              preferred language using the toggle below. If you were referred by a BID,
              mention that in your message. We&apos;re also open to a quick Zoom chat.
            </p>
          </AnimatedSection>
          <AnimatedSection>
            <ContactForm />
          </AnimatedSection>
        </div>
      </section>

      {/* ── GUIDES / NEWSLETTER ─────────────────────────────── */}
      <section className="py-12 bg-white border-b border-v-border">
        <div className="max-w-5xl mx-auto px-5 md:px-8">
          <AnimatedSection className="bg-v-bg border border-v-border rounded-2xl p-6 md:p-8">
            <p className="font-body text-sm font-semibold text-v-blue uppercase tracking-widest mb-2">
              Practical resources
            </p>
            <h2 className="font-display font-bold text-v-ink text-2xl md:text-3xl mb-3">
              See what we recommend for owners.
            </h2>
            <p className="font-body text-v-muted leading-relaxed mb-5 max-w-3xl">
              Beyond project work, we publish business guides with practical advice on websites, marketing, and operations.
              If you want to share your experience or be featured in future newsletters/guides, tell us in the form above or email us directly.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/guides"
                className="inline-block bg-v-ink text-white font-display font-bold text-sm px-6 py-3 rounded-full hover:bg-v-ink/85 transition-colors"
              >
                Read Business Guides →
              </Link>
              <a
                href="mailto:info@voltanyc.org"
                className="inline-block border border-v-border text-v-ink font-display font-bold text-sm px-6 py-3 rounded-full hover:border-v-ink transition-colors"
              >
                Talk to us →
              </a>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── BID SECTION ──────────────────────────────────────── */}
      <section className="py-20 bg-white border-t border-v-border">
        <div className="max-w-5xl mx-auto px-5 md:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <AnimatedSection direction="left">
              <p className="font-body text-sm font-semibold text-v-green uppercase tracking-widest mb-4">
                For BIDs & district organizations
              </p>
              <h2 className="font-display font-bold text-v-ink text-3xl md:text-4xl mb-5">
                We coordinate<br />through your district.
              </h2>
              <p className="font-body text-v-muted leading-relaxed mb-6">
                We partner with Business Improvement Districts to coordinate
                neighborhood-level operations — identifying businesses that need
                support, making introductions, and ensuring follow-through on every
                project. We&apos;re also open to a quick Zoom chat to discuss fit.
              </p>
              <a
                href="mailto:info@voltanyc.org"
                className="inline-block bg-v-ink text-white font-display font-bold text-sm px-7 py-3 rounded-full hover:bg-v-ink/80 transition-colors"
              >
                Contact us directly
              </a>
            </AnimatedSection>
            <AnimatedSection direction="right">
              <div className="bg-v-bg border border-v-border rounded-2xl p-8">
                <p className="font-body text-xs font-semibold text-v-muted uppercase tracking-widest mb-4">
                  Currently active
                </p>
                <p className="font-display font-bold text-v-ink text-6xl leading-none mb-1">{formatStat(VOLTA_STATS.bidPartners)}</p>
                <p className="font-body text-v-muted mb-6">BID partnerships across NYC</p>
                <div className="pt-6 border-t border-v-border">
                  <p className="font-body text-sm text-v-muted">
                    Active across {formatStat(VOLTA_STATS.nycNeighborhoods)} neighborhoods in Brooklyn, Queens, Manhattan, the Bronx, and Staten Island.
                  </p>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>
    </>
  );
}
