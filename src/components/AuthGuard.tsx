"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { FullPageLoader } from "./LoadingSpinner";

/** Protects user pages: unauthenticated visitors are sent to Login. */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  if (status !== "authenticated") return <FullPageLoader label={status === "loading" ? "Loading..." : "Redirecting to login..."} />;
  return <>{children}</>;
}
