/** Simple food-tracking statistics derived from the user's own records. */
import type { Product } from "@/types/product";
import { getDisplayStatus } from "./expiry";
import { timestampToLocalISODate, todayISO } from "./dates";

export interface DashboardCounts {
  total: number;
  safe: number;
  expiringSoon: number;
  expired: number;
}

export interface UsageStats {
  totalAdded: number;
  consumedBeforeExpiry: number;
  consumedAfterExpiry: number;
  expired: number;
  currentlyTracked: number;
  /** consumed before expiry / (consumed + expired), or null with no finished products yet. */
  beforeExpiryRate: number | null;
}

/** Counts for the dashboard cards (active products only). Expiring today counts as expiring soon. */
export function countByStatus(products: Product[], today: string = todayISO()): DashboardCounts {
  const counts: DashboardCounts = { total: 0, safe: 0, expiringSoon: 0, expired: 0 };
  for (const p of products) {
    if (p.status !== "ACTIVE") continue;
    counts.total++;
    const s = getDisplayStatus(p, today);
    if (s === "SAFE") counts.safe++;
    else if (s === "EXPIRED") counts.expired++;
    else counts.expiringSoon++;
  }
  return counts;
}

export function calculateUsageStats(products: Product[], today: string = todayISO()): UsageStats {
  let consumedBefore = 0;
  let consumedAfter = 0;
  let expired = 0;
  let tracked = 0;
  for (const p of products) {
    if (p.status === "CONSUMED") {
      const consumedOn = p.consumedAt ? timestampToLocalISODate(p.consumedAt) : today;
      if (consumedOn <= p.expiryDate) consumedBefore++;
      else consumedAfter++;
    } else if (p.status === "DISCARDED") {
      expired++;
    } else {
      tracked++;
      if (getDisplayStatus(p, today) === "EXPIRED") expired++;
    }
  }
  const finished = consumedBefore + consumedAfter + expired;
  return {
    totalAdded: products.length,
    consumedBeforeExpiry: consumedBefore,
    consumedAfterExpiry: consumedAfter,
    expired,
    currentlyTracked: tracked,
    beforeExpiryRate: finished > 0 ? Math.round((consumedBefore / finished) * 100) : null,
  };
}
