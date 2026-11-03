"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useProduct } from "@/hooks/useProducts";
import { ProductDetails } from "@/components/ProductDetails";
import { ProductNotFound } from "@/components/ProductNotFound";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Alert } from "@/components/Alert";

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const { product, loading, error } = useProduct(id);
  if (loading) return <LoadingSpinner label="Loading product..." />;
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!product) return <ProductNotFound />;
  return (
    <Suspense>
      <ProductDetails product={product} />
    </Suspense>
  );
}
