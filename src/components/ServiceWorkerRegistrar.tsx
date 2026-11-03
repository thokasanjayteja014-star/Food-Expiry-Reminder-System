"use client";

import { useEffect } from "react";

/** Registers the service worker (PWA install, offline cache and push). */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Skip in development so hot reload is not served from cache.
    if (process.env.NODE_ENV !== "production" && !process.env.NEXT_PUBLIC_ENABLE_SW_IN_DEV) return;
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch((e) => {
      console.warn("Service worker registration failed", e);
    });
  }, []);
  return null;
}
