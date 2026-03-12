import type { Metadata } from "next";
import Link from "next/link";
import AnimatedSection from "@/components/AnimatedSection";
import { progressUpdates } from "@/data/publishing";

export const metadata: Metadata = {
  title: "Progress Updates | Volta NYC",
  description:
    "Timestamped Volta progress updates covering projects, systems, and team growth.",
};

function prettyDate(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function toLinkedInEmbedUrl(entry: { linkedinUrl?: string; linkedinUrn?: string }): string | null {
  if (entry.linkedinUrl && entry.linkedinUrl.includes("/feed/update/")) {
    return entry.linkedinUrl.replace("://www.linkedin.com/feed/update/", "://www.linkedin.com/embed/feed/update/");
  }
  if (entry.linkedinUrn) {
    return `https://www.linkedin.com/embed/feed/update/${entry.linkedinUrn}`;
  }
  return null;
}

export default function ProgressUpdatesPage() {
  return (
    <>
      <section className="bg-v-bg pt-32 pb-16 border-b border-v-border">
        <div className="max-w-5xl mx-auto px-5 md:px-8">
          <AnimatedSection>
            <p className="font-body text-sm font-semibold text-v-blue uppercase tracking-widest mb-3">
              Progress Updates
            </p>
            <h1 className="font-display font-bold text-v-ink text-4xl md:text-5xl leading-tight mb-5">
              A timestamped record of what we ship.
            </h1>
            <p className="font-body text-v-muted text-lg max-w-3xl">
              This page documents our execution over time: systems, projects, and team
              operations. It is meant to be useful as public accountability and as context
              for future applicants.
            </p>
          </AnimatedSection>
        </div>
      </section>

      <section className="py-14 bg-white">
        <div className="max-w-5xl mx-auto px-5 md:px-8">
          <div className="space-y-6">
            {progressUpdates.map((entry, idx) => {
              const embedUrl = toLinkedInEmbedUrl(entry);
              return (
                <AnimatedSection key={entry.id} delay={idx * 0.06}>
                  <article className="bg-v-bg border border-v-border rounded-2xl p-6 md:p-7">
                    <p className="font-body text-xs text-v-muted mb-2">{prettyDate(entry.date)}</p>
                    <h2 className="font-display font-bold text-v-ink text-2xl mb-3">{entry.title}</h2>
                    <p className="font-body text-v-muted mb-4">{entry.summary}</p>
                    <ul className="space-y-1.5">
                      {entry.highlights.map((item) => (
                        <li key={item} className="font-body text-sm text-v-ink flex items-start gap-2">
                          <span className="text-v-green mt-0.5">•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                    {embedUrl && (
                      <div className="mt-4">
                        <iframe
                          src={embedUrl}
                          title={`${entry.title} LinkedIn post`}
                          className="w-full rounded-xl border border-v-border bg-white"
                          style={{ minHeight: 520 }}
                          loading="lazy"
                        />
                      </div>
                    )}
                    {entry.links && entry.links.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {entry.links.map((link) => (
                          <a
                            key={link.href}
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-body px-3 py-1.5 rounded-full border border-v-border text-v-muted hover:text-v-ink hover:border-v-ink transition-colors"
                          >
                            {link.label}
                          </a>
                        ))}
                      </div>
                    )}
                  </article>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-14 bg-v-dark">
        <div className="max-w-5xl mx-auto px-5 md:px-8">
          <AnimatedSection className="bg-white/5 border border-white/10 rounded-2xl p-7 md:p-8">
            <h3 className="font-display font-bold text-white text-2xl mb-3">Need practical owner guidance?</h3>
            <p className="font-body text-white/70 mb-5">
              We publish focused guides for business owners on cost, prioritization, and digital execution decisions.
            </p>
            <Link
              href="/guides"
              className="inline-block bg-v-green text-v-ink font-display font-bold px-6 py-3 rounded-full hover:bg-v-green-dark transition-colors"
            >
              View Business Guides →
            </Link>
          </AnimatedSection>
        </div>
      </section>
    </>
  );
}
