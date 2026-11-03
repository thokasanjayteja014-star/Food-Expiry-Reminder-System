"use client";

import { useState } from "react";
import Link from "next/link";
import { BellOff, CheckCheck, Loader2, RefreshCw, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { useProducts } from "@/hooks/useProducts";
import { checkRemindersNow } from "@/lib/notifications";
import { PageHeader } from "@/components/PageHeader";
import { NotificationCard } from "@/components/NotificationCard";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Alert } from "@/components/Alert";

export default function NotificationsPage() {
  const { repo, user } = useAuth();
  const { items, loading, error, unreadCount } = useNotifications();
  const { products } = useProducts();
  const [actionError, setActionError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function checkNow() {
    if (!repo) return;
    setChecking(true);
    setCheckResult(await checkRemindersNow(Boolean(user?.isDemo), repo, products, items));
    setChecking(false);
  }
  const unread = items.filter((n) => !n.read);
  const read = items.filter((n) => n.read);

  async function markRead(id: string) {
    setActionError(null);
    try {
      await repo?.markNotificationRead(id);
    } catch {
      setActionError("We couldn't update this notification. Please try again.");
    }
  }

  async function markAll() {
    setActionError(null);
    try {
      await repo?.markAllNotificationsRead(unread.map((n) => n.id));
    } catch {
      setActionError("We couldn't update your notifications. Please try again.");
    }
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Expiry reminders for your products."
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={checkNow} disabled={checking}>
              {checking ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <RefreshCw aria-hidden className="size-4" />}
              Check reminders now
            </button>
            {unreadCount > 0 && (
              <button type="button" className="btn-secondary" onClick={markAll}>
                <CheckCheck aria-hidden className="size-4" /> Mark all as read
              </button>
            )}
            <Link href="/settings#notifications" className="btn-ghost">
              <Settings aria-hidden className="size-4" /> Settings
            </Link>
          </>
        }
      />
      {checkResult && <Alert tone={checkResult.ok ? "success" : "error"} className="mb-4">{checkResult.message}</Alert>}
      {(error || actionError) && <Alert tone="error" className="mb-4">{error ?? actionError}</Alert>}
      {loading ? (
        <LoadingSpinner label="Loading notifications..." />
      ) : items.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="No notifications yet"
          description="When a product is close to expiry, a reminder will appear here. You can send a test notification from Settings."
        />
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="unread-h">
            <h2 id="unread-h" className="mb-2 font-semibold">Unread ({unread.length})</h2>
            {unread.length ? (
              <ul className="space-y-2">{unread.map((n) => <NotificationCard key={n.id} n={n} onRead={markRead} />)}</ul>
            ) : (
              <p className="text-sm muted">You&apos;re all caught up.</p>
            )}
          </section>
          {read.length > 0 && (
            <section aria-labelledby="read-h">
              <h2 id="read-h" className="mb-2 font-semibold">Read</h2>
              <ul className="space-y-2">{read.map((n) => <NotificationCard key={n.id} n={n} onRead={markRead} />)}</ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
