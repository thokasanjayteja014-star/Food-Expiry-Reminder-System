"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import type { UsageStats as Stats } from "@/lib/stats";

/** Simple tracking summary. Figures come only from the user's own records. */
export function UsageStats({ stats }: { stats: Stats }) {
  const rate = stats.beforeExpiryRate;
  // Start the bar at 0 so it fills in once on load.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setShown(rate ?? 0), 150);
    return () => clearTimeout(t);
  }, [rate]);
  return (
    <section aria-labelledby="stats-title" className="card animate-in p-4 sm:p-5" style={{ ["--i" as string]: 9 }}>
      <h2 id="stats-title" className="flex items-center gap-2 section-title">
        <BarChart3 aria-hidden className="size-4 text-brand-600" />
        Food tracking summary
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Stat label="Total added" value={stats.totalAdded} />
        <Stat label="Currently tracked" value={stats.currentlyTracked} />
        <Stat label="Consumed before expiry" value={stats.consumedBeforeExpiry} />
        <Stat label="Expired" value={stats.expired} />
      </dl>
      <div className="mt-4 border-t border-[var(--border)] pt-4">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Before-expiry usage</span>
          <span className="text-base font-semibold tabular-nums">{rate === null ? "–" : `${rate}%`}</span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]"
          role="progressbar"
          aria-label="Before-expiry usage"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={rate ?? 0}
        >
          <div className="h-full rounded-full bg-brand-500 transition-[width] duration-1000 ease-out" style={{ width: `${shown}%` }} />
        </div>
        <p className="mt-2 text-xs muted">
          {rate === null
            ? "Mark products as consumed to see how much you use before it expires."
            : "Share of finished products (consumed, discarded or expired) that you consumed before the expiry date. Based only on what you recorded."}
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
