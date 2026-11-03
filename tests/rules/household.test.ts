/**
 * Family sharing against the Firestore emulator: create, invite, join, shared reminders,
 * leaving and removing members, all through the same server functions the API uses.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-food-expiry";
delete process.env.VAPID_PRIVATE_KEY;

const { adminDb } = await import("@/lib/server/firebaseAdmin");
const h = await import("@/lib/server/household");
const { runReminderJobForUser } = await import("@/lib/server/reminderJob");

const now = new Date("2026-10-17T04:00:00Z");
const db = () => adminDb();
const user = (uid: string) => db().collection("users").doc(uid);
const ids = async (path: string) => (await db().collection(path).get()).docs.map((d) => d.id).sort();

beforeAll(async () => {
  for (const c of ["users", "households", "householdInvites"]) await db().recursiveDelete(db().collection(c));
  for (const [uid, name] of [["amma", "Amma"], ["ravi", "Ravi"], ["guest", "Guest"]] as const) {
    await user(uid).set({ name, email: `${uid}@example.com`, timeZone: "Asia/Kolkata", defaultReminderDays: 3 });
  }
  await user("amma").collection("products").doc("milk").set({ productName: "Milk", expiryDate: "2026-10-19", reminderDays: 3, status: "ACTIVE" });
  await user("ravi").collection("products").doc("curd").set({ productName: "Curd", expiryDate: "2026-10-17", reminderDays: 3, status: "ACTIVE" });
});

afterAll(async () => {
  for (const c of ["users", "households", "householdInvites"]) await db().recursiveDelete(db().collection(c));
});

let householdId = "";
let code = "";

describe("family sharing", () => {
  it("creates a household and moves the owner's food into it", async () => {
    const r = await h.createHousehold("amma", "  Our   Home ");
    householdId = r.householdId;
    code = r.inviteCode;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    const snap = await db().collection("households").doc(householdId).get();
    expect(snap.get("name")).toBe("Our Home");
    expect(snap.get("ownerId")).toBe("amma");
    expect(snap.get("memberIds")).toEqual(["amma"]);
    expect((await user("amma").get()).get("householdId")).toBe(householdId);
    expect(await ids(`households/${householdId}/products`)).toEqual(["milk"]);
    expect(await ids("users/amma/products")).toEqual([]);
    expect((await db().doc(`households/${householdId}/products/milk`).get()).get("addedByName")).toBe("Amma");
  });

  it("will not create a second household for someone already in one", async () => {
    await expect(h.createHousehold("amma", "Again")).rejects.toThrow(/already in a household/);
  });

  it("shows the household name for a code, accepting lower case and spaces", async () => {
    const spaced = `${code.slice(0, 3).toLowerCase()} ${code.slice(3)}`;
    expect(await h.previewInvite(spaced)).toEqual({ name: "Our Home", memberCount: 1 });
    await expect(h.previewInvite("ZZZZZZ")).rejects.toThrow(/not valid/);
    await expect(h.previewInvite("abc")).rejects.toThrow(/6-character/);
  });

  it("joins with the code and merges the new member's food into the shared list", async () => {
    expect(await h.joinHousehold("ravi", code)).toEqual({ householdId, name: "Our Home" });
    expect((await db().collection("households").doc(householdId).get()).get("memberIds")).toEqual(["amma", "ravi"]);
    expect(await ids(`households/${householdId}/products`)).toEqual(["curd", "milk"]);
    expect(await ids("users/ravi/products")).toEqual([]);
    // Joining again is harmless.
    await h.joinHousehold("ravi", code);
    expect((await db().collection("households").doc(householdId).get()).get("memberIds")).toEqual(["amma", "ravi"]);
  });

  it("reminds every member about the shared food, each once", async () => {
    const amma = await runReminderJobForUser("amma", now);
    const ravi = await runReminderJobForUser("ravi", now);
    expect(amma).toMatchObject({ due: 2, created: 2 });
    expect(ravi).toMatchObject({ due: 2, created: 2 });
    expect(await ids("users/amma/notifications")).toEqual(["curd_EXPIRING_TODAY_2026-10-17", "milk_EXPIRING_SOON_2026-10-19"]);
    expect(await ids("users/ravi/notifications")).toEqual(["curd_EXPIRING_TODAY_2026-10-17", "milk_EXPIRING_SOON_2026-10-19"]);
    expect(await runReminderJobForUser("ravi", now)).toMatchObject({ created: 0, skippedDuplicates: 2 });
    // Someone outside the household is not reminded about its food.
    expect(await runReminderJobForUser("guest", now)).toMatchObject({ due: 0 });
  });

  it("only the owner can remove members or renew the code", async () => {
    await expect(h.removeHouseholdMember("ravi", "amma")).rejects.toThrow(/owner/);
    await expect(h.renewInviteCode("ravi")).rejects.toThrow(/owner/);
    await expect(h.removeHouseholdMember("amma", "guest")).rejects.toThrow(/not in your household/);
  });

  it("removing a member takes them out and changes the code so they cannot rejoin with it", async () => {
    await h.removeHouseholdMember("amma", "ravi");
    const snap = await db().collection("households").doc(householdId).get();
    expect(snap.get("memberIds")).toEqual(["amma"]);
    expect((await user("ravi").get()).get("householdId")).toBeUndefined();
    expect(snap.get("inviteCode")).not.toBe(code);
    await expect(h.joinHousehold("ravi", code)).rejects.toThrow(/not valid/);
    // The shared food stays with the household.
    expect(await ids(`households/${householdId}/products`)).toEqual(["curd", "milk"]);
    code = snap.get("inviteCode");
  });

  it("when the owner leaves, the next member becomes owner and the food stays", async () => {
    await h.joinHousehold("ravi", code);
    await h.leaveHousehold("amma");
    const snap = await db().collection("households").doc(householdId).get();
    expect(snap.get("ownerId")).toBe("ravi");
    expect(snap.get("memberIds")).toEqual(["ravi"]);
    expect(await ids("users/amma/products")).toEqual([]);
  });

  it("the last member to leave takes the food back and the household is closed", async () => {
    await h.leaveHousehold("ravi");
    expect((await db().collection("households").doc(householdId).get()).exists).toBe(false);
    expect((await db().collection("householdInvites").doc(code).get()).exists).toBe(false);
    expect(await ids("users/ravi/products")).toEqual(["curd", "milk"]);
    // Back on a personal list, reminders come from it again.
    const r = await runReminderJobForUser("ravi", now);
    expect(r.due).toBe(2);
  });
});
