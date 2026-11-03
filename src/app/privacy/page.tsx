import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { PrivacyContent } from "@/components/PrivacyContent";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/" className="btn-ghost -ml-3 mb-4">
        <ArrowLeft aria-hidden className="size-4" /> Back
      </Link>
      <h1 className="text-2xl font-bold">Privacy</h1>
      <div className="card mt-4 p-6">
        <PrivacyContent />
      </div>
    </main>
  );
}
