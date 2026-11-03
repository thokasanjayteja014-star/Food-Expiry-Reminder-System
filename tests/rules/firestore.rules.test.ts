/**
 * Firestore security rules tests. Run with `npm run test:rules` (starts the emulator; needs Java).
 * Proves that users can only read and write their own data.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, getDocs, collection, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

let env: RulesTestEnvironment;

const product = () => ({
  productName: "Milk",
  category: "Dairy",
  manufacturingDate: "2026-10-10",
  expiryDate: "2026-10-20",
  expiryDateSource: "printed",
  quantity: 1,
  storageLocation: "Refrigerator",
  notes: "",
  imageUrl: null,
  source: "ocr",
  reminderDays: 3,
  status: "ACTIVE",
  consumedAt: null,
  discardedAt: null,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-food-expiry",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  // Seed Alice's data with rules disabled.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/alice"), { name: "Alice", email: "a@example.com", defaultReminderDays: 3 });
    await setDoc(doc(db, "users/alice/products/p1"), { ...product(), createdAt: new Date(), updatedAt: new Date() });
    await setDoc(doc(db, "users/alice/notifications/n1"), {
      title: "Food Expiry Reminder", message: "Milk expires in 3 days.", productId: "p1", type: "EXPIRING_SOON",
      scheduledFor: "2026-10-17", sentAt: null, pushStatus: "sent", read: false, createdAt: new Date(),
    });
    await setDoc(doc(db, "users/alice/pushSubscriptions/s1"), { subscription: { endpoint: "https://push.example/x" } });
  });
});

afterAll(async () => {
  await env?.cleanup();
});

const alice = () => env.authenticatedContext("alice").firestore();
const bob = () => env.authenticatedContext("bob").firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe("products", () => {
  it("owner can read, create, update and delete their products", async () => {
    await assertSucceeds(getDoc(doc(alice(), "users/alice/products/p1")));
    await assertSucceeds(getDocs(collection(alice(), "users/alice/products")));
    await assertSucceeds(setDoc(doc(alice(), "users/alice/products/p2"), product()));
    await assertSucceeds(updateDoc(doc(alice(), "users/alice/products/p1"), { status: "CONSUMED", consumedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(alice(), "users/alice/products/p1")));
  });

  it("another user cannot read another user's products", async () => {
    await assertFails(getDoc(doc(bob(), "users/alice/products/p1")));
    await assertFails(getDocs(collection(bob(), "users/alice/products")));
  });

  it("another user cannot create, modify or delete another user's products", async () => {
    await assertFails(setDoc(doc(bob(), "users/alice/products/p9"), product()));
    await assertFails(updateDoc(doc(bob(), "users/alice/products/p1"), { productName: "Hacked", updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(bob(), "users/alice/products/p1")));
  });

  it("signed-out visitors cannot access anything", async () => {
    await assertFails(getDoc(doc(anon(), "users/alice/products/p1")));
    await assertFails(setDoc(doc(anon(), "users/alice/products/p9"), product()));
  });

  it("rejects invalid product data", async () => {
    const db = alice();
    await assertFails(setDoc(doc(db, "users/alice/products/x1"), { ...product(), productName: "" }));
    await assertFails(setDoc(doc(db, "users/alice/products/x2"), { ...product(), expiryDate: "20/10/2026" }));
    await assertFails(setDoc(doc(db, "users/alice/products/x3"), { ...product(), category: "Weapons" }));
    await assertFails(setDoc(doc(db, "users/alice/products/x4"), { ...product(), reminderDays: 0 }));
    await assertFails(setDoc(doc(db, "users/alice/products/x5"), { ...product(), isAdmin: true }));
    await assertFails(setDoc(doc(db, "users/alice/products/x6"), { ...product(), createdAt: new Date("2020-01-01") }));
  });

  it("does not allow rewriting createdAt", async () => {
    await assertFails(updateDoc(doc(alice(), "users/alice/products/p1"), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });
});

describe("profile", () => {
  it("only the owner can read and update the profile", async () => {
    await assertSucceeds(getDoc(doc(alice(), "users/alice")));
    await assertSucceeds(setDoc(doc(alice(), "users/alice"), { defaultReminderDays: 5 }, { merge: true }));
    await assertFails(getDoc(doc(bob(), "users/alice")));
    await assertFails(setDoc(doc(bob(), "users/alice"), { name: "Bob" }, { merge: true }));
  });
  it("profile cannot be deleted from the client", async () => {
    await assertFails(deleteDoc(doc(alice(), "users/alice")));
  });
});

describe("notifications", () => {
  it("owner can read and mark as read, but not change other fields", async () => {
    await assertSucceeds(getDoc(doc(alice(), "users/alice/notifications/n1")));
    await assertSucceeds(updateDoc(doc(alice(), "users/alice/notifications/n1"), { read: true }));
    await assertFails(updateDoc(doc(alice(), "users/alice/notifications/n1"), { message: "changed" }));
  });
  it("the app may record an in-app reminder but cannot claim a push was sent", async () => {
    const base = {
      title: "Food Expiry Reminder", message: "Milk expires today.", productId: "p1", type: "EXPIRING_TODAY",
      scheduledFor: "2026-10-20", sentAt: null, read: false, createdAt: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(alice(), "users/alice/notifications/n2"), { ...base, pushStatus: "local" }));
    await assertFails(setDoc(doc(alice(), "users/alice/notifications/n3"), { ...base, pushStatus: "sent" }));
  });
  it("another user cannot read or modify notifications", async () => {
    await assertFails(getDoc(doc(bob(), "users/alice/notifications/n1")));
    await assertFails(updateDoc(doc(bob(), "users/alice/notifications/n1"), { read: true }));
  });
});

describe("push subscriptions", () => {
  it("are server-only, even for the owner", async () => {
    await assertFails(getDoc(doc(alice(), "users/alice/pushSubscriptions/s1")));
    await assertFails(setDoc(doc(alice(), "users/alice/pushSubscriptions/s2"), { subscription: {} }));
  });
});

describe("households (family sharing)", () => {
  const carol = () => env.authenticatedContext("carol").firestore();
  const shared = () => ({ ...product(), addedBy: "alice", addedByName: "Alice" });

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "households/h1"), {
        name: "Home", ownerId: "alice", memberIds: ["alice", "bob"],
        members: { alice: { name: "Alice" }, bob: { name: "Bob" } }, inviteCode: "ABC234",
      });
      await setDoc(doc(db, "households/h1/products/hp1"), { ...shared(), createdAt: new Date(), updatedAt: new Date() });
      await setDoc(doc(db, "householdInvites/ABC234"), { householdId: "h1" });
    });
  });

  it("members can read the household and use the shared list", async () => {
    await assertSucceeds(getDoc(doc(bob(), "households/h1")));
    await assertSucceeds(getDocs(collection(bob(), "households/h1/products")));
    await assertSucceeds(setDoc(doc(bob(), "households/h1/products/hp2"), { ...product(), addedBy: "bob", addedByName: "Bob" }));
    await assertSucceeds(updateDoc(doc(bob(), "households/h1/products/hp1"), { status: "CONSUMED", consumedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(bob(), "households/h1/products/hp1")));
  });

  it("people outside the household cannot see or change anything in it", async () => {
    await assertFails(getDoc(doc(carol(), "households/h1")));
    await assertFails(getDocs(collection(carol(), "households/h1/products")));
    await assertFails(getDoc(doc(carol(), "households/h1/products/hp1")));
    await assertFails(setDoc(doc(carol(), "households/h1/products/x"), { ...product(), addedBy: "carol" }));
    await assertFails(updateDoc(doc(carol(), "households/h1/products/hp1"), { productName: "Hacked", updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(carol(), "households/h1/products/hp1")));
    await assertFails(getDoc(doc(anon(), "households/h1/products/hp1")));
  });

  it("nobody can add themselves or change members from the app", async () => {
    await assertFails(updateDoc(doc(carol(), "households/h1"), { memberIds: ["alice", "bob", "carol"] }));
    await assertFails(updateDoc(doc(alice(), "households/h1"), { memberIds: ["alice", "bob", "carol"] }));
    await assertFails(setDoc(doc(carol(), "households/h2"), { name: "Mine", ownerId: "carol", memberIds: ["carol"] }));
    await assertFails(getDoc(doc(carol(), "householdInvites/ABC234")));
    await assertFails(getDocs(collection(alice(), "householdInvites")));
  });

  it("a user cannot point their profile at a household", async () => {
    await assertFails(setDoc(doc(carol(), "users/carol"), { name: "Carol", householdId: "h1" }));
    await assertFails(setDoc(doc(alice(), "users/alice"), { householdId: "h1" }, { merge: true }));
  });

  it("a member's profile with a household can still be edited, but not the household", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/bob"), { name: "Bob", householdId: "h1" });
    });
    await assertSucceeds(setDoc(doc(bob(), "users/bob"), { defaultReminderDays: 5 }, { merge: true }));
    await assertFails(setDoc(doc(bob(), "users/bob"), { householdId: "h9" }, { merge: true }));
  });

  it("shared items must record the member who added them, and that cannot be rewritten", async () => {
    await assertFails(setDoc(doc(bob(), "households/h1/products/x1"), { ...product(), addedBy: "alice" }));
    await assertFails(setDoc(doc(bob(), "households/h1/products/x2"), product()));
    await assertFails(updateDoc(doc(bob(), "households/h1/products/hp1"), { addedBy: "bob", updatedAt: serverTimestamp() }));
  });
});
