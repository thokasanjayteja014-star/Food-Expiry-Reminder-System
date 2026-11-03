export const CATEGORIES = [
  "Dairy",
  "Bakery",
  "Snacks",
  "Beverages",
  "Frozen",
  "Canned",
  "Sauces",
  "Fruits",
  "Vegetables",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Time-based status, always calculated from the expiry date (never trusted from storage). */
export type ExpiryStatus = "SAFE" | "EXPIRING_SOON" | "EXPIRING_TODAY" | "EXPIRED";

/** What the user has done with the product. Only ACTIVE products are tracked and reminded. */
export type LifecycleStatus = "ACTIVE" | "CONSUMED" | "DISCARDED";

/** The status shown in the UI: a lifecycle state wins over the calculated expiry status. */
export type DisplayStatus = ExpiryStatus | "CONSUMED" | "DISCARDED";

export type ProductSource = "ocr" | "manual" | "demo";

/** How the expiry date was obtained. */
export type ExpiryDateSource = "printed" | "calculated" | "manual";

export const REMINDER_OPTIONS = [1, 3, 5, 7] as const;
export const DEFAULT_REMINDER_DAYS = 3;

export interface Product {
  id: string;
  productName: string;
  category: Category;
  /** ISO calendar date, YYYY-MM-DD. */
  manufacturingDate: string | null;
  /** ISO calendar date, YYYY-MM-DD. */
  expiryDate: string;
  expiryDateSource: ExpiryDateSource;
  quantity: number | null;
  storageLocation: string;
  notes: string;
  /** Optional small JPEG data URL. Stored only if the user opts in. */
  imageUrl: string | null;
  source: ProductSource;
  reminderDays: number;
  status: LifecycleStatus;
  consumedAt: string | null;
  discardedAt: string | null;
  /** ISO timestamps. */
  /** In a shared household: who added the item. */
  addedBy?: string | null;
  addedByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields the user can provide when creating or editing a product. */
export type ProductInput = Pick<
  Product,
  | "productName"
  | "category"
  | "manufacturingDate"
  | "expiryDate"
  | "expiryDateSource"
  | "quantity"
  | "storageLocation"
  | "notes"
  | "imageUrl"
  | "source"
  | "reminderDays"
>;

export type ProductUpdate = Partial<
  ProductInput & Pick<Product, "status" | "consumedAt" | "discardedAt">
>;
