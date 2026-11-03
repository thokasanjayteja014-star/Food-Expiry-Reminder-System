"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2, Send } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  getPermissionState,
  hasPushSubscription,
  isIosNotInstalled,
  requestPermission,
  sendTestNotification,
  subscribeToPush,
  unsubscribeFromPush,
  type PermissionState,
} from "@/lib/notifications";
import { Alert } from "./Alert";

type State = { permission: PermissionState; subscribed: boolean; checked: boolean };

/**
 * "Enable expiry reminders". Permission is requested only when the user clicks,
 * never automatically, and never again once denied.
 * `variant="dashboard"` hides itself when everything is already set up.
 */
export function NotificationPrompt({ variant = "dashboard" }: { variant?: "dashboard" | "settings" }) {
  const { user, repo } = useAuth();
  const [state, setState] = useState<State>({ permission: "default", subscribed: false, checked: false });
  const [busy, setBusy] = useState<"enable" | "test" | "disable" | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const isDemo = Boolean(user?.isDemo);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const permission = getPermissionState();
      const subscribed = permission === "granted" && !isDemo ? await hasPushSubscription().catch(() => false) : false;
      if (!cancelled) setState({ permission, subscribed, checked: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [isDemo]);

  const ready = state.permission === "granted" && (isDemo || state.subscribed);

  async function enable() {
    setBusy("enable");
    setResult(null);
    if (isDemo) {
      const permission = await requestPermission();
      setState((s) => ({ ...s, permission }));
      await repo?.updateProfile({ notificationsEnabled: permission === "granted" }).catch(() => {});
      setResult(
        permission === "granted"
          ? { ok: true, message: "Reminders will appear on this device while the app is open (demo mode)." }
          : null,
      );
    } else {
      const res = await subscribeToPush();
      const permission = getPermissionState();
      setState({ permission, subscribed: res.ok, checked: true });
      if (res.ok) {
        await repo?.updateProfile({ notificationsEnabled: true }).catch(() => {});
        setResult({ ok: true, message: "Expiry reminders are on for this device." });
      } else if (res.reason !== "denied") {
        setResult({ ok: false, message: res.message });
      }
    }
    setBusy(null);
  }

  async function disable() {
    setBusy("disable");
    try {
      await unsubscribeFromPush();
      setState((s) => ({ ...s, subscribed: false }));
      await repo?.updateProfile({ notificationsEnabled: false }).catch(() => {});
      setResult({ ok: true, message: "Push reminders are off for this device." });
    } catch {
      setResult({ ok: false, message: "We couldn't turn off reminders. Please try again." });
    }
    setBusy(null);
  }

  async function test() {
    if (!repo) return;
    setBusy("test");
    setResult(await sendTestNotification(isDemo, repo));
    setBusy(null);
  }

  if (!state.checked) return null;
  if (variant === "dashboard" && (ready || state.permission === "denied" || state.permission === "unsupported")) {
    return null;
  }

  return (
    <section aria-labelledby="notif-title" className={variant === "dashboard" ? "card border-brand-200 p-5 dark:border-brand-800" : ""}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
          {ready ? <BellRing aria-hidden className="size-5" /> : state.permission === "denied" ? <BellOff aria-hidden className="size-5" /> : <Bell aria-hidden className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="notif-title" className="font-semibold">
            {ready ? "Expiry reminders are on" : "Enable expiry reminders"}
          </h2>
          <p className="mt-1 text-sm muted">
            Permission: <strong>{PERMISSION_LABEL[state.permission]}</strong>
            {!isDemo && state.permission === "granted" && <> · This device: <strong>{state.subscribed ? "subscribed" : "not subscribed"}</strong></>}
          </p>
          {!ready && state.permission === "default" && (
            <p className="mt-1 text-sm muted">Get a notification on this device a few days before your food expires.</p>
          )}
        </div>
      </div>

      {state.permission === "denied" && (
        <Alert tone="warning" className="mt-3">Notifications are disabled. You can enable them from your browser settings.</Alert>
      )}
      {state.permission === "unsupported" && (
        <Alert tone="info" className="mt-3">
          This browser does not support notifications.
          {isIosNotInstalled() && " On iPhone, add this site to your Home Screen (Share › Add to Home Screen) and open it from there to enable notifications."}
        </Alert>
      )}
      {result && (
        <Alert tone={result.ok ? "success" : "error"} className="mt-3">
          {result.message}
        </Alert>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!ready && state.permission !== "denied" && state.permission !== "unsupported" && (
          <button type="button" className="btn-primary" onClick={enable} disabled={busy !== null}>
            {busy === "enable" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Bell aria-hidden className="size-4" />}
            Enable Notifications
          </button>
        )}
        {variant === "settings" && (
          <button type="button" className="btn-secondary" onClick={test} disabled={busy !== null || !ready}>
            {busy === "test" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4" />}
            Send Test Notification
          </button>
        )}
        {variant === "settings" && !isDemo && state.subscribed && (
          <button type="button" className="btn-ghost" onClick={disable} disabled={busy !== null}>
            Turn off on this device
          </button>
        )}
      </div>
      {variant === "settings" && !ready && state.permission !== "denied" && (
        <p className="mt-2 text-xs muted">Enable notifications first to send a test.</p>
      )}
    </section>
  );
}

const PERMISSION_LABEL: Record<PermissionState, string> = {
  default: "Not requested",
  granted: "Granted",
  denied: "Denied",
  unsupported: "Not supported",
};
