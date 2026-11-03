"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActive } from "./navItems";

/** Mobile bottom tab bar: Home, Scan, Inventory, Alerts, Profile. */
export function BottomNavigation({ unread }: { unread: number }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      className="fixed inset-x-3 z-40 mx-auto max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)]/90 shadow-[0_10px_30px_-12px_rgba(16,24,40,0.35)] backdrop-blur-md lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {NAV_ITEMS.filter((i) => i.mobile).map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          const isScan = href === "/scan";
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-[3.75rem] flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                  active ? "text-brand-700 font-semibold dark:text-brand-200" : "muted"
                }`}
              >
                {isScan ? (
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-[0_4px_12px_-4px_rgba(3,152,85,0.6)] transition-transform duration-150 active:scale-90">
                    <Icon aria-hidden className="size-5" />
                  </span>
                ) : (
                  <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200 ${active ? "bg-brand-50 dark:bg-brand-900/40" : ""}`}>
                    <Icon aria-hidden className={`size-5 transition-transform duration-200 ${active ? "scale-110" : ""}`} />
                  </span>
                )}
                <span>{label}</span>
                {href === "/notifications" && unread > 0 && (
                  <span className="absolute right-[calc(50%-20px)] top-2 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
                    {unread > 9 ? "9+" : unread}
                    <span className="sr-only"> unread</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
