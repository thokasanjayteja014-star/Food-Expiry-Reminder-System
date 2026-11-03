"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Camera, PackageSearch, Search, X } from "lucide-react";
import { CATEGORIES, type Category } from "@/types/product";
import { useProducts } from "@/hooks/useProducts";
import { queryInventory, SORT_LABELS, STATUS_FILTERS, type SortOption, type StatusFilter } from "@/lib/inventory";
import { todayISO } from "@/lib/dates";
import { ProductList } from "./ProductList";
import { EmptyState } from "./EmptyState";
import { LoadingSpinner } from "./LoadingSpinner";
import { Alert } from "./Alert";

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function InventoryView() {
  const params = useSearchParams();
  const { products, loading, error } = useProducts();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState<StatusFilter>(
    pick(params.get("status"), STATUS_FILTERS.map((f) => f.value), "ALL"),
  );
  const [category, setCategory] = useState<Category | "ALL">(pick<Category | "ALL">(params.get("category"), ["ALL", ...CATEGORIES], "ALL"));
  const [sort, setSort] = useState<SortOption>(pick(params.get("sort"), Object.keys(SORT_LABELS) as SortOption[], "expiry-asc"));

  const items = useMemo(
    () => queryInventory(products, { search, status, category, sort }, todayISO()),
    [products, search, status, category, sort],
  );

  const filtered = search || status !== "ALL" || category !== "ALL";

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="relative">
          <label htmlFor="inv-search" className="sr-only">
            Search by product name or category
          </label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 muted" />
          <input
            id="inv-search"
            type="search"
            className="input pl-10"
            placeholder="Search products, e.g. milk"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div role="group" aria-label="Filter by status" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={status === f.value}
              onClick={() => setStatus(f.value)}
              className={`chip ${
                status === f.value
                  ? "border-[var(--text)] bg-[var(--text)] text-[var(--surface)]"
                  : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="inv-category" className="label text-xs">
              Category
            </label>
            <select id="inv-category" className="input text-sm" value={category} onChange={(e) => setCategory(e.target.value as Category | "ALL")}>
              <option value="ALL">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="inv-sort" className="label text-xs">
              Sort by
            </label>
            <select id="inv-sort" className="input text-sm" value={sort} onChange={(e) => setSort(e.target.value as SortOption)}>
              {(Object.keys(SORT_LABELS) as SortOption[]).map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <LoadingSpinner label="Loading products..." />
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={PackageSearch}
            title="No matching products"
            description="Try a different search or filter."
            action={
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setSearch("");
                  setStatus("ALL");
                  setCategory("ALL");
                }}
              >
                <X aria-hidden className="size-4" /> Clear filters
              </button>
            }
          />
        ) : (
          <EmptyState
            icon={PackageSearch}
            title="Your inventory is empty"
            description="Scan a package or add a product manually."
            action={
              <Link href="/scan" className="btn-primary">
                <Camera aria-hidden className="size-4" /> Scan Product
              </Link>
            }
          />
        )
      ) : (
        <>
          <div className="flex items-center justify-between text-xs muted">
            <p aria-live="polite">
              {items.length} product{items.length === 1 ? "" : "s"}
            </p>
            <p className="lg:hidden">Swipe left on an item to mark it eaten</p>
          </div>
          <ProductList items={items} />
        </>
      )}
    </div>
  );
}
