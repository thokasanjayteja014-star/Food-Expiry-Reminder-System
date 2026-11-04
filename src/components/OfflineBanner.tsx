"use client";

import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { FRIENDLY } from "@/lib/errors";

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-brand-900 px-4 py-2 text-sm text-white">
      <WifiOff aria-hidden className="size-4" />
      {FRIENDLY.offline}
    </div>
  );
}
