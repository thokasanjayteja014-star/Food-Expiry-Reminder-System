"use client";

import { useEffect, useRef, useState } from "react";
import type { InventoryItem } from "@/lib/inventory";
import { useAuth } from "@/hooks/useAuth";
import { friendlyMessage, FRIENDLY } from "@/lib/errors";
import { ProductCard, type QuickAction } from "./ProductCard";

type Done = { id: string; name: string; action: QuickAction };

/** A card holding product rows, with swipe actions and an undo bar. */
export function ProductList({ items, swipe = true }: { items: InventoryItem[]; swipe?: boolean }) {
  const { repo } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function act(item: InventoryItem, action: QuickAction) {
    setOpenId(null);
    setError(null);
    const at = new Date().toISOString();
    try {
      await repo!.updateProduct(item.product.id, action === "CONSUMED" ? { status: "CONSUMED", consumedAt: at } : { status: "DISCARDED", discardedAt: at });
      setDone({ id: item.product.id, name: item.product.productName, action });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(null), 6000);
    } catch (e) {
      setError(friendlyMessage(e, FRIENDLY.save));
    }
  }

  async function undo() {
    if (!done) return;
    setDone(null);
    try {
      await repo!.updateProduct(done.id, { status: "ACTIVE", consumedAt: null, discardedAt: null });
    } catch (e) {
      setError(friendlyMessage(e, FRIENDLY.save));
    }
  }

  return (
    <>
      <ul className="card divide-y divide-[var(--border)] overflow-hidden">
        {items.map((item, n) => (
          <li key={item.product.id} className="animate-in" style={{ ["--i" as string]: Math.min(n, 12) }}>
            <ProductCard
              item={item}
              open={openId === item.product.id}
              onOpenChange={(o) => setOpenId(o ? item.product.id : null)}
              onAction={swipe && repo ? (a) => void act(item, a) : undefined}
            />
          </li>
        ))}
      </ul>
      {(done || error) && (
        <div
          role="status"
          className="animate-toast fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg bg-brand-900 px-4 py-3 text-sm text-white shadow-lg lg:bottom-6"
        >
          <span className="min-w-0 truncate">
            {error ?? `${done!.name} marked as ${done!.action === "CONSUMED" ? "eaten" : "thrown away"}.`}
          </span>
          {done && (
            <button type="button" onClick={undo} className="shrink-0 font-semibold text-brand-200 hover:underline">
              Undo
            </button>
          )}
        </div>
      )}
    </>
  );
}
