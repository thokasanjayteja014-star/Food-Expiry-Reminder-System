"use client";

import { useEffect, useState } from "react";
import { Bell, Check, ScanLine } from "lucide-react";

const ITEMS = [
  { name: "Paneer", meta: "Dairy · Fridge", days: "Expires today", dot: "bg-red-500", text: "text-red-600 dark:text-red-300" },
  { name: "Bread", meta: "Bakery · Shelf", days: "Expires tomorrow", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
  { name: "Biscuits", meta: "Snacks · Cupboard", days: "39 days left", dot: "bg-green-500", text: "muted" },
];

/**
 * A looping, decorative picture of the app: a pack is scanned, its date is read,
 * the milk joins the list and a reminder pops up.
 */
export function HeroDemo() {
  const [phase, setPhase] = useState(0); // 0 scanning, 1 date read, 2 added, 3 reminder
  useEffect(() => {
    // With reduced motion the picture stays still.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const durations = [2200, 1400, 1600, 2600];
    let p = 0;
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      t = setTimeout(() => {
        p = (p + 1) % 4;
        setPhase(p);
        next();
      }, durations[p]);
    };
    next();
    return () => clearTimeout(t);
  }, []);

  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[22rem] select-none">
      <div className="absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(18,183,106,0.22),transparent)] blur-2xl" />
      <div className="rounded-[2.2rem] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[0_30px_60px_-30px_rgba(16,24,40,0.45)]">
        <div className="overflow-hidden rounded-[1.6rem] bg-[var(--bg)]">
          {/* Camera view */}
          <div className="relative h-44 overflow-hidden bg-stone-900">
            <div className="absolute inset-x-8 top-6 bottom-6 rounded-xl bg-gradient-to-br from-sky-100 to-sky-200 p-3 text-stone-700 shadow-inner">
              <p className="text-[11px] font-bold tracking-wide">FRESH MILK · 500 ml</p>
              <p className="mt-6 font-mono text-[11px]">MFG 01/11/2026</p>
              <p className={`mt-1 inline-block rounded font-mono text-[12px] font-bold transition-colors duration-500 ${phase >= 1 ? "bg-brand-200 text-brand-900" : ""}`}>
                EXP 05/11/2026
              </p>
            </div>
            <div className="absolute inset-x-6 top-4 bottom-4 rounded-2xl border-2 border-white/80" />
            {phase === 0 && <span className="animate-scan absolute inset-x-8 h-0.5 rounded bg-brand-200 shadow-[0_0_12px_2px_rgba(166,244,197,0.9)]" />}
            <span
              className={`absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium text-white transition-colors duration-300 ${
                phase >= 1 ? "bg-brand-600" : "bg-black/60"
              }`}
            >
              {phase >= 1 ? <Check className="size-3.5" /> : <ScanLine className="size-3.5" />}
              {phase >= 1 ? "Expiry found: 5 Nov" : "Reading the date..."}
            </span>
          </div>
          {/* List */}
          <div className="space-y-2 p-3">
            <p className="px-1 text-xs font-semibold">Use these first</p>
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-500 ease-out ${phase >= 2 ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
              >
                <div className="overflow-hidden">
                  <Row name="Milk" meta="Dairy · Fridge" days="2 days left" dot="bg-amber-500" text="text-amber-700 dark:text-amber-300" highlight />
                </div>
              </div>
              {ITEMS.map((i) => (
                <Row key={i.name} {...i} />
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Notification */}
      <div
        className={`absolute -right-3 top-24 w-60 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl transition-[opacity,transform] duration-500 sm:-right-12 ${
          phase === 3 ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
        }`}
      >
        <div className="flex items-start gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Bell className="size-4" />
          </span>
          <div className="text-xs">
            <p className="font-semibold">Food Expiry Reminder</p>
            <p className="muted">Milk expires in 2 days. Use it soon.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ name, meta, days, dot, text, highlight = false }: { name: string; meta: string; days: string; dot: string; text: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 border-b border-[var(--border)] px-3 py-2 last:border-0 ${highlight ? "bg-brand-50/60 dark:bg-brand-900/20" : ""}`}>
      <span className={`size-1.5 rounded-full ${dot}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-tight">{name}</p>
        <p className="text-[11px] muted">{meta}</p>
      </div>
      <span className={`text-[11px] font-medium ${text}`}>{days}</span>
    </div>
  );
}
