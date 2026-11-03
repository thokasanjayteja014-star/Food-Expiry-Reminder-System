import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { InventoryItem } from "@/lib/inventory";
import { describeDaysRemaining } from "@/lib/expiry";
import { STATUS_DOT, STATUS_TEXT } from "./StatusBadge";
import { STATUS_LABELS } from "@/lib/expiry";

/** Compact row for dashboard lists: "Milk / Expires in 2 days". */
export function ExpiryCard({ item, index = 0 }: { item: InventoryItem; index?: number }) {
  const { product, status, daysRemaining } = item;
  const active = product.status === "ACTIVE";
  return (
    <li className="animate-in" style={{ ["--i" as string]: index + 8 }}>
      <Link
        href={`/products/${product.id}`}
        className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-2)] active:bg-[var(--border)]"
      >
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATUS_DOT[status]} ${status === "EXPIRING_TODAY" ? "animate-pulse" : ""}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{product.productName}</span>
          <span className="block truncate text-xs muted">
            {product.category}
            {product.storageLocation ? ` · ${product.storageLocation}` : ""}
          </span>
        </span>
        <span className={`shrink-0 text-right text-xs font-medium ${STATUS_TEXT[status]}`}>
          {active ? describeDaysRemaining(daysRemaining) : STATUS_LABELS[status]}
          <span className="sr-only">, {STATUS_LABELS[status]}</span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 muted transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}
