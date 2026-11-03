"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { Logo } from "./Logo";
import { NAV_ITEMS, isActive } from "./navItems";
import { useAuth } from "@/hooks/useAuth";

/** Desktop sidebar navigation. */
export function Sidebar({ unread }: { unread: number }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] p-3 lg:flex">
      <div className="px-2 py-2">
        <Logo href="/dashboard" />
      </div>
      <nav aria-label="Main" className="mt-4 flex-1">
        <ul className="space-y-1">
          {NAV_ITEMS.map(({ href, desktopLabel, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                    active
                      ? "bg-[var(--surface-2)] text-[var(--text)]"
                      : "muted hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                  }`}
                >
                  <Icon aria-hidden className={`size-[18px] ${active ? "text-brand-600" : ""}`} />
                  <span className="flex-1">{desktopLabel}</span>
                  {href === "/notifications" && unread > 0 && (
                    <span className="rounded-full bg-red-600 px-2 text-xs font-bold text-white">
                      {unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-[var(--border)] pt-4">
        <p className="truncate px-3 text-sm font-medium">{user?.name || "Signed in"}</p>
        <p className="truncate px-3 text-xs muted">{user?.isDemo ? "Demo mode (local data)" : user?.email}</p>
        <button type="button" onClick={() => void logout()} className="btn-ghost mt-2 w-full justify-start">
          <LogOut aria-hidden className="size-4" />
          {user?.isDemo ? "Exit demo" : "Log out"}
        </button>
      </div>
    </aside>
  );
}
