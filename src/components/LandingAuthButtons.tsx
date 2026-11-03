"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FlaskConical, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function LandingAuthButtons() {
  const { status, demoAllowed, enterDemo } = useAuth();
  const router = useRouter();
  if (status === "authenticated") {
    return (
      <div className="mt-8">
        <Link href="/dashboard" className="btn-primary px-6 text-base">
          <LayoutDashboard aria-hidden className="size-5" />
          Go to Dashboard
        </Link>
      </div>
    );
  }
  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <Link href="/register" className="btn-primary group px-6 text-base">
        Get started free
        <ArrowRight aria-hidden className="size-5 transition-transform group-hover:translate-x-0.5" />
      </Link>
      {demoAllowed && (
        <button
          type="button"
          className="btn-ghost px-4 text-base"
          onClick={() => {
            enterDemo();
            router.push("/dashboard");
          }}
        >
          <FlaskConical aria-hidden className="size-5" />
          Try the demo
        </button>
      )}
    </div>
  );
}
