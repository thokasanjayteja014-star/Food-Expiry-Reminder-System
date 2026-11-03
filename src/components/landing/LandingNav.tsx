"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/Logo";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#try", label: "Try it" },
  { href: "#features", label: "Features" },
  { href: "#faq", label: "FAQ" },
];

/** Landing header: transparent at the top, a frosted bar once you scroll. */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className={`sticky top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-300 ${
        scrolled ? "border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <LogoMark className="size-8" />
          <span className="hidden sm:inline">Food Expiry Reminder</span>
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium muted transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
              {l.label}
            </a>
          ))}
        </nav>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link href="/login" className="btn-ghost">
            Login
          </Link>
          <Link href="/register" className="btn-primary">
            Get Started
          </Link>
        </nav>
      </div>
    </header>
  );
}
