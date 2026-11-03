import Link from "next/link";
import { PackageX } from "lucide-react";
import { EmptyState } from "./EmptyState";

export function ProductNotFound() {
  return (
    <EmptyState
      icon={PackageX}
      title="Product not found"
      description="It may have been deleted, or it belongs to a different account."
      action={
        <Link href="/inventory" className="btn-primary">
          Back to inventory
        </Link>
      }
    />
  );
}
