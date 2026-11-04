"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Camera, ChevronRight, Clock, Package, PencilLine, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { useProfile } from "@/hooks/useProfile";
import { decorate, queryInventory } from "@/lib/inventory";
import { countByStatus, calculateUsageStats } from "@/lib/stats";
import { isExpiringSoon } from "@/lib/expiry";
import { todayISO } from "@/lib/dates";
import { StatCard } from "@/components/StatCard";
import { ExpiryCard } from "@/components/ExpiryCard";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Alert } from "@/components/Alert";
import { UsageStats } from "@/components/UsageStats";
import { NotificationPrompt } from "@/components/NotificationPrompt";

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { user, householdId } = useAuth();
  const { displayName } = useProfile();
  const { products, loading, error } = useProducts();
  const today = todayISO();

  const data = useMemo(() => {
    const counts = countByStatus(products, today);
    const active = queryInventory(products, { status: "ALL", sort: "expiry-asc" }, today);
    const expiringSoon = active.filter((i) => isExpiringSoon(i.status));
    const expired = active.filter((i) => i.status === "EXPIRED").reverse();
    // Items already listed under "Use these first" are not shown twice.
    const shown = new Set([...expired, ...expiringSoon].slice(0, 6).map((i) => i.product.id));
    const recent = decorate(products, today)
      .filter((i) => i.product.status === "ACTIVE" && !shown.has(i.product.id))
      .sort((a, b) => b.product.createdAt.localeCompare(a.product.createdAt))
      .slice(0, 4);
    return { counts, active, expiringSoon, expired, recent, stats: calculateUsageStats(products, today) };
  }, [products, today]);

  const firstName = (displayName || user?.name || "").split(" ")[0];

  const useFirst = [...data.expired, ...data.expiringSoon];
  const share = (n: number) => (data.counts.total ? n / data.counts.total : 0);

  return (
    <div className="space-y-6">
      <div className="animate-in">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {greeting(new Date().getHours())}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 text-sm muted">{headline(data.counts.expired, data.expiringSoon.length)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ActionCard href="/scan" Icon={Camera} title="Scan Product" text="Point the camera at the date" primary index={1} />
        <ActionCard href="/products/new" Icon={PencilLine} title="Add Manually" text="Type in the details" index={2} />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <LoadingSpinner label="Loading products..." />
      ) : (
        <>
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total products" value={data.counts.total} tone="neutral" Icon={Package} href="/inventory" index={3} />
            <StatCard label="Expiring soon" value={data.counts.expiringSoon} tone="soon" Icon={Clock} share={share(data.counts.expiringSoon)} href="/expiring" index={4} />
            <StatCard label="Expired" value={data.counts.expired} tone="expired" Icon={TriangleAlert} share={share(data.counts.expired)} href="/inventory?status=EXPIRED" index={5} />
            <StatCard label="Safe" value={data.counts.safe} tone="safe" Icon={ShieldCheck} share={share(data.counts.safe)} href="/inventory?status=SAFE" index={6} />
          </section>

          <NotificationPrompt />

          {products.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No products yet"
              description="Scan a food package or add one manually to start tracking expiry dates."
              action={
                <Link href="/scan" className="btn-primary">
                  <Camera aria-hidden className="size-4" /> Scan your first product
                </Link>
              }
            />
          ) : (
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <Section title="Use these first" href="/expiring" empty="Nothing is expiring in the next 7 days. Nice work.">
                  {useFirst.slice(0, 6).map((i, n) => (
                    <ExpiryCard key={i.product.id} item={i} index={n} />
                  ))}
                </Section>
              </div>
              <div className="space-y-6 lg:col-span-2">
                {data.recent.length > 0 && (
                  <Section title="Also in your list" href="/inventory?sort=recent" empty="" linkLabel={`View all ${data.active.length}`}>
                    {data.recent.map((i, n) => (
                      <ExpiryCard key={i.product.id} item={i} index={n} />
                    ))}
                  </Section>
                )}
                {!user?.isDemo && <FamilyShortcut inHousehold={!!householdId} />}
              </div>
            </div>
          )}

          {products.length > 0 && <UsageStats stats={data.stats} />}
        </>
      )}
    </div>
  );
}

function FamilyShortcut({ inHousehold }: { inHousehold: boolean }) {
  return (
    <Link href="/household" className="card card-hover animate-in group flex items-center gap-3 p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
        <Users aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{inHousehold ? "Family sharing" : "Share with your family"}</span>
        <span className="block text-xs muted">
          {inHousehold ? "Manage members and the invite code." : "One food list for everyone at home, with reminders for all."}
        </span>
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 muted transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function headline(expired: number, soon: number): string {
  if (expired && soon) return `${expired} expired and ${soon} expiring soon. Check them first.`;
  if (expired) return `${expired} item${expired === 1 ? " has" : "s have"} expired. Check before use.`;
  if (soon) return `${soon} item${soon === 1 ? " is" : "s are"} expiring this week.`;
  return "Everything in your kitchen is fresh.";
}

function ActionCard({
  href,
  Icon,
  title,
  text,
  primary = false,
  index,
}: {
  href: string;
  Icon: typeof Camera;
  title: string;
  text: string;
  primary?: boolean;
  index: number;
}) {
  return (
    <Link
      href={href}
      style={{ ["--i" as string]: index }}
      className={`animate-in group relative flex flex-col gap-3 overflow-hidden rounded-xl p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 active:scale-[0.98] ${
        primary
          ? "bg-brand-600 text-white shadow-[0_6px_20px_-10px_rgba(36,87,197,0.7)] hover:shadow-[0_10px_24px_-10px_rgba(36,87,197,0.8)]"
          : "card hover:shadow-[0_6px_20px_-8px_rgba(16,24,40,0.18)]"
      }`}
    >
      <span
        className={`flex size-9 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110 ${
          primary ? "bg-white/15" : "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
        }`}
      >
        <Icon aria-hidden className="size-[18px]" />
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className={`block text-xs ${primary ? "text-white/80" : "muted"}`}>{text}</span>
      </span>
    </Link>
  );
}

function Section({
  title,
  href,
  empty,
  linkLabel = "View all",
  children,
}: {
  title: string;
  href: string;
  empty: string;
  linkLabel?: string;
  children: React.ReactNode[];
}) {
  return (
    <section aria-label={title} className="animate-in" style={{ ["--i" as string]: 7 }}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="section-title">{title}</h2>
        <Link href={href} className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-200">
          {linkLabel}
        </Link>
      </div>
      {children.length > 0 ? (
        <ul className="card divide-y divide-[var(--border)] overflow-hidden">{children}</ul>
      ) : (
        <p className="card px-4 py-6 text-center text-sm muted">{empty}</p>
      )}
    </section>
  );
}
