"use client";

import { useMemo } from "react";
import { PartyPopper } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import { queryInventory } from "@/lib/inventory";
import { isExpiringSoon } from "@/lib/expiry";
import { todayISO } from "@/lib/dates";
import { PageHeader } from "@/components/PageHeader";
import { ProductList } from "@/components/ProductList";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Alert } from "@/components/Alert";

export default function ExpiringPage() {
  const { products, loading, error } = useProducts();
  const { soon, expired } = useMemo(() => {
    const active = queryInventory(products, { status: "ALL", sort: "expiry-asc" }, todayISO());
    return {
      soon: active.filter((i) => isExpiringSoon(i.status)),
      expired: active.filter((i) => i.status === "EXPIRED").reverse(),
    };
  }, [products]);

  return (
    <>
      <PageHeader title="Expiring soon" description="Products expiring today or within the next 7 days. Use these first." />
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? (
        <LoadingSpinner label="Loading products..." />
      ) : (
        <div className="space-y-8">
          {soon.length === 0 ? (
            <EmptyState icon={PartyPopper} title="Nothing expiring this week" description="All your tracked food has more than 7 days left." />
          ) : (
            <ProductList items={soon} />
          )}
          {expired.length > 0 && (
            <section aria-labelledby="expired-h">
              <h2 id="expired-h" className="mb-1 section-title">Already expired</h2>
              <p className="mb-3 text-sm muted">Check these before use, then mark them as consumed or discarded.</p>
              <ProductList items={expired} />
            </section>
          )}
        </div>
      )}
    </>
  );
}
