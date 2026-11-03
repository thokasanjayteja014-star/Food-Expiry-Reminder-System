import { describe, expect, it } from "vitest";
import { queryInventory } from "@/lib/inventory";
import { calculateUsageStats, countByStatus } from "@/lib/stats";
import { buildDemoProducts } from "@/lib/demoStore";
import type { Product } from "@/types/product";

const today = "2026-10-07";
const products = buildDemoProducts(today);

describe("countByStatus", () => {
  it("counts active products by calculated status", () => {
    expect(countByStatus(products, today)).toEqual({ total: 8, safe: 3, expiringSoon: 4, expired: 1 });
  });
});

describe("calculateUsageStats", () => {
  it("summarises consumed vs expired", () => {
    const s = calculateUsageStats(products, today);
    expect(s.totalAdded).toBe(10);
    expect(s.currentlyTracked).toBe(8);
    expect(s.consumedBeforeExpiry).toBe(1);
    expect(s.expired).toBe(2); // one discarded + one active-but-expired
    expect(s.beforeExpiryRate).toBe(33);
  });
  it("has no rate until something is finished", () => {
    expect(calculateUsageStats([], today).beforeExpiryRate).toBeNull();
  });
});

describe("queryInventory", () => {
  const names = (items: ReturnType<typeof queryInventory>) => items.map((i) => i.product.productName);

  it("defaults to active products, nearest expiry first", () => {
    const list = names(queryInventory(products, {}, today));
    expect(list).toHaveLength(8);
    expect(list[0]).toBe("Paneer");
    expect(list.at(-1)).toBe("Frozen Peas");
  });
  it("searches by name and category", () => {
    const extra: Product[] = [
      ...products,
      { ...products[0]!, id: "x1", productName: "Milkshake" },
      { ...products[0]!, id: "x2", productName: "Chocolate Milk" },
    ];
    expect(names(queryInventory(extra, { search: "milk", sort: "alpha" }, today))).toEqual(["Chocolate Milk", "Milk", "Milkshake"]);
    expect(names(queryInventory(products, { search: "frozen" }, today))).toEqual(["Frozen Peas"]);
  });
  it("filters by status and category", () => {
    expect(names(queryInventory(products, { status: "EXPIRING_TODAY" }, today))).toEqual(["Orange Juice"]);
    expect(names(queryInventory(products, { status: "CONSUMED" }, today))).toEqual(["Butter"]);
    expect(names(queryInventory(products, { category: "Bakery" }, today))).toEqual(["Bread"]);
  });
  it("sorts by latest expiry and recently added", () => {
    expect(names(queryInventory(products, { sort: "expiry-desc" }, today))[0]).toBe("Frozen Peas");
    expect(names(queryInventory(products, { sort: "recent" }, today))[0]).toBe("Yogurt");
  });
});
