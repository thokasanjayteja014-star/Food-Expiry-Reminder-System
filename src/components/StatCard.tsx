import Link from "next/link";
import type { LucideIcon } from "lucide-react";

const TONE = {
  neutral: { tile: "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200", bar: "bg-brand-500" },
  safe: { tile: "bg-safe-bg text-safe-fg", bar: "bg-green-500" },
  soon: { tile: "bg-soon-bg text-soon-fg", bar: "bg-amber-500" },
  expired: { tile: "bg-today-bg text-today-fg", bar: "bg-red-500" },
} as const;

/** Dashboard summary card: icon, count and label, with a thin bar showing its share of the total. */
export function StatCard({
  label,
  value,
  tone,
  Icon,
  share,
  href,
  index = 0,
}: {
  label: string;
  value: number;
  tone: keyof typeof TONE;
  Icon: LucideIcon;
  /** 0..1 share of all products, drawn as a small bar. */
  share?: number;
  href: string;
  index?: number;
}) {
  const t = TONE[tone];
  return (
    <Link href={href} className="card card-hover animate-in group block p-4" style={{ ["--i" as string]: index }}>
      <span className="flex items-start justify-between gap-2">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
        <span className={`flex size-8 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110 ${t.tile}`}>
          <Icon aria-hidden className="size-4" />
        </span>
      </span>
      <span className="mt-1 block text-xs font-medium muted">{label}</span>
      {share !== undefined && (
        <span aria-hidden className="mt-3 block h-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
          <span className={`block h-full rounded-full ${t.bar} transition-[width] duration-700 ease-out`} style={{ width: `${Math.round(share * 100)}%` }} />
        </span>
      )}
    </Link>
  );
}
