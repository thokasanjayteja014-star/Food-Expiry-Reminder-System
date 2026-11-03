import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { PencilLine } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { InventoryView } from "@/components/InventoryView";
import { LoadingSpinner } from "@/components/LoadingSpinner";

export const metadata: Metadata = { title: "Inventory" };

export default function InventoryPage() {
  return (
    <>
      <PageHeader
        title="Food inventory"
        description="All the food you are tracking."
        actions={
          <Link href="/products/new" className="btn-secondary">
            <PencilLine aria-hidden className="size-4" /> Add manually
          </Link>
        }
      />
      <Suspense fallback={<LoadingSpinner label="Loading products..." />}>
        <InventoryView />
      </Suspense>
    </>
  );
}
