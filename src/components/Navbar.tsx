"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

const links = [
  { href: "/showcase", label: "Our Work" },
  { href: "/about", label: "About" },
  { href: "/partners", label: "For Businesses" },
  { href: "/join", label: "For Students" },
];

const moreLinks = [
  { href: "/guides", label: "Guides" },
  { href: "/updates", label: "Updates" },
  { href: "/members/login", label: "Member Login" },
];

/** Pages whose hero sections have a dark background — the navbar should use white text when unscrolled. */
const darkHeroPages = ["/partners", "/showcase", "/join"];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  const darkHero = !scrolled && !open && darkHeroPages.includes(pathname);
  const moreActive = moreLinks.some((l) => pathname === l.href) || pathname.startsWith("/members");

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled || open
            ? "bg-v-bg/95 backdrop-blur-md shadow-sm border-b border-v-border"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <Image
              src="/logo.png"
              alt="Volta"
              width={32}
              height={32}
              className="object-contain"
            />
            <span className={`font-display font-bold text-xl tracking-tight transition-colors ${darkHero ? "text-white" : "text-v-ink"}`}>
              VOLTA NYC
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`font-body text-sm font-semibold transition-colors ${
                  pathname === l.href
                    ? "text-v-green"
                    : darkHero
                    ? "text-white/70 hover:text-white"
                    : "text-v-muted hover:text-v-ink"
                }`}
              >
                {l.label}
              </Link>
            ))}

            {/* More dropdown */}
            <div
              className="relative"
              onMouseEnter={() => setMoreOpen(true)}
              onMouseLeave={() => setMoreOpen(false)}
            >
              <button
                className={`font-body text-sm font-semibold transition-colors flex items-center gap-1 ${
                  moreActive
                    ? "text-v-green"
                    : darkHero
                    ? "text-white/70 hover:text-white"
                    : "text-v-muted hover:text-v-ink"
                }`}
              >
                More
                <svg
                  className={`w-3 h-3 transition-transform duration-200 ${moreOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <AnimatePresence>
                {moreOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full right-0 pt-3 min-w-[160px]"
                  >
                    <div className="bg-white border border-v-border rounded-xl shadow-lg py-1.5 overflow-hidden">
                      {moreLinks.map((l) => (
                        <Link
                          key={l.href}
                          href={l.href}
                          className={`block px-4 py-2.5 font-body text-sm transition-colors hover:bg-v-bg ${
                            pathname === l.href ? "text-v-green font-semibold" : "text-v-ink"
                          }`}
                        >
                          {l.label}
                        </Link>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Link
              href="/apply"
              className="bg-v-green text-v-ink font-display font-bold text-sm px-5 py-2.5 rounded-full hover:bg-v-green-dark transition-colors"
            >
              Apply Now
            </Link>
          </nav>

          <button
            onClick={() => setOpen(!open)}
            className="md:hidden flex flex-col gap-1.5 p-2"
            aria-label="Menu"
          >
            <span className={`block h-0.5 w-5 transition-all duration-300 ${darkHero ? "bg-white" : "bg-v-ink"} ${open ? "rotate-45 translate-y-2" : ""}`} />
            <span className={`block h-0.5 w-5 transition-all duration-300 ${darkHero ? "bg-white" : "bg-v-ink"} ${open ? "opacity-0" : ""}`} />
            <span className={`block h-0.5 w-5 transition-all duration-300 ${darkHero ? "bg-white" : "bg-v-ink"} ${open ? "-rotate-45 -translate-y-2" : ""}`} />
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 top-16 z-40 bg-v-bg flex flex-col px-6 pt-8 gap-6 md:hidden overflow-y-auto"
          >
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="font-display font-bold text-2xl text-v-ink border-b border-v-border pb-4"
              >
                {l.label}
              </Link>
            ))}

            {/* More section in mobile */}
            <div className="border-b border-v-border pb-4">
              <p className="font-display font-bold text-2xl text-v-ink mb-3">More</p>
              <div className="flex flex-col gap-2 pl-2">
                {moreLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="font-body text-base text-v-muted hover:text-v-ink transition-colors"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>

            <Link
              href="/apply"
              className="bg-v-green text-v-ink font-display font-bold text-lg px-6 py-4 rounded-xl text-center mt-2"
            >
              Apply Now
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
