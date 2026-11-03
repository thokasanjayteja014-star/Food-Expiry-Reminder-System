/** Web Push delivery with VAPID (free, no third-party push account needed). */
import "server-only";
import { createHash } from "node:crypto";
import webpush, { type PushSubscription } from "web-push";
import { adminDb } from "./firebaseAdmin";

export function isPushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export function subscriptionId(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 40);
}

export function isValidSubscription(value: unknown): value is PushSubscription {
  const s = value as PushSubscription | null;
  return Boolean(
    s &&
      typeof s.endpoint === "string" &&
      /^https:\/\//.test(s.endpoint) &&
      s.endpoint.length < 1000 &&
      typeof s.keys?.p256dh === "string" &&
      typeof s.keys?.auth === "string",
  );
}

/**
 * Sends a push to every subscribed device of a user.
 * Expired subscriptions (404/410 from the push service) are removed.
 * Returns how many devices accepted the push.
 */
export async function sendPushToUser(uid: string, payload: PushPayload): Promise<{ sent: number; devices: number }> {
  configure();
  const subs = await adminDb().collection("users").doc(uid).collection("pushSubscriptions").get();
  let sent = 0;
  await Promise.all(
    subs.docs.map(async (doc) => {
      const sub = doc.get("subscription") as PushSubscription;
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: "normal" });
        sent++;
        await doc.ref.update({ lastSuccessAt: new Date() });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await doc.ref.delete();
        else console.error("Push failed", status, (error as Error).message);
      }
    }),
  );
  return { sent, devices: subs.size };
}
