"use client";

import Link from "next/link";
import { Bell, Check, CheckCheck } from "lucide-react";
import type { AppNotification } from "@/types/notification";
import { formatTimestamp } from "@/lib/dates";

const DELIVERY: Record<AppNotification["pushStatus"], string> = {
  sent: "Push sent",
  local: "Shown on this device",
  no_subscription: "In-app only (no device subscribed)",
  failed: "Push delivery failed",
  not_attempted: "In-app only",
};

export function NotificationCard({ n, onRead }: { n: AppNotification; onRead: (id: string) => void }) {
  return (
    <li className={`card animate-in relative flex gap-3 overflow-hidden p-4 transition-[opacity,box-shadow] duration-300 hover:shadow-[0_6px_20px_-8px_rgba(16,24,40,0.15)] ${n.read ? "opacity-75" : ""}`}>
      {!n.read && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-brand-500" />}
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
          n.read ? "bg-[var(--surface-2)] muted" : "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
        }`}
      >
        {n.read ? <Check aria-hidden className="size-4" /> : <Bell aria-hidden className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${n.read ? "" : "font-medium"}`}>{n.message}</p>
        <p className="mt-1 text-xs muted">
          {formatTimestamp(n.createdAt)} · {DELIVERY[n.pushStatus]}
          {!n.read && <span className="sr-only"> · Unread</span>}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {n.productId && (
            <Link href={`/products/${n.productId}`} className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-200">
              View product
            </Link>
          )}
          {!n.read && (
            <button type="button" onClick={() => onRead(n.id)} className="inline-flex items-center gap-1 text-sm font-medium muted hover:underline">
              <CheckCheck aria-hidden className="size-4" />
              Mark as read
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
