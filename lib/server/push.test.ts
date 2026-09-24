import webpush from "web-push";
import { describe, expect, it } from "vitest";
import { isVapidConfigured, sendPush, type PushTransport } from "./push";

const SUBSCRIPTION = { endpoint: "https://push.example/abc", p256dh: "p256dh-key", auth: "auth-key" };
const PAYLOAD = { title: "t", body: "b", url: "/x" };
// setVapidDetails validates key shape even though `transport` below bypasses the real network
// call, so these need to be real (well-formed, not registered) VAPID keys, not placeholder text.
const VAPID_KEYS = webpush.generateVAPIDKeys();
const CONFIGURED_ENV = { VAPID_PUBLIC_KEY: VAPID_KEYS.publicKey, VAPID_PRIVATE_KEY: VAPID_KEYS.privateKey, VAPID_SUBJECT: "mailto:a@b.com" };

describe("isVapidConfigured", () => {
  it("is false when any of the 3 VAPID env vars is missing", () => {
    expect(isVapidConfigured({})).toBe(false);
    expect(isVapidConfigured({ VAPID_PUBLIC_KEY: "pub" })).toBe(false);
    expect(isVapidConfigured({ VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv" })).toBe(false);
  });

  it("is true with public+private+subject, accepting either public key env var name", () => {
    expect(isVapidConfigured(CONFIGURED_ENV)).toBe(true);
    expect(isVapidConfigured({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", VAPID_SUBJECT: "mailto:a@b.com" })).toBe(true);
  });
});

describe("sendPush", () => {
  it("skips silently (ok: false, no throw) when VAPID is unset", async () => {
    const transport: PushTransport = { sendNotification: async () => ({}) };
    const result = await sendPush(SUBSCRIPTION, PAYLOAD, transport, {});
    expect(result).toEqual({ ok: false, expired: false, error: "vapid_not_configured" });
  });

  it("returns ok: true on a successful send", async () => {
    const transport: PushTransport = { sendNotification: async () => ({}) };
    const result = await sendPush(SUBSCRIPTION, PAYLOAD, transport, CONFIGURED_ENV);
    expect(result).toEqual({ ok: true, expired: false });
  });

  it("classifies a 410 (Gone) as expired", async () => {
    const transport: PushTransport = {
      sendNotification: async () => {
        const err = new Error("gone") as Error & { statusCode: number };
        err.statusCode = 410;
        throw err;
      },
    };
    const result = await sendPush(SUBSCRIPTION, PAYLOAD, transport, CONFIGURED_ENV);
    expect(result.ok).toBe(false);
    expect(result.expired).toBe(true);
  });

  it("classifies a 404 (Not Found) as expired", async () => {
    const transport: PushTransport = {
      sendNotification: async () => {
        const err = new Error("not found") as Error & { statusCode: number };
        err.statusCode = 404;
        throw err;
      },
    };
    const result = await sendPush(SUBSCRIPTION, PAYLOAD, transport, CONFIGURED_ENV);
    expect(result.expired).toBe(true);
  });

  it("does not classify a 500 as expired", async () => {
    const transport: PushTransport = {
      sendNotification: async () => {
        const err = new Error("server error") as Error & { statusCode: number };
        err.statusCode = 500;
        throw err;
      },
    };
    const result = await sendPush(SUBSCRIPTION, PAYLOAD, transport, CONFIGURED_ENV);
    expect(result.ok).toBe(false);
    expect(result.expired).toBe(false);
  });
});
