"use client";

// Eagerly registers the service worker (app/sw.ts -> /sw.js) so app-shell precaching and offline
// runtime caching are active from the first visit, without requiring the user to opt into push
// notifications first. Renders nothing; lib/push/client.ts's subscribeToPush() re-registers (a
// no-op once this has already run) when the user later opts into push.
import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push/client";

export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    registerServiceWorker().catch(() => {
      // Best-effort: offline support/push just stay unavailable this session.
    });
  }, []);

  return null;
}
