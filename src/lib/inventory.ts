/** Search, filter and sort for the inventory list. Pure so it can be unit tested. */
import type { Category, DisplayStatus, Product } from "@/types/product";
import { calculateDaysRemaining, getDisplayStatus } from "./expiry";
import { todayISO } from "./dates";

export type StatusFilter = "ALL" | DisplayStatus;
export type SortOption = "expiry-asc" | "expiry-desc" | "recent" | "alpha";

export const SORT_LABELS: Record<SortOption, string> = {
  "expiry-asc": "Expiring first",
  "expiry-desc": "Expiring last",
  recent: "Recently added",
  alpha: "Alphabetical",
};

export const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "SAFE", label: "Safe" },
  { value: "EXPIRING_SOON", label: "Expiring soon" },
  { value: "EXPIRING_TODAY", label: "Expiring today" },
  { value: "EXPIRED", label: "Expired" },
  { value: "CONSUMED", label: "Consumed" },
  { value: "DISCARDED", label: "Discarded" },
];

export interface InventoryQuery {
  search?: string;
  category?: Category | "ALL";
  status?: StatusFilter;
  sort?: SortOption;
}

export interface InventoryItem {
  product: Product;
  status: DisplayStatus;
  daysRemaining: number;
}

export function decorate(products: Product[], today: string = todayISO()): InventoryItem[] {
  return products.map((product) => ({
    product,
    status: getDisplayStatus(product, today),
    daysRemaining: calculateDaysRemaining(product.expiryDate, today),
  }));
}

export function queryInventory(products: Product[], q: InventoryQuery = {}, today: string = todayISO()): InventoryItem[] {
  const search = (q.search ?? "").trim().toLowerCase();
  const status = q.status ?? "ALL";
  const category = q.category ?? "ALL";
  const sort = q.sort ?? "expiry-asc";

  let items = decorate(products, today);

  // "All" shows what is still being tracked; consumed/discarded have their own filters.
  if (status === "ALL") items = items.filter((i) => i.product.status === "ACTIVE");
  else items = items.filter((i) => i.status === status);

  if (category !== "ALL") items = items.filter((i) => i.product.category === category);

  if (search) {
    items = items.filter(
      (i) =>
        i.product.productName.toLowerCase().includes(search) ||
        i.product.category.toLowerCase().includes(search) ||
        i.product.storageLocation.toLowerCase().includes(search),
    );
  }

  const byName = (a: InventoryItem, b: InventoryItem) =>
    a.product.productName.localeCompare(b.product.productName, undefined, { sensitivity: "base" });

  items.sort((a, b) => {
    switch (sort) {
      case "expiry-asc":
        return a.product.expiryDate.localeCompare(b.product.expiryDate) || byName(a, b);
      case "expiry-desc":
        return b.product.expiryDate.localeCompare(a.product.expiryDate) || byName(a, b);
      case "recent":
        return b.product.createdAt.localeCompare(a.product.createdAt);
      case "alpha":
        return byName(a, b);
    }
  });

  return items;
}
