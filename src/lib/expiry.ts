/**
 * Expiry engine: pure functions that turn an expiry date into a status.
 * Status is always calculated at display/processing time because it changes every day.
 */
import type { DisplayStatus, ExpiryStatus, Product } from "@/types/product";
import { diffInDays, todayISO } from "./dates";

/** Products with more than this many days left are SAFE. */
export const EXPIRING_SOON_WINDOW_DAYS = 7;

/**
 * Days from `today` until `expiryDate`.
 * 0 = expires today, negative = already expired.
 */
export function calculateDaysRemaining(expiryDate: string, today: string = todayISO()): number {
  return diffInDays(today, expiryDate);
}

/**
 * SAFE            more than 7 days remaining
 * EXPIRING_SOON   1 to 7 days remaining
 * EXPIRING_TODAY  0 days remaining
 * EXPIRED         expiry date is before today
 */
export function calculateExpiryStatus(expiryDate: string, today: string = todayISO()): ExpiryStatus {
  const days = calculateDaysRemaining(expiryDate, today);
  if (days < 0) return "EXPIRED";
  if (days === 0) return "EXPIRING_TODAY";
  if (days <= EXPIRING_SOON_WINDOW_DAYS) return "EXPIRING_SOON";
  return "SAFE";
}

/** Lifecycle (consumed/discarded) wins over the time-based status. */
export function getDisplayStatus(
  product: Pick<Product, "status" | "expiryDate">,
  today: string = todayISO(),
): DisplayStatus {
  if (product.status === "CONSUMED") return "CONSUMED";
  if (product.status === "DISCARDED") return "DISCARDED";
  return calculateExpiryStatus(product.expiryDate, today);
}

/** True for statuses that belong in the "Expiring Soon" lists (today included). */
export function isExpiringSoon(status: DisplayStatus): boolean {
  return status === "EXPIRING_SOON" || status === "EXPIRING_TODAY";
}

/** Human text such as "3 days remaining", "Expires today", "Expired 2 days ago". */
export function describeDaysRemaining(days: number): string {
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  if (days > 1) return `${days} days remaining`;
  if (days === -1) return "Expired yesterday";
  return `Expired ${Math.abs(days)} days ago`;
}

/** Phrase used inside reminder messages: "expires in 3 days", "expires tomorrow". */
export function expiresInPhrase(days: number): string {
  if (days === 0) return "expires today";
  if (days === 1) return "expires tomorrow";
  if (days > 1) return `expires in ${days} days`;
  if (days === -1) return "expired yesterday";
  return `expired ${Math.abs(days)} days ago`;
}

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  SAFE: "Safe",
  EXPIRING_SOON: "Expiring soon",
  EXPIRING_TODAY: "Expiring today",
  EXPIRED: "Expired",
  CONSUMED: "Consumed",
  DISCARDED: "Discarded",
};
