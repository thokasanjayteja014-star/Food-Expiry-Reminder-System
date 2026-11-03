/**
 * Storage abstraction. The app talks to this interface so the UI does not care whether
 * data lives in Firestore (real accounts) or in this browser only (demo mode).
 */
import type { Product, ProductInput, ProductUpdate } from "@/types/product";
import type { AppNotification } from "@/types/notification";
import type { UserProfile } from "@/types/user";

export type Unsubscribe = () => void;

export interface DataRepository {
  readonly kind: "firestore" | "demo";

  subscribeProducts(onData: (products: Product[]) => void, onError: (error: unknown) => void): Unsubscribe;
  getProduct(id: string): Promise<Product | null>;
  addProduct(input: ProductInput): Promise<string>;
  updateProduct(id: string, update: ProductUpdate): Promise<void>;
  deleteProduct(id: string): Promise<void>;

  subscribeNotifications(onData: (items: AppNotification[]) => void, onError: (error: unknown) => void): Unsubscribe;
  /** Creates the notification only if one with the same id does not exist. Returns false for duplicates. */
  createNotificationOnce(notification: AppNotification): Promise<boolean>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(ids: string[]): Promise<void>;

  getProfile(): Promise<UserProfile | null>;
  updateProfile(update: Partial<UserProfile>): Promise<void>;

  /** Deletes every product and notification belonging to this user. */
  deleteAllData(): Promise<void>;
}

/** Fills optional product fields with safe defaults. */
export function normaliseProductInput(input: ProductInput): ProductInput {
  return {
    productName: input.productName.trim(),
    category: input.category,
    manufacturingDate: input.manufacturingDate || null,
    expiryDate: input.expiryDate,
    expiryDateSource: input.expiryDateSource,
    quantity: input.quantity ?? null,
    storageLocation: (input.storageLocation ?? "").trim(),
    notes: (input.notes ?? "").trim(),
    imageUrl: input.imageUrl ?? null,
    source: input.source,
    reminderDays: input.reminderDays,
  };
}
