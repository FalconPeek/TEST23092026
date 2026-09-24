"use client";

// Browser-side web push helpers: registers the service worker (app/sw.ts, served at /sw.js -- see
// next.config.ts's rewrite and app/serwist/[path]/route.ts), subscribes/unsubscribes with the
// Push API, and persists the subscription via the (already-built) Server Actions in
// lib/actions/engagement.ts. No settings UI here by design -- a toggle component calls these.
import { deletePushSubscription, savePushSubscription } from "@/lib/actions/engagement";

export type PushClientResult = { ok: true } | { ok: false; error: string };

/** Whether this browser can, in principle, register a service worker and subscribe to push. */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Current Notification permission, or "unsupported" when the Notifications API isn't available. */
export function getPushPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** VAPID applicationServerKey must be a Uint8Array; the key itself is URL-safe base64 text. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Idempotent: registering the same scriptURL/scope again just resolves with the existing
 * registration instead of re-fetching, so this is safe to call from multiple places (this module
 * and a root-level eager-registration component). */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

function subscriptionToInput(subscription: PushSubscription): { endpoint: string; p256dh: string; auth: string } | null {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

export async function subscribeToPush(): Promise<PushClientResult> {
  if (!isPushSupported()) return { ok: false, error: "unsupported" };

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) return { ok: false, error: "vapid_not_configured" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, error: "permission_denied" };

  const registration = await registerServiceWorker();
  await navigator.serviceWorker.ready;

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  const input = subscriptionToInput(subscription);
  if (!input) return { ok: false, error: "invalid_subscription" };

  const result = await savePushSubscription({ ...input, userAgent: navigator.userAgent.slice(0, 300) });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function unsubscribeFromPush(): Promise<PushClientResult> {
  if (!isPushSupported()) return { ok: false, error: "unsupported" };

  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return { ok: true };

  const result = await deletePushSubscription({ endpoint: subscription.endpoint });
  await subscription.unsubscribe();

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
