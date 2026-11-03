"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { useNotifications } from "@/hooks/useNotifications";
import { runInAppReminderCheck } from "@/lib/notifications";

/**
 * Runs the in-app reminder check once per session after products and notifications load.
 * Server-side cron delivers push reminders when the app is closed; this covers the
 * case where no scheduler is configured, and demo mode.
 */
export function ReminderRunner() {
  const { repo } = useAuth();
  const { products, loading } = useProducts();
  const { items, loading: notifLoading } = useNotifications();
  const ran = useRef(false);

  useEffect(() => {
    if (!repo || loading || notifLoading || ran.current) return;
    ran.current = true;
    runInAppReminderCheck(repo, products, items).catch((e) => console.warn("Reminder check failed", e));
  }, [repo, products, items, loading, notifLoading]);

  return null;
}
