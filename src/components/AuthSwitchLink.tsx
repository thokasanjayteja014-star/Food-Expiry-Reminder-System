"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

/** Link between Login and Register that keeps ?next, so an invite link still opens after signing up. */
export function AuthSwitchLink({ href, children }: { href: "/login" | "/register"; children: ReactNode }) {
  const next = useSearchParams().get("next");
  const target = next && next.startsWith("/") && !next.startsWith("//") ? `${href}?next=${encodeURIComponent(next)}` : href;
  return (
    <Link href={target} className="font-semibold text-royal hover:underline">
      {children}
    </Link>
  );
}
