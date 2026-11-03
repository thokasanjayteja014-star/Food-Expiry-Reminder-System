/**
 * Households (family sharing), managed only on the server with the Admin SDK so nobody can
 * add themselves to a household without its invite code.
 *
 * Data:
 *   households/{id}             { name, ownerId, memberIds, members: {uid: {name}}, inviteCode, createdAt }
 *   households/{id}/products    the shared food list
 *   householdInvites/{code}     { householdId }
 *   users/{uid}.householdId     which household's list the user sees
 *
 * Each member keeps their own notifications, so reminders reach every member once.
 */
import "server-only";
import { randomInt } from "node:crypto";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "./firebaseAdmin";

export const MAX_MEMBERS = 12;
/** No 0/O or 1/I/L, so codes are easy to read out and type. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

export class HouseholdError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function newInviteCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Upper-cases and strips spaces and dashes; null when it cannot be a code. */
export function normaliseCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

function cleanName(input: unknown, fallback: string): string {
  const name = typeof input === "string" ? input.trim().replace(/\s+/g, " ").slice(0, 40) : "";
  return name || fallback;
}

async function memberName(db: Firestore, uid: string): Promise<string> {
  const profile = await db.collection("users").doc(uid).get();
  const name = profile.get("name");
  if (typeof name === "string" && name.trim()) return name.trim().slice(0, 60);
  let email = profile.get("email");
  // Right after sign-up the profile may not have the name yet, so check the account too.
  try {
    const account = await adminAuth().getUser(uid);
    if (account.displayName?.trim()) return account.displayName.trim().slice(0, 60);
    email = email || account.email;
  } catch {
    // Fall back to what the profile has.
  }
  return typeof email === "string" && email ? email.split("@")[0]!.slice(0, 60) : "Member";
}

async function currentHousehold(db: Firestore, uid: string): Promise<string | null> {
  const id = (await db.collection("users").doc(uid).get()).get("householdId");
  return typeof id === "string" && id ? id : null;
}

/** Moves every product from one list to another, keeping ids so reminder links keep working. */
async function moveProducts(
  db: Firestore,
  from: FirebaseFirestore.CollectionReference,
  to: FirebaseFirestore.CollectionReference,
  addedBy?: { uid: string; name: string },
): Promise<number> {
  const snap = await from.get();
  // Each product is one write and one delete; batches hold up to 500 writes.
  for (let i = 0; i < snap.docs.length; i += 200) {
    const batch = db.batch();
    for (const d of snap.docs.slice(i, i + 200)) {
      const data = d.data();
      if (addedBy && !data.addedBy) {
        data.addedBy = addedBy.uid;
        data.addedByName = addedBy.name;
      }
      batch.set(to.doc(d.id), data);
      batch.delete(d.ref);
    }
    await batch.commit();
  }
  return snap.size;
}

async function createInvite(db: Firestore, householdId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newInviteCode();
    try {
      await db.collection("householdInvites").doc(code).create({ householdId, createdAt: FieldValue.serverTimestamp() });
      return code;
    } catch {
      // Code already taken: try another.
    }
  }
  throw new HouseholdError(500, "Could not create an invite code. Please try again.");
}

/** Creates a household with the user as owner and moves their food list into it. */
export async function createHousehold(uid: string, nameInput: unknown): Promise<{ householdId: string; inviteCode: string }> {
  const db = adminDb();
  if (await currentHousehold(db, uid)) throw new HouseholdError(409, "You are already in a household. Leave it first.");
  const name = await memberName(db, uid);
  const ref = db.collection("households").doc();
  const inviteCode = await createInvite(db, ref.id);
  await ref.set({
    name: cleanName(nameInput, `${name}'s home`),
    ownerId: uid,
    memberIds: [uid],
    members: { [uid]: { name } },
    inviteCode,
    createdAt: FieldValue.serverTimestamp(),
  });
  await moveProducts(db, db.collection("users").doc(uid).collection("products"), ref.collection("products"), { uid, name });
  await db.collection("users").doc(uid).set({ householdId: ref.id }, { merge: true });
  return { householdId: ref.id, inviteCode };
}

async function householdForCode(db: Firestore, codeInput: unknown): Promise<DocumentReference> {
  const code = normaliseCode(codeInput);
  if (!code) throw new HouseholdError(400, "Enter the 6-character invite code.");
  const invite = await db.collection("householdInvites").doc(code).get();
  const householdId = invite.get("householdId");
  if (!invite.exists || typeof householdId !== "string") throw new HouseholdError(404, "That invite code is not valid. Ask for a new one.");
  return db.collection("households").doc(householdId);
}

/** What the join screen shows before the user confirms. */
export async function previewInvite(codeInput: unknown): Promise<{ name: string; memberCount: number }> {
  const db = adminDb();
  const snap = await (await householdForCode(db, codeInput)).get();
  if (!snap.exists) throw new HouseholdError(404, "That household no longer exists.");
  return { name: snap.get("name"), memberCount: (snap.get("memberIds") as string[]).length };
}

/** Adds the user to the household for this code and moves their food list into it. */
export async function joinHousehold(uid: string, codeInput: unknown): Promise<{ householdId: string; name: string }> {
  const db = adminDb();
  const ref = await householdForCode(db, codeInput);
  const current = await currentHousehold(db, uid);
  if (current === ref.id) return { householdId: ref.id, name: (await ref.get()).get("name") };
  if (current) throw new HouseholdError(409, "You are already in a household. Leave it first.");
  const name = await memberName(db, uid);

  const householdName = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HouseholdError(404, "That household no longer exists.");
    const memberIds = snap.get("memberIds") as string[];
    if (memberIds.length >= MAX_MEMBERS) throw new HouseholdError(409, `A household can have up to ${MAX_MEMBERS} members.`);
    tx.update(ref, { memberIds: FieldValue.arrayUnion(uid), [`members.${uid}`]: { name } });
    return snap.get("name") as string;
  });
  await moveProducts(db, db.collection("users").doc(uid).collection("products"), ref.collection("products"), { uid, name });
  await db.collection("users").doc(uid).set({ householdId: ref.id }, { merge: true });
  return { householdId: ref.id, name: householdName };
}

/**
 * Takes a member out of a household. The shared food stays with the household; the last
 * member to leave takes the food back to their own list and the household is deleted.
 */
async function removeMember(db: Firestore, householdId: string, uid: string): Promise<void> {
  const ref = db.collection("households").doc(householdId);
  const last = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const remaining = (snap.get("memberIds") as string[]).filter((m) => m !== uid);
    if (remaining.length === 0) return true;
    const ownerId = snap.get("ownerId") === uid ? remaining[0] : snap.get("ownerId");
    tx.update(ref, { memberIds: remaining, [`members.${uid}`]: FieldValue.delete(), ownerId });
    return false;
  });
  await db.collection("users").doc(uid).set({ householdId: FieldValue.delete() }, { merge: true });
  if (last) {
    await moveProducts(db, ref.collection("products"), db.collection("users").doc(uid).collection("products"));
    const code = (await ref.get()).get("inviteCode");
    if (typeof code === "string") await db.collection("householdInvites").doc(code).delete();
    await db.recursiveDelete(ref);
  }
}

export async function leaveHousehold(uid: string): Promise<void> {
  const db = adminDb();
  const householdId = await currentHousehold(db, uid);
  if (!householdId) return;
  await removeMember(db, householdId, uid);
}

async function ownedHousehold(db: Firestore, uid: string): Promise<DocumentReference> {
  const householdId = await currentHousehold(db, uid);
  if (!householdId) throw new HouseholdError(404, "You are not in a household.");
  const ref = db.collection("households").doc(householdId);
  if ((await ref.get()).get("ownerId") !== uid) throw new HouseholdError(403, "Only the household owner can do this.");
  return ref;
}

/** The owner removes another member. The invite code changes too, so they cannot just rejoin. */
export async function removeHouseholdMember(uid: string, memberId: unknown): Promise<void> {
  const db = adminDb();
  if (typeof memberId !== "string" || !memberId || memberId === uid) throw new HouseholdError(400, "Choose a member to remove.");
  const ref = await ownedHousehold(db, uid);
  if (!((await ref.get()).get("memberIds") as string[]).includes(memberId)) throw new HouseholdError(404, "That person is not in your household.");
  await removeMember(db, ref.id, memberId);
  await renewInviteCode(uid);
}

/** The owner replaces the invite code, so old links stop working. */
export async function renewInviteCode(uid: string): Promise<string> {
  const db = adminDb();
  const ref = await ownedHousehold(db, uid);
  const old = (await ref.get()).get("inviteCode");
  const inviteCode = await createInvite(db, ref.id);
  await ref.update({ inviteCode });
  if (typeof old === "string") await db.collection("householdInvites").doc(old).delete();
  return inviteCode;
}

export async function renameHousehold(uid: string, nameInput: unknown): Promise<void> {
  const db = adminDb();
  const ref = await ownedHousehold(db, uid);
  await ref.update({ name: cleanName(nameInput, (await ref.get()).get("name")) });
}

/** Keeps the member's name on the household in step with their profile name. */
export async function syncMemberName(uid: string): Promise<void> {
  const db = adminDb();
  const householdId = await currentHousehold(db, uid);
  if (!householdId) return;
  await db.collection("households").doc(householdId).update({ [`members.${uid}`]: { name: await memberName(db, uid) } });
}
