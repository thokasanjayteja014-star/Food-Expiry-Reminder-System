import type { DisplayStatus } from "@/types/product";
import { STATUS_LABELS } from "@/lib/expiry";

const STYLES: Record<DisplayStatus, { cls: string; dot: string }> = {
  SAFE: { cls: "bg-safe-bg text-safe-fg", dot: "bg-green-500" },
  EXPIRING_SOON: { cls: "bg-soon-bg text-soon-fg", dot: "bg-amber-500" },
  EXPIRING_TODAY: { cls: "bg-today-bg text-today-fg", dot: "bg-red-500" },
  EXPIRED: { cls: "bg-today-bg text-today-fg", dot: "bg-red-700 dark:bg-red-400" },
  CONSUMED: { cls: "bg-done-bg text-done-fg", dot: "bg-indigo-500" },
  DISCARDED: { cls: "bg-expired-bg text-[var(--muted)]", dot: "bg-stone-400" },
};

/** Colour dot plus text, so status never relies on colour alone. */
export function StatusBadge({ status, className = "" }: { status: DisplayStatus; className?: string }) {
  const { cls, dot } = STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${cls} ${className}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Small status dot for compact rows. */
export const STATUS_DOT: Record<DisplayStatus, string> = Object.fromEntries(
  Object.entries(STYLES).map(([k, v]) => [k, v.dot]),
) as Record<DisplayStatus, string>;

/** Text colour for the "days left" line, matching the status. */
export const STATUS_TEXT: Record<DisplayStatus, string> = {
  SAFE: "muted",
  EXPIRING_SOON: "text-amber-700 dark:text-amber-300",
  EXPIRING_TODAY: "text-red-700 dark:text-red-300",
  EXPIRED: "text-red-700 dark:text-red-300",
  CONSUMED: "muted",
  DISCARDED: "muted",
};
