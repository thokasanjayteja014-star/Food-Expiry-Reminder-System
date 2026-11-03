"use client";

import { useEffect, useState } from "react";
import type { Product } from "@/types/product";
import { useAuth } from "./useAuth";
import { FRIENDLY } from "@/lib/errors";

export interface ProductsState {
  products: Product[];
  loading: boolean;
  error: string | null;
}

/** Live list of the signed-in user's products. */
export function useProducts(): ProductsState {
  const { repo } = useAuth();
  const [state, setState] = useState<ProductsState>({ products: [], loading: true, error: null });

  useEffect(() => {
    if (!repo) return;
    const unsubscribe = repo.subscribeProducts(
      (products) => setState({ products, loading: false, error: null }),
      (error) => {
        console.error("Failed to load products", error);
        setState((s) => ({ ...s, loading: false, error: FRIENDLY.load }));
      },
    );
    return unsubscribe;
  }, [repo]);

  return state;
}

/** One product, kept live from the same subscription. */
export function useProduct(id: string): { product: Product | null; loading: boolean; error: string | null } {
  const { products, loading, error } = useProducts();
  return { product: products.find((p) => p.id === id) ?? null, loading, error };
}
