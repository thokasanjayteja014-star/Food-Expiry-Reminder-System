"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { BottomNavigation } from "./BottomNavigation";
import { Sidebar } from "./Sidebar";
import { LogoMark } from "./Logo";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { ReminderRunner } from "./ReminderRunner";
import { Avatar } from "./Avatar";

/** Layout for signed-in pages: sidebar on desktop, bottom navigation on mobile. */
export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const pathname = usePathname();
  return (
    <div className="flex min-h-dvh">
      <Sidebar unread={unreadCount} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)]/90 px-4 backdrop-blur-md lg:hidden">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-tight">
            <LogoMark className="size-7 shrink-0" />
            <span className="whitespace-nowrap">Food Expiry Reminder</span>
          </Link>
          <span className="flex items-center gap-2">
            {user?.isDemo && <DemoPill />}
            <Link href="/settings" aria-label="Profile and settings" className="press">
              <Avatar name={user?.name || user?.email || "?"} />
            </Link>
          </span>
        </header>
        {user?.isDemo && (
          <div className="hidden justify-end px-8 pt-4 lg:flex">
            <DemoPill />
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-6">
          <div key={pathname} className="animate-page">
            {children}
          </div>
        </main>
      </div>
      <BottomNavigation unread={unreadCount} />
      <ReminderRunner />
    </div>
  );
}

function DemoPill() {
  return (
    <Link
      href="/settings"
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-100"
    >
      <FlaskConical aria-hidden className="size-3.5" />
      Demo
    </Link>
  );
}
