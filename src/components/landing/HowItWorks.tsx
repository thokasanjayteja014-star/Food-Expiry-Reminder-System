"use client";

import { useState, type KeyboardEvent } from "react";
import { Bell, CalendarCheck, Camera, ListChecks, type LucideIcon } from "lucide-react";

const STEPS: Array<{ Icon: LucideIcon; title: string; text: string; detail: string[] }> = [
  {
    Icon: Camera,
    title: "Scan",
    text: "Point your phone at the date on the pack, or at its barcode.",
    detail: ["Works with the camera you already have", "Upload a photo if the camera is busy", "No app store, no extra device"],
  },
  {
    Icon: CalendarCheck,
    title: "Confirm",
    text: "Check the date we read and fix it in a tap if it is wrong.",
    detail: ["Nothing is saved until you say so", "Unclear dates like 05/06 are asked, not guessed", "\"Best before 6 months\" is worked out for you"],
  },
  {
    Icon: ListChecks,
    title: "Track",
    text: "Everything you bought, sorted by what to use first.",
    detail: ["Search and filter in seconds", "Swipe to mark eaten or thrown away", "See how much you used in time"],
  },
  {
    Icon: Bell,
    title: "Get reminded",
    text: "A notification arrives before food goes off, on every device you use.",
    detail: ["Choose 1, 3, 5 or 7 days before", "Phone, laptop and email", "Reminders for the whole family"],
  },
];

/** Four steps as tabs: pick one to see what happens in it. */
export function HowItWorks() {
  const [active, setActive] = useState(0);
  const step = STEPS[active]!;

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") setActive((a) => (a + 1) % STEPS.length);
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") setActive((a) => (a + STEPS.length - 1) % STEPS.length);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      <ol role="tablist" aria-label="Steps" aria-orientation="vertical" className="grid grid-cols-4 gap-2 lg:grid-cols-1" onKeyDown={onKey}>
        {STEPS.map(({ Icon, title, text }, i) => {
          const on = i === active;
          return (
            <li key={title} role="presentation">
              <button
                type="button"
                role="tab"
                id={`step-tab-${i}`}
                aria-selected={on}
                aria-controls="step-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => setActive(i)}
                className={`group flex h-full w-full flex-col items-center gap-2 rounded-xl border p-3 text-center lg:flex-row lg:items-start lg:gap-4 lg:p-4 lg:text-left transition-[background-color,border-color,box-shadow] duration-200 ${
                  on
                    ? "border-brand-500/60 bg-[var(--surface)] shadow-[0_8px_24px_-12px_rgba(36,87,197,0.45)]"
                    : "border-transparent hover:border-[var(--border)] hover:bg-[var(--surface)]"
                }`}
              >
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 ${
                    on ? "bg-brand-600 text-white" : "bg-[var(--surface-2)] muted group-hover:text-[var(--text)]"
                  }`}
                >
                  <Icon aria-hidden className="size-5" />
                </span>
                <span>
                  <span className="hidden text-xs font-medium muted lg:block">Step {i + 1}</span>
                  <span className="block text-xs font-semibold sm:text-sm lg:text-base">{title}</span>
                  <span className="mt-0.5 hidden text-sm muted lg:block">{text}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div id="step-panel" role="tabpanel" aria-labelledby={`step-tab-${active}`} className="card relative overflow-hidden p-6 sm:p-8">
        <div key={active} className="animate-in">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
            <step.Icon aria-hidden className="size-7" />
          </span>
          <p className="mt-5 text-xs font-medium uppercase tracking-wider text-brand-700 dark:text-brand-300">Step {active + 1} of {STEPS.length}</p>
          {/* On large screens the tab already shows the title and summary, so the panel only adds the details. */}
          <h3 className="mt-1 text-xl font-semibold tracking-tight lg:hidden">{step.title}</h3>
          <p className="mt-1 muted lg:hidden">{step.text}</p>
          <p className="mt-1 hidden text-xl font-semibold tracking-tight lg:block">What you get</p>
          <ul className="mt-6 space-y-3">
            {step.detail.map((d, i) => (
              <li key={d} className="animate-in flex items-center gap-3 text-sm" style={{ ["--i" as string]: i + 1 }}>
                <span className="size-1.5 shrink-0 rounded-full bg-brand-500" />
                {d}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-8 flex gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s.title} className={`h-1 rounded-full transition-all duration-300 ${i === active ? "w-8 bg-brand-500" : "w-3 bg-[var(--border)]"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
