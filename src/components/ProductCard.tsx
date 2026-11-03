"use client";

import Link from "next/link";
import { useRef, useState, type PointerEvent } from "react";
import { Ban, ChevronRight, Utensils } from "lucide-react";
import type { InventoryItem } from "@/lib/inventory";
import { describeDaysRemaining, STATUS_LABELS } from "@/lib/expiry";
import { formatDate } from "@/lib/dates";
import { STATUS_DOT, STATUS_TEXT } from "./StatusBadge";

export type QuickAction = "CONSUMED" | "DISCARDED";

const ACTIONS_WIDTH = 168;

/**
 * Two-line inventory row. On touch screens, swipe left to reveal "Eaten" and "Thrown away";
 * the same actions are on the product page for keyboard and mouse users.
 */
export function ProductCard({
  item,
  open = false,
  onOpenChange,
  onAction,
}: {
  item: InventoryItem;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAction?: (action: QuickAction) => void;
}) {
  const { product, status, daysRemaining } = item;
  const active = product.status === "ACTIVE";
  const swipeable = active && !!onAction;
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; base: number; swiping: boolean } | null>(null);
  const moved = useRef(false);

  const offset = drag ?? (open ? -ACTIONS_WIDTH : 0);
  const meta = [product.category, product.storageLocation, product.addedByName ? `by ${product.addedByName}` : ""].filter(Boolean).join(" · ");

  function down(e: PointerEvent) {
    if (!swipeable || e.pointerType === "mouse") return;
    start.current = { x: e.clientX, y: e.clientY, base: open ? -ACTIONS_WIDTH : 0, swiping: false };
    moved.current = false;
  }
  function move(e: PointerEvent) {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.swiping) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        start.current = null; // vertical scroll
        return;
      }
      if (Math.abs(dx) < 8) return;
      s.swiping = true;
      moved.current = true;
    }
    setDrag(Math.max(-ACTIONS_WIDTH - 24, Math.min(0, s.base + dx)));
  }
  function up() {
    const s = start.current;
    start.current = null;
    if (!s?.swiping || drag === null) {
      setDrag(null);
      return;
    }
    onOpenChange?.(drag < -ACTIONS_WIDTH / 2);
    setDrag(null);
  }

  return (
    <div className="relative overflow-hidden">
      {swipeable && offset < 0 && (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTIONS_WIDTH }} aria-hidden={!open}>
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={() => onAction!("CONSUMED")}
            className="flex flex-1 flex-col items-center justify-center gap-1 bg-brand-600 text-xs font-semibold text-white"
          >
            <Utensils aria-hidden className="size-4" /> Eaten
          </button>
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={() => onAction!("DISCARDED")}
            className="flex flex-1 flex-col items-center justify-center gap-1 bg-red-600 text-xs font-semibold text-white"
          >
            <Ban aria-hidden className="size-4" /> Thrown away
          </button>
        </div>
      )}
      <Link
        href={`/products/${product.id}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(e) => {
          if (moved.current || open) {
            e.preventDefault();
            moved.current = false;
            if (open) onOpenChange?.(false);
          }
        }}
        style={{ transform: `translateX(${offset}px)`, touchAction: "pan-y" }}
        className={`group relative flex items-center gap-3 bg-[var(--surface)] px-4 py-3 hover:bg-[var(--surface-2)] active:bg-[var(--border)] ${
          drag === null ? "transition-transform duration-200" : ""
        }`}
      >
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATUS_DOT[status]} ${status === "EXPIRING_TODAY" ? "animate-pulse" : ""}`} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-medium">{product.productName}</h3>
          <p className="truncate text-xs muted">{meta}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-xs font-medium ${STATUS_TEXT[status]}`}>{active ? describeDaysRemaining(daysRemaining) : STATUS_LABELS[status]}</p>
          <p className="text-xs muted">
            <span className="sr-only">{STATUS_LABELS[status]}. Expires </span>
            {formatDate(product.expiryDate)}
          </p>
        </div>
        <ChevronRight aria-hidden className="size-4 shrink-0 muted transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
