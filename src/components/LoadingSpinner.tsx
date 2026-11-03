import { Loader2 } from "lucide-react";

export function LoadingSpinner({ label = "Loading...", className = "" }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={`flex items-center justify-center gap-2 py-10 muted ${className}`}>
      <Loader2 aria-hidden className="size-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function FullPageLoader({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <LoadingSpinner label={label} />
    </div>
  );
}
