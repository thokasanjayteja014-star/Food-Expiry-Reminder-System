/**
 * Firestore implementation of DataRepository. Notifications and the profile live under
 * users/{uid}; products live there too, or under households/{id} when the user shares a
 * household's food list.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  limit,
  addDoc,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
} from "firebase/firestore";
import type { Product, ProductInput, ProductUpdate } from "@/types/product";
import type { AppNotification } from "@/types/notification";
import type { UserProfile } from "@/types/user";
import { getDb } from "./firebase";
import { AppError, FRIENDLY, isOnline, withTimeout } from "./errors";
import { normaliseProductInput, type DataRepository, type Unsubscribe } from "./repository";
import { DEFAULT_REMINDER_DAYS } from "@/types/product";

const WRITE_TIMEOUT_MS = 15_000;

function toISO(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

function productFromSnap(snap: DocumentSnapshot<DocumentData>): Product {
  // "estimate" gives pending server timestamps a local value so new items sort correctly.
  const d = snap.data({ serverTimestamps: "estimate" }) ?? {};
  return {
    id: snap.id,
    productName: String(d.productName ?? ""),
    category: d.category ?? "Other",
    manufacturingDate: d.manufacturingDate ?? null,
    expiryDate: String(d.expiryDate ?? ""),
    expiryDateSource: d.expiryDateSource ?? "manual",
    quantity: typeof d.quantity === "number" ? d.quantity : null,
    storageLocation: d.storageLocation ?? "",
    notes: d.notes ?? "",
    imageUrl: d.imageUrl ?? null,
    source: d.source ?? "manual",
    reminderDays: typeof d.reminderDays === "number" ? d.reminderDays : DEFAULT_REMINDER_DAYS,
    status: d.status ?? "ACTIVE",
    consumedAt: toISO(d.consumedAt),
    discardedAt: toISO(d.discardedAt),
    addedBy: typeof d.addedBy === "string" ? d.addedBy : null,
    addedByName: typeof d.addedByName === "string" ? d.addedByName : null,
    createdAt: toISO(d.createdAt) ?? new Date().toISOString(),
    updatedAt: toISO(d.updatedAt) ?? new Date().toISOString(),
  };
}

function notificationFromSnap(snap: DocumentSnapshot<DocumentData>): AppNotification {
  const d = snap.data({ serverTimestamps: "estimate" }) ?? {};
  return {
    id: snap.id,
    title: String(d.title ?? ""),
    message: String(d.message ?? ""),
    productId: d.productId ?? null,
    type: d.type ?? "EXPIRING_SOON",
    scheduledFor: d.scheduledFor ?? "",
    sentAt: toISO(d.sentAt),
    pushStatus: d.pushStatus ?? "not_attempted",
    read: Boolean(d.read),
    createdAt: toISO(d.createdAt) ?? new Date().toISOString(),
  };
}

/** Refuses writes while offline so we never show "saved" for data that is only queued locally. */
function ensureOnline(message: string = FRIENDLY.offlineSave) {
  if (!isOnline()) throw new AppError(message);
}

export class FirestoreRepository implements DataRepository {
  readonly kind = "firestore" as const;
  private readonly db: Firestore;

  /**
   * @param householdId the shared household, or null for the user's own list
   * @param memberName shown on shared items as "Added by"
   */
  constructor(
    private readonly uid: string,
    readonly householdId: string | null = null,
    private readonly memberName = "",
  ) {
    this.db = getDb();
  }

  private products() {
    return this.householdId
      ? collection(this.db, "households", this.householdId, "products")
      : collection(this.db, "users", this.uid, "products");
  }

  private notifications() {
    return collection(this.db, "users", this.uid, "notifications");
  }

  subscribeProducts(onData: (products: Product[]) => void, onError: (error: unknown) => void): Unsubscribe {
    return onSnapshot(
      query(this.products(), orderBy("expiryDate", "asc")),
      (snap) => onData(snap.docs.map(productFromSnap)),
      onError,
    );
  }

  async getProduct(id: string): Promise<Product | null> {
    const snap = await getDoc(doc(this.products(), id));
    return snap.exists() ? productFromSnap(snap) : null;
  }

  async addProduct(input: ProductInput): Promise<string> {
    ensureOnline();
    const data = normaliseProductInput(input);
    const ref = await withTimeout(
      addDoc(this.products(), {
        ...data,
        ...(this.householdId ? { addedBy: this.uid, addedByName: this.memberName.slice(0, 60) } : {}),
        status: "ACTIVE",
        consumedAt: null,
        discardedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      WRITE_TIMEOUT_MS,
      FRIENDLY.save,
    );
    return ref.id;
  }

  async updateProduct(id: string, update: ProductUpdate): Promise<void> {
    ensureOnline();
    const data: Record<string, unknown> = { ...update, updatedAt: serverTimestamp() };
    if (update.productName !== undefined) data.productName = update.productName.trim();
    if (update.consumedAt !== undefined) data.consumedAt = update.consumedAt ? serverTimestamp() : null;
    if (update.discardedAt !== undefined) data.discardedAt = update.discardedAt ? serverTimestamp() : null;
    await withTimeout(updateDoc(doc(this.products(), id), data), WRITE_TIMEOUT_MS, FRIENDLY.save);
  }

  async deleteProduct(id: string): Promise<void> {
    ensureOnline(FRIENDLY.delete);
    await withTimeout(deleteDoc(doc(this.products(), id)), WRITE_TIMEOUT_MS, FRIENDLY.delete);
  }

  subscribeNotifications(onData: (items: AppNotification[]) => void, onError: (error: unknown) => void): Unsubscribe {
    return onSnapshot(
      query(this.notifications(), orderBy("createdAt", "desc"), limit(100)),
      (snap) => onData(snap.docs.map(notificationFromSnap)),
      onError,
    );
  }

  async createNotificationOnce(n: AppNotification): Promise<boolean> {
    if (!isOnline()) return false;
    const ref = doc(this.notifications(), n.id);
    return runTransaction(this.db, async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists()) return false;
      tx.set(ref, {
        title: n.title,
        message: n.message,
        productId: n.productId,
        type: n.type,
        scheduledFor: n.scheduledFor,
        sentAt: null,
        pushStatus: n.pushStatus,
        read: false,
        createdAt: serverTimestamp(),
      });
      return true;
    });
  }

  async markNotificationRead(id: string): Promise<void> {
    await updateDoc(doc(this.notifications(), id), { read: true });
  }

  async markAllNotificationsRead(ids: string[]): Promise<void> {
    const batch = writeBatch(this.db);
    ids.forEach((id) => batch.update(doc(this.notifications(), id), { read: true }));
    await withTimeout(batch.commit(), WRITE_TIMEOUT_MS, FRIENDLY.generic);
  }

  async getProfile(): Promise<UserProfile | null> {
    const snap = await getDoc(doc(this.db, "users", this.uid));
    if (!snap.exists()) return null;
    const d = snap.data({ serverTimestamps: "estimate" });
    return {
      name: d.name ?? "",
      email: d.email ?? "",
      defaultReminderDays: typeof d.defaultReminderDays === "number" ? d.defaultReminderDays : DEFAULT_REMINDER_DAYS,
      timeZone: d.timeZone ?? "UTC",
      notificationsEnabled: Boolean(d.notificationsEnabled),
      emailReminders: d.emailReminders !== false,
      householdId: typeof d.householdId === "string" ? d.householdId : null,
      createdAt: toISO(d.createdAt) ?? new Date().toISOString(),
    };
  }

  async updateProfile(update: Partial<UserProfile>): Promise<void> {
    ensureOnline(FRIENDLY.offline);
    // householdId is managed by the server only.
    const { createdAt: _ignored, householdId: _household, ...rest } = update;
    await withTimeout(
      setDoc(doc(this.db, "users", this.uid), { ...rest, updatedAt: serverTimestamp() }, { merge: true }),
      WRITE_TIMEOUT_MS,
      FRIENDLY.generic,
    );
  }

  async deleteAllData(): Promise<void> {
    ensureOnline(FRIENDLY.offline);
    // A household's shared list belongs to everyone in it, so only the user's own data is deleted.
    const own = this.householdId ? [this.notifications()] : [this.products(), this.notifications()];
    for (const col of own) {
      const snap = await getDocs(col);
      // Firestore batches hold up to 500 writes.
      for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = writeBatch(this.db);
        snap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }
  }
}

/** Creates the users/{uid} profile document on first sign-in. */
export async function ensureUserProfile(uid: string, name: string, email: string): Promise<void> {
  const db = getDb();
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  if (!snap.exists()) {
    await setDoc(ref, {
      name,
      email,
      defaultReminderDays: DEFAULT_REMINDER_DAYS,
      timeZone,
      notificationsEnabled: false,
      emailReminders: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    const data = snap.data();
    const update: Record<string, unknown> = {};
    // Keep the time zone current so server reminders use the user's calendar day.
    if (data.timeZone !== timeZone) update.timeZone = timeZone;
    // Sign-up can create the profile before the name is saved: fill it in now.
    if (!data.name && name) update.name = name;
    if (!data.email && email) update.email = email;
    if (Object.keys(update).length) await setDoc(ref, { ...update, updatedAt: serverTimestamp() }, { merge: true });
  }
}
