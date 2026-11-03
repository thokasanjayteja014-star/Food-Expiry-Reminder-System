"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { PageHeader } from "@/components/PageHeader";
import { ProductForm, emptyFormValues } from "@/components/ProductForm";
import { LoadingSpinner } from "@/components/LoadingSpinner";

export default function AddProductPage() {
  const router = useRouter();
  const { repo } = useAuth();
  const { loading, defaultReminderDays } = useProfile();

  return (
    <>
      <PageHeader title="Add product manually" description="Use this when scanning doesn't work, or for food without a printed date." />
      <div className="card max-w-2xl p-5 sm:p-6">
        {loading ? (
          <LoadingSpinner />
        ) : (
          <ProductForm
            initial={emptyFormValues(defaultReminderDays)}
            source="manual"
            onCancel={() => router.back()}
            onSubmit={async (input) => {
              if (!repo) throw new Error("Not signed in");
              const id = await repo.addProduct(input);
              router.replace(`/products/${id}?saved=1`);
            }}
          />
        )}
      </div>
    </>
  );
}
