/**
 * Demo mode: a DataRepository that keeps sample data in this browser's localStorage only.
 * It never touches Firestore, so demo products can't mix with real user data.
 */
import type { Product, ProductInput, ProductUpdate } from "@/types/product";
import type { AppNotification } from "@/types/notification";
import type { UserProfile } from "@/types/user";
import { DEFAULT_REMINDER_DAYS } from "@/types/product";
import { addDays, todayISO } from "./dates";
import { normaliseProductInput, type DataRepository, type Unsubscribe } from "./repository";

const KEY = {
  enabled: "fer:demo",
  products: "fer:demo:products",
  notifications: "fer:demo:notifications",
  profile: "fer:demo:profile",
};

export const DEMO_USER = { uid: "demo-user", name: "Demo User", email: "demo@example.com" };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 20)
    : Math.random().toString(36).slice(2, 14);
}

export function isDemoEnabled(): boolean {
  try {
    return localStorage.getItem(KEY.enabled) === "1";
  } catch {
    return false;
  }
}

/**
 * Sample products with dates relative to today so every status appears in the demo:
 * expiring soon, today, expired, safe, plus consumed items for the statistics.
 */
export function buildDemoProducts(today: string = todayISO()): Product[] {
  const now = new Date().toISOString();
  // Relative to `today` (midday), so demo history matches the dates it is built for.
  const daysAgo = (n: number) => new Date(`${addDays(today, -n)}T12:00:00`).toISOString();
  const base = {
    manufacturingDate: null,
    expiryDateSource: "printed" as const,
    quantity: 1,
    notes: "",
    imageUrl: null,
    source: "demo" as const,
    reminderDays: DEFAULT_REMINDER_DAYS,
    status: "ACTIVE" as const,
    consumedAt: null,
    discardedAt: null,
    updatedAt: now,
  };
  return [
    { ...base, id: "demo-milk", productName: "Milk", category: "Dairy", storageLocation: "Refrigerator", manufacturingDate: addDays(today, -3), expiryDate: addDays(today, 2), createdAt: daysAgo(3) },
    { ...base, id: "demo-bread", productName: "Bread", category: "Bakery", storageLocation: "Kitchen shelf", expiryDate: addDays(today, 1), createdAt: daysAgo(2) },
    { ...base, id: "demo-yogurt", productName: "Yogurt", category: "Dairy", storageLocation: "Refrigerator", expiryDate: addDays(today, 5), createdAt: daysAgo(1) },
    { ...base, id: "demo-juice", productName: "Orange Juice", category: "Beverages", storageLocation: "Refrigerator", expiryDate: today, createdAt: daysAgo(6) },
    { ...base, id: "demo-paneer", productName: "Paneer", category: "Dairy", storageLocation: "Refrigerator", expiryDate: addDays(today, -2), createdAt: daysAgo(9) },
    { ...base, id: "demo-biscuits", productName: "Biscuits", category: "Snacks", storageLocation: "Cupboard", expiryDate: addDays(today, 39), createdAt: daysAgo(4) },
    { ...base, id: "demo-ketchup", productName: "Tomato Ketchup", category: "Sauces", storageLocation: "Refrigerator door", expiryDate: addDays(today, 120), createdAt: daysAgo(12), expiryDateSource: "calculated", manufacturingDate: addDays(today, -60), notes: "Best before 6 months from manufacture." },
    { ...base, id: "demo-peas", productName: "Frozen Peas", category: "Frozen", storageLocation: "Freezer", expiryDate: addDays(today, 200), createdAt: daysAgo(20), quantity: 2 },
    { ...base, id: "demo-butter", productName: "Butter", category: "Dairy", storageLocation: "Refrigerator", expiryDate: addDays(today, 10), createdAt: daysAgo(15), status: "CONSUMED", consumedAt: daysAgo(1) },
    { ...base, id: "demo-cheese", productName: "Cheese Slices", category: "Dairy", storageLocation: "Refrigerator", expiryDate: addDays(today, -5), createdAt: daysAgo(25), status: "DISCARDED", discardedAt: daysAgo(4) },
  ];
}

type Listener = () => void;
const listeners = new Set<Listener>();
function emit() {
  listeners.forEach((l) => l());
}

export class DemoRepository implements DataRepository {
  readonly kind = "demo" as const;

  /** Turns demo mode on and seeds sample data (only if none exists yet). */
  static enable() {
    localStorage.setItem(KEY.enabled, "1");
    if (!localStorage.getItem(KEY.products)) write(KEY.products, buildDemoProducts());
    if (!localStorage.getItem(KEY.profile)) {
      const profile: UserProfile = {
        name: DEMO_USER.name,
        email: DEMO_USER.email,
        defaultReminderDays: DEFAULT_REMINDER_DAYS,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        notificationsEnabled: false,
        emailReminders: false,
        createdAt: new Date().toISOString(),
      };
      write(KEY.profile, profile);
    }
  }

  /** Leaves demo mode and removes all demo data from this browser. */
  static disable() {
    Object.values(KEY).forEach((k) => localStorage.removeItem(k));
    emit();
  }

  /** Replaces demo data with a fresh sample set. */
  static reset() {
    write(KEY.products, buildDemoProducts());
    write(KEY.notifications, []);
    emit();
  }

  private products(): Product[] {
    return read<Product[]>(KEY.products, []);
  }

  private notifications(): AppNotification[] {
    return read<AppNotification[]>(KEY.notifications, []);
  }

  private subscribe<T>(get: () => T, onData: (v: T) => void): Unsubscribe {
    const listener = () => onData(get());
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => e.key?.startsWith("fer:demo") && listener();
    window.addEventListener("storage", onStorage);
    queueMicrotask(listener);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  subscribeProducts(onData: (products: Product[]) => void): Unsubscribe {
    return this.subscribe(() => this.products(), onData);
  }

  async getProduct(id: string) {
    return this.products().find((p) => p.id === id) ?? null;
  }

  async addProduct(input: ProductInput): Promise<string> {
    const now = new Date().toISOString();
    const product: Product = {
      ...normaliseProductInput(input),
      id: newId(),
      status: "ACTIVE",
      consumedAt: null,
      discardedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    write(KEY.products, [...this.products(), product]);
    emit();
    return product.id;
  }

  async updateProduct(id: string, update: ProductUpdate): Promise<void> {
    const list = this.products();
    const idx = list.findIndex((p) => p.id === id);
    const current = list[idx];
    if (!current) throw new Error("Product not found");
    list[idx] = { ...current, ...update, updatedAt: new Date().toISOString() };
    write(KEY.products, list);
    emit();
  }

  async deleteProduct(id: string): Promise<void> {
    write(KEY.products, this.products().filter((p) => p.id !== id));
    emit();
  }

  subscribeNotifications(onData: (items: AppNotification[]) => void): Unsubscribe {
    return this.subscribe(
      () => [...this.notifications()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      onData,
    );
  }

  async createNotificationOnce(n: AppNotification): Promise<boolean> {
    const list = this.notifications();
    if (list.some((x) => x.id === n.id)) return false;
    write(KEY.notifications, [...list, n]);
    emit();
    return true;
  }

  async markNotificationRead(id: string) {
    write(KEY.notifications, this.notifications().map((n) => (n.id === id ? { ...n, read: true } : n)));
    emit();
  }

  async markAllNotificationsRead(ids: string[]) {
    const set = new Set(ids);
    write(KEY.notifications, this.notifications().map((n) => (set.has(n.id) ? { ...n, read: true } : n)));
    emit();
  }

  async getProfile() {
    return read<UserProfile | null>(KEY.profile, null);
  }

  async updateProfile(update: Partial<UserProfile>) {
    const current = read<UserProfile | null>(KEY.profile, null);
    if (current) write(KEY.profile, { ...current, ...update });
    emit();
  }

  async deleteAllData() {
    write(KEY.products, []);
    write(KEY.notifications, []);
    emit();
  }
}
