"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import AnimatedSection from "@/components/AnimatedSection";
import { chapterConnections, chapterLocations } from "@/data/network";

const NetworkFluidBackground = dynamic(() => import("@/components/NetworkFluidBackground"), {
  ssr: false,
});

const NetworkGlobe = dynamic(() => import("@/components/NetworkGlobe"), {
  ssr: false,
  loading: () => <div className="h-[360px] sm:h-[460px] lg:h-[560px]" aria-hidden="true" />,
});

export default function HomeNetworkSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [shouldLoadVisuals, setShouldLoadVisuals] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || !("IntersectionObserver" in window)) {
      setShouldLoadVisuals(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShouldLoadVisuals(true);
        observer.disconnect();
      },
      { rootMargin: "1200px 0px" },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // The globe carries international members too; this column does not, because
  // the sentence above it says "across the country".
  const listedLocations = chapterLocations.filter((location) => location.type !== "international");

  return (
    <section ref={sectionRef} className="home-network-section relative overflow-hidden py-16 sm:py-20 md:py-24">
      {shouldLoadVisuals && <NetworkFluidBackground />}
      <div className="mx-auto grid max-w-7xl items-center gap-6 px-4 sm:gap-8 sm:px-5 md:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
        <AnimatedSection>
          <p className="font-body text-xs font-bold uppercase tracking-[0.22em] text-white">Our network</p>
          <h2 className="mt-4 font-display text-4xl font-bold leading-tight text-white md:text-5xl">
            From New York City to new communities.
          </h2>
          <p className="mt-5 max-w-xl font-body text-base leading-relaxed text-white/85 md:text-lg">
            Novus began in New York City and is growing through student-led teams in communities across the country, and a few beyond it.
          </p>

          <div className="mt-8 border-y border-white/10 py-4" aria-label="Novus chapter locations">
            <p className="font-body text-xs font-bold uppercase tracking-[0.18em] text-white/75">
              {listedLocations.length} locations
            </p>
            <p className="mt-2 font-body text-sm leading-6 text-white/90">
              {listedLocations.map((location, index) => (
                <span key={location.name}>
                  {index > 0 && <span aria-hidden="true"> · </span>}
                  <span className={location.type === "hub" ? "font-semibold text-white" : "text-white/85"}>
                    {location.name}
                  </span>
                  {location.subtitle && <span className="ml-1 text-xs text-white/75">{location.subtitle}</span>}
                </span>
              ))}
            </p>
            <ul className="sr-only">
              {listedLocations.map((location) => (
                <li key={location.name}>
                  {location.name}, {location.state}{location.subtitle ? `, ${location.subtitle}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.08} direction="right" className="network-globe-frame">
          {shouldLoadVisuals ? (
            <NetworkGlobe locations={chapterLocations} connections={chapterConnections} />
          ) : (
            <div className="h-[360px] sm:h-[460px] lg:h-[560px]" aria-hidden="true" />
          )}
        </AnimatedSection>
      </div>
    </section>
  );
}
