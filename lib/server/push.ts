// Thin wrapper around the `web-push` package (VAPID Web Push). Mirrors lib/rating/openskill.ts's
// "thin wrapper around an npm package" shape, but this one does real network I/O, so
// lib/server/notifications.ts is the thing that's unit-testable, not this file directly --
// `transport` is injected (defaulting to the real `web-push` package) so push.test.ts can still
// exercise the status-code classification logic (404/410 -> expired) without a network call.
import "server-only";
import webpush from "web-push";
import type { NotificationPayload } from "@/lib/notifications/templates";

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSendResult {
  ok: boolean;
  /** True on a 404/410 from the push service: the subscription is dead and should be deleted
   * (push_subscriptions has no RLS delete for authenticated -- the caller does this via the
   * admin client, see lib/server/notifications.ts). */
  expired: boolean;
  error?: string;
}

export interface PushTransport {
  sendNotification(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string): Promise<unknown>;
}

const realTransport: PushTransport = {
  sendNotification: (subscription, payload) => webpush.sendNotification(subscription, payload),
};

export interface VapidEnv {
  VAPID_PUBLIC_KEY?: string;
  NEXT_PUBLIC_VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  // Index signature so `process.env` (ProcessEnv) is structurally assignable as the default arg.
  [key: string]: string | undefined;
}

/** Dev-friendly by design: an unset VAPID key pair is a normal local setup (see .env.example), so
 * callers skip sending silently rather than throwing -- matches how e.g. push_subscriptions is
 * simply empty in a fresh local stack. */
export function isVapidConfigured(env: VapidEnv = process.env): boolean {
  const publicKey = env.VAPID_PUBLIC_KEY ?? env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  return Boolean(publicKey && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

let vapidApplied = false;

function applyVapidDetails(env: VapidEnv): void {
  if (vapidApplied) return;
  const publicKey = env.VAPID_PUBLIC_KEY ?? env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  webpush.setVapidDetails(env.VAPID_SUBJECT!, publicKey!, env.VAPID_PRIVATE_KEY!);
  vapidApplied = true;
}

function statusCodeOf(err: unknown): number | undefined {
  return typeof err === "object" && err !== null && "statusCode" in err && typeof (err as { statusCode: unknown }).statusCode === "number"
    ? (err as { statusCode: number }).statusCode
    : undefined;
}

export async function sendPush(
  subscription: PushSubscriptionInput,
  payload: NotificationPayload,
  transport: PushTransport = realTransport,
  env: VapidEnv = process.env,
): Promise<PushSendResult> {
  if (!isVapidConfigured(env)) return { ok: false, expired: false, error: "vapid_not_configured" };
  applyVapidDetails(env);

  try {
    await transport.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
    );
    return { ok: true, expired: false };
  } catch (err) {
    const statusCode = statusCodeOf(err);
    return { ok: false, expired: statusCode === 404 || statusCode === 410, error: err instanceof Error ? err.message : String(err) };
  }
}
