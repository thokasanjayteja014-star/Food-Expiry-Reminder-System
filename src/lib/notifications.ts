/**
 * Browser-side notification logic: permission, push subscription, test notifications
 * and the in-app reminder check that runs whenever the app is open.
 */
import type { Product } from "@/types/product";
import type { AppNotification } from "@/types/notification";
import type { DataRepository } from "./repository";
import { collectDueReminders, REMINDER_TITLE } from "./reminders";
import { todayISO } from "./dates";
import { getIdToken } from "./auth";

export type PermissionState = "unsupported" | "default" | "granted" | "denied";

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

export function isPushSupported(): boolean {
  return isNotificationSupported() && "PushManager" in window;
}

export function getPermissionState(): PermissionState {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission as PermissionState;
}

/** iOS only allows web push for apps added to the Home Screen (iOS 16.4+). */
export function isIosNotInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

export async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/service-worker.js"));
  } catch {
    return null;
  }
}

/** Asks for permission once, only after the user clicks "Enable Notifications". */
export async function requestPermission(): Promise<PermissionState> {
  if (!isNotificationSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission as PermissionState;
  const result = await Notification.requestPermission();
  return result as PermissionState;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "denied" | "not-configured" | "server" | "failed"; message: string };

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getIdToken();
  if (!token) throw new Error("Not signed in");
  return fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
}

/** Creates a Push API subscription and stores it on the server for this user. */
export async function subscribeToPush(): Promise<SubscribeResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: "unsupported", message: "This browser does not support push notifications." };
  }
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, reason: "not-configured", message: "Push notifications are not configured on this server yet." };
  }
  const permission = await requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "denied", message: "Notifications are disabled. Please enable them in your browser settings." };
  }
  try {
    const reg = await getRegistration();
    if (!reg) {
      return {
        ok: false,
        reason: "failed",
        message: window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1"
          ? "This browser blocked the background worker, usually because the site's HTTPS certificate is not trusted. Push works on http://localhost or on the deployed (Vercel) site. Email reminders still work."
          : "This browser could not start the background worker needed for push notifications. Email reminders still work.",
      };
    }
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const res = await authedFetch("/api/notifications/subscribe", {
      method: "POST",
      body: JSON.stringify({ subscription: sub.toJSON(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, reason: "server", message: body.error ?? "We couldn't turn on reminders. Please try again." };
    }
    return { ok: true };
  } catch (error) {
    console.error("Push subscription failed", error);
    return { ok: false, reason: "failed", message: "We couldn't turn on reminders on this device. Please try again." };
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  const reg = await getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  try {
    await authedFetch("/api/notifications/subscribe", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } finally {
    await sub.unsubscribe();
  }
}

export async function hasPushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(await reg?.pushManager.getSubscription());
}

/** Shows a notification through the service worker (works on Android, where `new Notification()` does not). */
export async function showLocalNotification(title: string, body: string, url = "/dashboard"): Promise<boolean> {
  if (getPermissionState() !== "granted") return false;
  const reg = await getRegistration();
  if (!reg) return false;
  await reg.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    data: { url },
    tag: url,
  });
  return true;
}

export type TestResult = { ok: boolean; message: string };

/**
 * "Send Test Notification".
 * Signed-in users: the server sends a real Web Push to this user's subscribed devices.
 * Demo mode: no server is involved, so a local notification is shown and labelled as such.
 */
export async function sendTestNotification(isDemo: boolean, repo: DataRepository): Promise<TestResult> {
  const message = "This is a test notification.";
  if (isDemo) {
    if (getPermissionState() !== "granted") {
      const p = await requestPermission();
      if (p !== "granted") return { ok: false, message: "Notifications are disabled. Please enable them in your browser settings." };
    }
    const shown = await showLocalNotification(`🔔 ${REMINDER_TITLE}`, message, "/notifications");
    if (!shown) return { ok: false, message: "This browser could not show the notification." };
    await repo.createNotificationOnce(buildNotification(`test-${Date.now()}`, "TEST", message, null, "local"));
    return { ok: true, message: "Local test notification shown (demo mode does not use the push server)." };
  }
  try {
    const res = await authedFetch("/api/notifications/test", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { sent?: number; error?: string };
    if (!res.ok) return { ok: false, message: body.error ?? "We couldn't send the test notification." };
    return { ok: true, message: `Test notification sent to ${body.sent} device${body.sent === 1 ? "" : "s"}.` };
  } catch {
    return { ok: false, message: "We couldn't reach the server. Please check your connection." };
  }
}

export function buildNotification(
  id: string,
  type: AppNotification["type"],
  message: string,
  productId: string | null,
  pushStatus: AppNotification["pushStatus"],
): AppNotification {
  return {
    id,
    title: REMINDER_TITLE,
    message,
    productId,
    type,
    scheduledFor: todayISO(),
    sentAt: null,
    pushStatus,
    read: false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * In-app reminder check, run when the app opens. It works without any server
 * (useful on free hosting without cron, and in demo mode): due reminders are written
 * to the notification centre and, if permission is granted, shown on this device.
 * It shares reminder ids with the server job, so the two never duplicate each other.
 */
export async function runInAppReminderCheck(
  repo: DataRepository,
  products: Product[],
  existing: AppNotification[],
): Promise<number> {
  const due = collectDueReminders(products, {
    today: todayISO(),
    alreadySent: new Set(existing.map((n) => n.id)),
  });
  let created = 0;
  for (const r of due) {
    const canShow = getPermissionState() === "granted";
    const n = buildNotification(r.key, r.type, r.message, r.productId, canShow ? "local" : "not_attempted");
    const isNew = await repo.createNotificationOnce(n).catch(() => false);
    if (!isNew) continue;
    created++;
    if (canShow) await showLocalNotification(`🔔 ${r.title}`, r.message, r.url).catch(() => false);
  }
  return created;
}

/**
 * "Check reminders now". Signed-in users ask the server, which sends real push
 * notifications; demo mode runs the same engine in the browser.
 */
export async function checkRemindersNow(
  isDemo: boolean,
  repo: DataRepository,
  products: Product[],
  existing: AppNotification[],
): Promise<TestResult> {
  if (isDemo) {
    const created = await runInAppReminderCheck(repo, products, existing);
    return { ok: true, message: created ? `${created} new reminder${created > 1 ? "s" : ""} created.` : "No new reminders are due today." };
  }
  try {
    const res = await authedFetch("/api/reminders/check", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { created?: number; pushed?: number; error?: string };
    if (!res.ok) {
      // Fall back to the in-app check so the user still sees due reminders.
      const created = await runInAppReminderCheck(repo, products, existing);
      return { ok: created > 0, message: `${body.error ?? "The reminder server is unavailable."} ${created ? `${created} reminder(s) were added in the app instead.` : ""}`.trim() };
    }
    if (!body.created) return { ok: true, message: "No new reminders are due today." };
    return { ok: true, message: `${body.created} new reminder${body.created > 1 ? "s" : ""}; push sent for ${body.pushed ?? 0}.` };
  } catch {
    return { ok: false, message: "We couldn't reach the server. Please check your connection." };
  }
}

export type TestEmailResult = { ok: true; email: string; verificationSent: boolean } | { ok: false; message: string };

/** Sends a test reminder email to the signed-in user (or a verification link if needed). */
export async function sendTestEmail(): Promise<TestEmailResult> {
  try {
    const res = await authedFetch("/api/notifications/test-email", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { error?: string; email?: string; verificationSent?: boolean };
    if (!res.ok) return { ok: false, message: body.error ?? "The email could not be sent. Please try again." };
    return { ok: true, email: body.email ?? "", verificationSent: Boolean(body.verificationSent) };
  } catch {
    return { ok: false, message: "The email could not be sent. Please check your connection and try again." };
  }
}
