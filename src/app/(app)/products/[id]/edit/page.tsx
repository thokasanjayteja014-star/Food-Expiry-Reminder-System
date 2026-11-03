"use client";

import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useProduct } from "@/hooks/useProducts";
import { PageHeader } from "@/components/PageHeader";
import { ProductForm } from "@/components/ProductForm";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ProductNotFound } from "@/components/ProductNotFound";

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { repo } = useAuth();
  const { product, loading } = useProduct(id);

  if (loading) return <LoadingSpinner label="Loading product..." />;
  if (!product) return <ProductNotFound />;

  return (
    <>
      <PageHeader title={`Edit ${product.productName}`} />
      <div className="card max-w-2xl p-5 sm:p-6">
        <ProductForm
          initial={{
            productName: product.productName,
            category: product.category,
            manufacturingDate: product.manufacturingDate ?? "",
            expiryDate: product.expiryDate,
            expiryDateSource: product.expiryDateSource,
            quantity: product.quantity === null ? "" : String(product.quantity),
            storageLocation: product.storageLocation,
            notes: product.notes,
            reminderDays: product.reminderDays,
          }}
          source={product.source}
          imageUrl={product.imageUrl}
          submitLabel="Save changes"
          onCancel={() => router.back()}
          onSubmit={async (input) => {
            if (!repo) throw new Error("Not signed in");
            await repo.updateProduct(product.id, input);
            router.replace(`/products/${product.id}?saved=1`);
          }}
        />
      </div>
    </>
  );
}
