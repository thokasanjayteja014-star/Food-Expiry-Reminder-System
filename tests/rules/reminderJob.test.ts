/**
 * Integration test for the scheduled reminder job against the Firestore emulator:
 * reminders are created for due products, and running the job again does not duplicate them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-food-expiry";
// Push is intentionally not configured here, so no network calls are made.
delete process.env.VAPID_PRIVATE_KEY;

const { adminDb } = await import("@/lib/server/firebaseAdmin");
const { runReminderJobForUser, runReminderJobForAllUsers } = await import("@/lib/server/reminderJob");

const uid = "job-user";
const now = new Date("2026-10-17T04:00:00Z"); // 09:30 in India

beforeAll(async () => {
  const db = adminDb();
  await db.recursiveDelete(db.collection("users")); // start from an empty emulator
  const user = db.collection("users").doc(uid);
  await user.set({ name: "Test", email: "t@example.com", timeZone: "Asia/Kolkata", defaultReminderDays: 3 });
  const add = (id: string, expiryDate: string, status = "ACTIVE") =>
    user.collection("products").doc(id).set({ productName: id, expiryDate, reminderDays: 3, status });
  await add("milk", "2026-10-20"); // 3 days -> EXPIRING_SOON
  await add("juice", "2026-10-17"); // today -> EXPIRING_TODAY
  await add("paneer", "2026-10-16"); // yesterday -> EXPIRED
  await add("biscuits", "2026-11-30"); // safe -> nothing
  await add("butter", "2026-10-18", "CONSUMED"); // consumed -> nothing
});

afterAll(async () => {
  const db = adminDb();
  await db.recursiveDelete(db.collection("users").doc(uid));
});

describe("reminder job", () => {
  it("creates one notification per due product, using the user's time zone", async () => {
    const s = await runReminderJobForUser(uid, now);
    expect(s).toMatchObject({ due: 3, created: 3, pushed: 0, skippedDuplicates: 0 });
    const notes = await adminDb().collection(`users/${uid}/notifications`).get();
    const byId = Object.fromEntries(notes.docs.map((d) => [d.id, d.data()]));
    expect(byId["milk_EXPIRING_SOON_2026-10-20"]?.message).toBe("milk expires in 3 days. Expiry date: 20 Oct 2026");
    expect(byId["juice_EXPIRING_TODAY_2026-10-17"]).toBeDefined();
    expect(byId["paneer_EXPIRED_2026-10-16"]).toBeDefined();
    // Push is not configured in this test, so nothing may claim to have been sent.
    for (const n of notes.docs) {
      expect(n.get("pushStatus")).toBe("not_attempted");
      expect(n.get("sentAt")).toBeNull();
    }
  });

  it("does not send the same reminder twice", async () => {
    const s = await runReminderJobForUser(uid, now);
    expect(s).toMatchObject({ due: 3, created: 0, skippedDuplicates: 3 });
    const all = await runReminderJobForAllUsers(now);
    expect(all.created).toBe(0);
  });
});
