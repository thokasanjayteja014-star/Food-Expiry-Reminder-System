import { describe, expect, it } from "vitest";
import { collectDueReminders, reminderKey, shouldSendReminder, type ReminderProduct } from "@/lib/reminders";
import { addDays } from "@/lib/dates";

const milk: ReminderProduct = { id: "p1", productName: "Milk", expiryDate: "2026-10-20", reminderDays: 3, status: "ACTIVE" };

describe("shouldSendReminder", () => {
  it("sends the 3-day reminder on 17 Oct (spec example)", () => {
    const r = shouldSendReminder(milk, { today: "2026-10-17" });
    expect(r).not.toBeNull();
    expect(r!.type).toBe("EXPIRING_SOON");
    expect(r!.title).toBe("Food Expiry Reminder");
    expect(r!.message).toBe("Milk expires in 3 days. Expiry date: 20 Oct 2026");
    expect(r!.url).toBe("/products/p1");
  });

  it("does not remind before the reminder window", () => {
    expect(shouldSendReminder(milk, { today: "2026-10-16" })).toBeNull();
  });

  it("does not repeat a reminder that was already sent", () => {
    const sent = new Set([reminderKey("p1", "EXPIRING_SOON", "2026-10-20")]);
    expect(shouldSendReminder(milk, { today: "2026-10-17", alreadySent: sent })).toBeNull();
    expect(shouldSendReminder(milk, { today: "2026-10-18", alreadySent: sent })).toBeNull();
    expect(shouldSendReminder(milk, { today: "2026-10-19", alreadySent: sent })).toBeNull();
  });

  it("catches up when the job missed the exact day", () => {
    expect(shouldSendReminder(milk, { today: "2026-10-19" })?.type).toBe("EXPIRING_SOON");
  });

  it("uses friendly wording for tomorrow", () => {
    const bread = { ...milk, id: "b", productName: "Bread", expiryDate: "2026-10-18" };
    expect(shouldSendReminder(bread, { today: "2026-10-17" })?.message).toBe("Bread expires tomorrow. Please consume it soon.");
  });

  it("sends a separate expiring-today reminder once", () => {
    const today = shouldSendReminder(milk, { today: "2026-10-20" });
    expect(today?.type).toBe("EXPIRING_TODAY");
    const sent = new Set([today!.key]);
    expect(shouldSendReminder(milk, { today: "2026-10-20", alreadySent: sent })).toBeNull();
  });

  it("sends one expired reminder, not one every day", () => {
    const first = shouldSendReminder(milk, { today: "2026-10-21" });
    expect(first?.type).toBe("EXPIRED");
    const sent = new Set([first!.key]);
    expect(shouldSendReminder(milk, { today: "2026-10-22", alreadySent: sent })).toBeNull();
    // Long-expired products are not nagged about at all.
    expect(shouldSendReminder(milk, { today: "2026-11-30" })).toBeNull();
  });

  it("ignores consumed and discarded products", () => {
    expect(shouldSendReminder({ ...milk, status: "CONSUMED" }, { today: "2026-10-17" })).toBeNull();
    expect(shouldSendReminder({ ...milk, status: "DISCARDED" }, { today: "2026-10-20" })).toBeNull();
  });

  it("respects each product's reminder period", () => {
    const sevenDay = { ...milk, reminderDays: 7 };
    expect(shouldSendReminder(sevenDay, { today: "2026-10-13" })?.type).toBe("EXPIRING_SOON");
    const oneDay = { ...milk, reminderDays: 1 };
    expect(shouldSendReminder(oneDay, { today: "2026-10-18" })).toBeNull();
    expect(shouldSendReminder(oneDay, { today: "2026-10-19" })?.type).toBe("EXPIRING_SOON");
  });

  it("allows new reminders after the expiry date is edited", () => {
    const sent = new Set([reminderKey("p1", "EXPIRING_SOON", "2026-10-20")]);
    const edited = { ...milk, expiryDate: "2026-10-25" };
    expect(shouldSendReminder(edited, { today: "2026-10-23", alreadySent: sent })?.type).toBe("EXPIRING_SOON");
  });
});

describe("collectDueReminders", () => {
  it("returns only products that are due", () => {
    const today = "2026-10-17";
    const products: ReminderProduct[] = [
      { ...milk, id: "a", expiryDate: addDays(today, 30) },
      { ...milk, id: "b", expiryDate: addDays(today, 2) },
      { ...milk, id: "c", expiryDate: today },
      { ...milk, id: "d", expiryDate: addDays(today, -1) },
    ];
    expect(collectDueReminders(products, { today }).map((r) => [r.productId, r.type])).toEqual([
      ["b", "EXPIRING_SOON"],
      ["c", "EXPIRING_TODAY"],
      ["d", "EXPIRED"],
    ]);
  });
});
