import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/engagement", () => ({
  savePushSubscription: vi.fn(),
  deletePushSubscription: vi.fn(),
}));

import { getPushPermission, isPushSupported, subscribeToPush, unsubscribeFromPush, urlBase64ToUint8Array } from "./client";

describe("urlBase64ToUint8Array", () => {
  it("decodes a URL-safe base64 VAPID key into the raw bytes it encodes", () => {
    // "hello" -> base64 "aGVsbG8=" -> URL-safe (no padding) "aGVsbG8"
    const result = urlBase64ToUint8Array("aGVsbG8");
    expect(Array.from(result)).toEqual([104, 101, 108, 108, 111]);
  });

  it("round-trips bytes containing the URL-safe substitution characters (-, _)", () => {
    // Byte 0xFB 0xFF encodes to base64 "+/8=" -> URL-safe "-_8"
    const result = urlBase64ToUint8Array("-_8");
    expect(Array.from(result)).toEqual([0xfb, 0xff]);
  });

  it("handles every padding-length case (0-3 chars short of a multiple of 4)", () => {
    expect(Array.from(urlBase64ToUint8Array("YQ"))).toEqual([97]); // "a"
    expect(Array.from(urlBase64ToUint8Array("YWI"))).toEqual([97, 98]); // "ab"
    expect(Array.from(urlBase64ToUint8Array("YWJj"))).toEqual([97, 98, 99]); // "abc"
  });
});

describe("isPushSupported / getPushPermission", () => {
  const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
  const originalPushManager = (window as unknown as { PushManager?: unknown }).PushManager;
  const originalNotification = (window as unknown as { Notification?: unknown }).Notification;

  afterEach(() => {
    if (originalServiceWorker) Object.defineProperty(navigator, "serviceWorker", originalServiceWorker);
    else delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
    (window as unknown as { PushManager?: unknown }).PushManager = originalPushManager;
    (window as unknown as { Notification?: unknown }).Notification = originalNotification;
  });

  it("is unsupported when serviceWorker, PushManager or Notification is missing (jsdom default)", () => {
    delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
    delete (window as unknown as { PushManager?: unknown }).PushManager;
    expect(isPushSupported()).toBe(false);
    expect(getPushPermission()).toBe("unsupported");
  });

  it("is supported once serviceWorker, PushManager and Notification are all present", () => {
    Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true });
    (window as unknown as { PushManager?: unknown }).PushManager = class {};
    (window as unknown as { Notification?: unknown }).Notification = { permission: "default" };
    expect(isPushSupported()).toBe(true);
  });

  it("reads the live Notification.permission value", () => {
    (window as unknown as { Notification?: unknown }).Notification = { permission: "granted" };
    expect(getPushPermission()).toBe("granted");
  });
});

describe("subscribeToPush / unsubscribeFromPush", () => {
  it("subscribeToPush short-circuits with ok: false when push isn't supported", async () => {
    delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
    const result = await subscribeToPush();
    expect(result).toEqual({ ok: false, error: "unsupported" });
  });

  it("unsubscribeFromPush short-circuits with ok: false when push isn't supported", async () => {
    delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
    const result = await unsubscribeFromPush();
    expect(result).toEqual({ ok: false, error: "unsupported" });
  });
});
