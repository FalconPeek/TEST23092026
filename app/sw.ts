/// <reference lib="webworker" />
export {};

// Service worker source, bundled by @serwist/turbopack (see app/serwist/[path]/route.ts) into the
// script served at /sw.js. `/// <reference lib="webworker" />` + the local `declare const self`
// below scope the WebWorker globals to just this file, so the rest of the app (which targets DOM,
// via tsconfig's `lib`) is unaffected -- TS errors ("Cannot redeclare block-scoped variable self")
// if "webworker" is added to tsconfig's top-level `lib` instead, since it conflicts with "dom".
import { defaultCache } from "@serwist/turbopack/worker";
import { NetworkOnly, Serwist } from "serwist";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import type { NotificationPayload } from "@/lib/notifications/templates";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Supabase auth/rest/realtime traffic must always hit the network -- never served from cache, and
// never stashed in one either (session state, RLS-scoped reads). Matches by pathname only, so this
// covers both same-origin calls (if ever proxied) and the actual cross-origin Supabase project URL.
const neverCache: RuntimeCaching[] = [
  {
    matcher: ({ url }) => /\/(auth|rest|realtime)\//.test(url.pathname),
    handler: new NetworkOnly(),
  },
];

const serwist = new Serwist({
  // Precache manifest injected at build time by @serwist/turbopack (app shell: hashed JS/CSS
  // chunks under .next/static, plus everything in public/).
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...neverCache, ...defaultCache],
});

serwist.addEventListeners();

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload: NotificationPayload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  if (!payload?.title) return;

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawUrl = (event.notification.data as { url?: string } | undefined)?.url;
  if (!rawUrl) return;

  let target: URL;
  try {
    target = new URL(rawUrl, self.location.origin);
  } catch {
    return;
  }
  // Ignore external URLs: a push payload's `url` is server-generated (lib/notifications/templates)
  // but this is still cheap insurance against ever opening an off-origin tab from a notification.
  if (target.origin !== self.location.origin) return;

  event.waitUntil(
    (async () => {
      const openClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      const exact = openClients.find((client) => client.url === target.href);
      if (exact) {
        await exact.focus();
        return;
      }

      const sameOrigin = openClients.find((client) => new URL(client.url).origin === target.origin);
      if (sameOrigin && "navigate" in sameOrigin) {
        const focused = await sameOrigin.focus();
        await (focused as WindowClient).navigate(target.href);
        return;
      }

      await self.clients.openWindow(target.href);
    })(),
  );
});
