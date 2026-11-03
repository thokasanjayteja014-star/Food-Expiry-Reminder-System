/**
 * Reminder engine. Pure and shared by the server cron job (/api/reminders/check)
 * and the in-app fallback check, so both make identical decisions.
 *
 * Each product can receive at most three reminders per expiry date:
 *   EXPIRING_SOON   once, when days remaining first falls within reminderDays
 *   EXPIRING_TODAY  once, on the expiry day
 *   EXPIRED         once, shortly after expiry (not every day)
 * Duplicates are prevented by a deterministic reminder key that doubles as the
 * notification document id.
 */
import type { Product } from "@/types/product";
import type { NotificationType } from "@/types/notification";
import { formatDate, todayISO } from "./dates";
import { calculateDaysRemaining, expiresInPhrase } from "./expiry";

/** An EXPIRED reminder is only sent this many days after expiry, to catch up a missed run without nagging about old items. */
export const EXPIRED_REMINDER_GRACE_DAYS = 3;

export const REMINDER_TITLE = "Food Expiry Reminder";

export type ReminderType = Exclude<NotificationType, "TEST">;

export interface ReminderDecision {
  key: string;
  type: ReminderType;
  daysRemaining: number;
  title: string;
  message: string;
  /** Where clicking the notification should take the user. */
  url: string;
}

export type ReminderProduct = Pick<
  Product,
  "id" | "productName" | "expiryDate" | "reminderDays" | "status"
>;

/** Stable id for one reminder of one product for one expiry date. */
export function reminderKey(productId: string, type: ReminderType, expiryDate: string): string {
  return `${productId}_${type}_${expiryDate}`;
}

/** Which kind of reminder (if any) is due today, ignoring whether it was already sent. */
export function dueReminderType(product: ReminderProduct, today: string): ReminderType | null {
  if (product.status !== "ACTIVE") return null;
  const days = calculateDaysRemaining(product.expiryDate, today);
  if (days < 0) return days >= -EXPIRED_REMINDER_GRACE_DAYS ? "EXPIRED" : null;
  if (days === 0) return "EXPIRING_TODAY";
  const window = Number.isFinite(product.reminderDays) && product.reminderDays > 0 ? product.reminderDays : 3;
  return days <= window ? "EXPIRING_SOON" : null;
}

export function buildReminderMessage(productName: string, expiryDate: string, daysRemaining: number): string {
  const name = productName.trim() || "A product";
  const phrase = expiresInPhrase(daysRemaining);
  if (daysRemaining < 0) return `${name} ${phrase}. Please check it before use or discard it.`;
  if (daysRemaining === 0) return `${name} ${phrase}. Please consume it today.`;
  if (daysRemaining === 1) return `${name} ${phrase}. Please consume it soon.`;
  return `${name} ${phrase}. Expiry date: ${formatDate(expiryDate)}`;
}

/**
 * Decides whether `product` needs a reminder today.
 * Returns null when nothing is due or the due reminder was already sent.
 */
export function shouldSendReminder(
  product: ReminderProduct,
  options: { today?: string; alreadySent?: ReadonlySet<string> } = {},
): ReminderDecision | null {
  const today = options.today ?? todayISO();
  const type = dueReminderType(product, today);
  if (!type) return null;
  const key = reminderKey(product.id, type, product.expiryDate);
  if (options.alreadySent?.has(key)) return null;
  const daysRemaining = calculateDaysRemaining(product.expiryDate, today);
  return {
    key,
    type,
    daysRemaining,
    title: REMINDER_TITLE,
    message: buildReminderMessage(product.productName, product.expiryDate, daysRemaining),
    url: `/products/${product.id}`,
  };
}

/** All reminders due today for a list of products. */
export function collectDueReminders(
  products: ReminderProduct[],
  options: { today?: string; alreadySent?: ReadonlySet<string> } = {},
): Array<ReminderDecision & { productId: string }> {
  const out: Array<ReminderDecision & { productId: string }> = [];
  for (const p of products) {
    const d = shouldSendReminder(p, options);
    if (d) out.push({ ...d, productId: p.id });
  }
  return out;
}
