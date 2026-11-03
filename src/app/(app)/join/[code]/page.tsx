"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { joinHousehold, previewInvite } from "@/lib/household";
import { PageHeader } from "@/components/PageHeader";
import { Alert } from "@/components/Alert";
import { LoadingSpinner } from "@/components/LoadingSpinner";

/** Opened from an invite link (/join/ABC234). Login is required first (AuthGuard keeps this URL). */
export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const { user, householdId } = useAuth();
  const [preview, setPreview] = useState<{ name: string; memberCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (user?.isDemo) return;
    let cancelled = false;
    void previewInvite(code).then((r) => {
      if (cancelled) return;
      if (r.ok) setPreview({ name: r.name, memberCount: r.memberCount });
      else setError(r.message);
    });
    return () => {
      cancelled = true;
    };
  }, [code, user?.isDemo]);

  async function join() {
    setJoining(true);
    setError(null);
    const r = await joinHousehold(code);
    setJoining(false);
    if (r.ok) router.replace("/household");
    else setError(r.message);
  }

  return (
    <>
      <PageHeader title="Join a household" />
      <div className="card max-w-lg p-5">
        {user?.isDemo ? (
          <Alert tone="info">Family sharing needs a real account. Exit demo mode, then sign up or log in and open the link again.</Alert>
        ) : error ? (
          <Alert tone="error">{error}</Alert>
        ) : !preview ? (
          <LoadingSpinner label="Checking the invite..." />
        ) : householdId ? (
          <Alert tone="info">
            You are already in a household. To join {preview.name}, first leave yours under{" "}
            <Link href="/household" className="underline">Family sharing</Link>.
          </Alert>
        ) : (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-lg font-semibold">
              <Users aria-hidden className="size-5 text-brand-600" /> {preview.name}
            </p>
            <p className="text-sm muted">
              {preview.memberCount} member{preview.memberCount === 1 ? "" : "s"}. You will share one food list and everyone gets the expiry
              reminders. Your current items move into this household.
            </p>
            <button type="button" className="btn-primary" onClick={join} disabled={joining}>
              {joining && <Loader2 aria-hidden className="size-4 animate-spin" />} Join {preview.name}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
