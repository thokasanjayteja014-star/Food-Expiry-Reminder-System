/**
 * Scheduled reminder job: finds products approaching expiry, skips reminders that were
 * already recorded, sends push notifications and records the outcome.
 * Decisions come from the shared pure engine in lib/reminders.ts.
 */
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin";
import { isPushConfigured, sendPushToUser } from "./push";
import { accountEmail, appUrl, isEmailConfigured, reminderDigest, sendEmail, type EmailReminder } from "./email";
import { collectDueReminders, type ReminderProduct } from "../reminders";
import { todayISO } from "../dates";

export interface JobSummary {
  users: number;
  due: number;
  created: number;
  pushed: number;
  skippedDuplicates: number;
  emailed: number;
}

const ALREADY_EXISTS = 6; // gRPC status code returned by create() when the doc exists

export async function runReminderJobForUser(uid: string, now: Date = new Date()): Promise<JobSummary> {
  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const profile = await userRef.get();
  const timeZone = (profile.get("timeZone") as string | undefined) || "UTC";
  const today = todayISO(timeZone, now);

  // A household member is reminded about the shared list; each member gets their own copy.
  const householdId = profile.get("householdId");
  const productsRef =
    typeof householdId === "string" && householdId
      ? db.collection("households").doc(householdId).collection("products")
      : userRef.collection("products");
  const snap = await productsRef.where("status", "==", "ACTIVE").get();
  const products: ReminderProduct[] = snap.docs.map((d) => ({
    id: d.id,
    productName: d.get("productName"),
    expiryDate: d.get("expiryDate"),
    reminderDays: d.get("reminderDays"),
    status: d.get("status"),
  }));

  const due = collectDueReminders(products, { today });
  const summary: JobSummary = { users: 1, due: due.length, created: 0, pushed: 0, skippedDuplicates: 0, emailed: 0 };
  const forEmail: Array<EmailReminder & { ref: FirebaseFirestore.DocumentReference }> = [];

  for (const r of due) {
    const ref = userRef.collection("notifications").doc(r.key);
    try {
      // create() fails if the document exists: this is the duplicate-reminder guard.
      await ref.create({
        title: r.title,
        message: r.message,
        productId: r.productId,
        type: r.type,
        scheduledFor: today,
        sentAt: null,
        pushStatus: "not_attempted",
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      if ((error as { code?: number }).code === ALREADY_EXISTS) {
        summary.skippedDuplicates++;
        continue;
      }
      throw error;
    }
    summary.created++;
    forEmail.push({ title: r.title, message: r.message, url: r.url, ref });

    if (!isPushConfigured()) continue;
    const { sent, devices } = await sendPushToUser(uid, {
      title: `🔔 ${r.title}`,
      body: r.message,
      url: r.url,
      tag: r.key,
    });
    // Only claim "sent" if a push service actually accepted the message.
    await ref.update({
      pushStatus: sent > 0 ? "sent" : devices === 0 ? "no_subscription" : "failed",
      sentAt: sent > 0 ? FieldValue.serverTimestamp() : null,
    });
    if (sent > 0) summary.pushed++;
  }

  // One email a day listing every new reminder, to the account's own verified address.
  if (forEmail.length > 0 && isEmailConfigured() && profile.get("emailReminders") !== false) {
    const { email, verified } = await accountEmail(uid);
    let status: "sent" | "not_verified" | "failed" = "not_verified";
    if (email && verified) {
      try {
        const { subject, text, html } = reminderDigest((profile.get("name") as string | undefined) ?? "", forEmail, appUrl());
        await sendEmail(email, subject, text, html);
        status = "sent";
        summary.emailed = 1;
      } catch (error) {
        status = "failed";
        console.error("Reminder email failed", (error as Error).message);
      }
    }
    await Promise.all(forEmail.map((r) => r.ref.update({ emailStatus: status })));
  }
  return summary;
}

export async function runReminderJobForAllUsers(now: Date = new Date()): Promise<JobSummary> {
  const users = await adminDb().collection("users").select().get();
  const total: JobSummary = { users: 0, due: 0, created: 0, pushed: 0, skippedDuplicates: 0, emailed: 0 };
  for (const u of users.docs) {
    try {
      const s = await runReminderJobForUser(u.id, now);
      total.users++;
      total.due += s.due;
      total.created += s.created;
      total.pushed += s.pushed;
      total.skippedDuplicates += s.skippedDuplicates;
      total.emailed += s.emailed;
    } catch (error) {
      console.error(`Reminder job failed for a user`, error);
    }
  }
  return total;
}
