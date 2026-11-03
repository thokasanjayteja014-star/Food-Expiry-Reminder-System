"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  CalendarClock,
  CalendarDays,
  Factory,
  Hash,
  MapPin,
  NotebookText,
  Pencil,
  RotateCcw,
  ScanLine,
  Trash2,
  Utensils,
  Ban,
  type LucideIcon,
} from "lucide-react";
import type { Product } from "@/types/product";
import { useAuth } from "@/hooks/useAuth";
import { calculateDaysRemaining, describeDaysRemaining, getDisplayStatus } from "@/lib/expiry";
import { formatDateLong, formatTimestamp, todayISO } from "@/lib/dates";
import { friendlyMessage, FRIENDLY } from "@/lib/errors";
import { StatusBadge } from "./StatusBadge";
import { ConfirmDialog } from "./ConfirmDialog";
import { Alert } from "./Alert";

const SOURCE_TEXT: Record<Product["expiryDateSource"], string> = {
  printed: "Read from the package",
  calculated: "Calculated from manufacturing date",
  manual: "Entered manually",
};

export function ProductDetails({ product }: { product: Product }) {
  const router = useRouter();
  const params = useSearchParams();
  const { repo } = useAuth();
  const [confirm, setConfirm] = useState<"delete" | "discard" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(params.get("saved") ? "Product saved." : null);

  const today = todayISO();
  const status = getDisplayStatus(product, today);
  const days = calculateDaysRemaining(product.expiryDate, today);
  const active = product.status === "ACTIVE";

  async function run(action: () => Promise<void>, success: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (success) setNotice(success);
    } catch (e) {
      console.error(e);
      setError(friendlyMessage(e, FRIENDLY.save));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  const now = () => new Date().toISOString();

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/inventory" className="btn-ghost -ml-3">
        <ArrowLeft aria-hidden className="size-4" /> Inventory
      </Link>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <article className="card animate-in overflow-hidden">
        {product.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- small data URL thumbnail
          <img src={product.imageUrl} alt={`Photo of ${product.productName} package`} className="h-48 w-full bg-[var(--surface-2)] object-contain" />
        )}
        <div className="p-4 sm:p-6">
          <p className="text-xs font-medium muted">{product.category}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{product.productName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            {active && <span className="text-sm font-medium">{describeDaysRemaining(days)}</span>}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {active ? (
              <>
                <button
                  type="button"
                  className="btn-primary w-full sm:w-auto"
                  disabled={busy}
                  onClick={() => run(() => repo!.updateProduct(product.id, { status: "CONSUMED", consumedAt: now() }), `${product.productName} marked as consumed.`)}
                >
                  <Utensils aria-hidden className="size-4" /> Mark as Consumed
                </button>
                <button type="button" className="btn-secondary flex-1 sm:flex-none" disabled={busy} onClick={() => setConfirm("discard")}>
                  <Ban aria-hidden className="size-4" /> Mark as Discarded
                </button>
                <Link href={`/products/${product.id}/edit`} className="btn-secondary" aria-label="Edit">
                  <Pencil aria-hidden className="size-4" /> <span className="max-sm:sr-only">Edit</span>
                </Link>
              </>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() =>
                  run(() => repo!.updateProduct(product.id, { status: "ACTIVE", consumedAt: null, discardedAt: null }), "Product is being tracked again.")
                }
              >
                <RotateCcw aria-hidden className="size-4" /> Track again
              </button>
            )}
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-[var(--border)] pt-5">
            <Detail Icon={CalendarDays} label="Expiry date" value={formatDateLong(product.expiryDate)} hint={SOURCE_TEXT[product.expiryDateSource]} />
            <Detail Icon={Factory} label="Manufacturing date" value={product.manufacturingDate ? formatDateLong(product.manufacturingDate) : "Not recorded"} />
            <Detail Icon={Hash} label="Quantity" value={product.quantity === null ? "Not recorded" : String(product.quantity)} />
            <Detail Icon={MapPin} label="Storage location" value={product.storageLocation || "Not recorded"} />
            <Detail Icon={Bell} label="Reminder" value={`${product.reminderDays} day${product.reminderDays === 1 ? "" : "s"} before expiry`} />
            <Detail Icon={CalendarClock} label="Added" value={formatTimestamp(product.createdAt)} hint={[product.addedByName ? `By ${product.addedByName}` : "", product.source === "ocr" ? "Added by scanning" : product.source === "demo" ? "Demo data" : "Added manually"].filter(Boolean).join(" · ")} />
            {product.consumedAt && <Detail Icon={Utensils} label="Consumed" value={formatTimestamp(product.consumedAt)} />}
            {product.discardedAt && <Detail Icon={Ban} label="Discarded" value={formatTimestamp(product.discardedAt)} />}
          </dl>
          {product.notes && (
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <Detail Icon={NotebookText} label="Notes" value={product.notes} />
            </div>
          )}
        </div>
      </article>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="btn-ghost text-sm text-red-700 dark:text-red-400" disabled={busy} onClick={() => setConfirm("delete")}>
          <Trash2 aria-hidden className="size-4" /> Delete
        </button>
        <Link href="/scan" className="btn-ghost text-sm">
          <ScanLine aria-hidden className="size-4" /> Scan another product
        </Link>
      </div>

      <ConfirmDialog
        open={confirm === "delete"}
        title={`Are you sure you want to delete ${product.productName}?`}
        description="This permanently removes the product and cannot be undone. To keep it in your statistics, mark it as consumed or discarded instead."
        confirmLabel="Delete"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          run(async () => {
            await repo!.deleteProduct(product.id);
            router.replace("/inventory");
          }, null)
        }
      />
      <ConfirmDialog
        open={confirm === "discard"}
        title={`Mark ${product.productName} as discarded?`}
        description="It will stop being tracked and will count as wasted in your statistics."
        confirmLabel="Mark as discarded"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => repo!.updateProduct(product.id, { status: "DISCARDED", discardedAt: now() }), `${product.productName} marked as discarded.`)}
      />
    </div>
  );
}

function Detail({ Icon, label, value, hint }: { Icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 gap-2.5">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 muted" />
      <div className="min-w-0">
        <dt className="text-xs muted">{label}</dt>
        <dd className="mt-0.5 break-words text-sm font-medium">{value}</dd>
        {hint && <dd className="text-xs muted">{hint}</dd>}
      </div>
    </div>
  );
}
