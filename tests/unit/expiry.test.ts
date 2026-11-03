import { describe, expect, it } from "vitest";
import {
  calculateDaysRemaining,
  calculateExpiryStatus,
  describeDaysRemaining,
  getDisplayStatus,
} from "@/lib/expiry";
import { addDays, addMonths, diffInDays, isValidISODate, todayISO } from "@/lib/dates";

const today = "2026-10-17";

describe("calculateDaysRemaining", () => {
  it("counts whole calendar days", () => {
    expect(calculateDaysRemaining("2026-10-20", today)).toBe(3);
    expect(calculateDaysRemaining("2026-10-17", today)).toBe(0);
    expect(calculateDaysRemaining("2026-10-15", today)).toBe(-2);
  });
  it("crosses months, years and leap days", () => {
    expect(calculateDaysRemaining("2026-11-16", today)).toBe(30);
    expect(calculateDaysRemaining("2027-01-01", "2026-12-31")).toBe(1);
    expect(calculateDaysRemaining("2028-03-01", "2028-02-28")).toBe(2);
  });
  it("throws on an invalid date", () => {
    expect(() => calculateDaysRemaining("2026-02-30", today)).toThrow();
    expect(() => calculateDaysRemaining("not a date", today)).toThrow();
  });
});

describe("calculateExpiryStatus (spec test data)", () => {
  it.each([
    ["1. expires in 30 days", 30, "SAFE"],
    ["   expires in 8 days", 8, "SAFE"],
    ["2. expires in 7 days", 7, "EXPIRING_SOON"],
    ["3. expires in 3 days", 3, "EXPIRING_SOON"],
    ["4. expires tomorrow", 1, "EXPIRING_SOON"],
    ["5. expires today", 0, "EXPIRING_TODAY"],
    ["6. expired yesterday", -1, "EXPIRED"],
  ] as const)("%s -> %s", (_label, offset, expected) => {
    expect(calculateExpiryStatus(addDays(today, offset), today)).toBe(expected);
  });

  it("matches the spec example: expiry 20 Oct", () => {
    expect(calculateExpiryStatus("2026-10-20", "2026-10-17")).toBe("EXPIRING_SOON");
    expect(calculateExpiryStatus("2026-10-20", "2026-10-20")).toBe("EXPIRING_TODAY");
    expect(calculateExpiryStatus("2026-10-20", "2026-10-21")).toBe("EXPIRED");
  });

  it("7. rejects an invalid date", () => {
    expect(() => calculateExpiryStatus("2026-13-01", today)).toThrow();
  });
});

describe("getDisplayStatus", () => {
  it("lets consumed/discarded override the expiry status", () => {
    expect(getDisplayStatus({ status: "CONSUMED", expiryDate: "2026-10-01" }, today)).toBe("CONSUMED");
    expect(getDisplayStatus({ status: "DISCARDED", expiryDate: "2026-12-01" }, today)).toBe("DISCARDED");
    expect(getDisplayStatus({ status: "ACTIVE", expiryDate: "2026-10-01" }, today)).toBe("EXPIRED");
  });
});

describe("describeDaysRemaining", () => {
  it.each([
    [5, "5 days remaining"],
    [1, "Expires tomorrow"],
    [0, "Expires today"],
    [-1, "Expired yesterday"],
    [-2, "Expired 2 days ago"],
  ])("%i -> %s", (d, text) => expect(describeDaysRemaining(d)).toBe(text));
});

describe("date helpers", () => {
  it("validates ISO dates", () => {
    expect(isValidISODate("2028-02-29")).toBe(true);
    expect(isValidISODate("2027-02-29")).toBe(false);
    expect(isValidISODate("2026-1-1")).toBe(false);
  });
  it("adds months with end-of-month clamping", () => {
    expect(addMonths("2026-03-10", 6)).toBe("2026-09-10");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });
  it("diffInDays is unaffected by daylight saving", () => {
    expect(diffInDays("2026-03-28", "2026-03-30")).toBe(2);
  });
  it("todayISO respects the time zone", () => {
    const instant = new Date("2026-10-17T20:00:00Z"); // 01:30 on the 18th in India
    expect(todayISO("Asia/Kolkata", instant)).toBe("2026-10-18");
    expect(todayISO("UTC", instant)).toBe("2026-10-17");
  });
});
