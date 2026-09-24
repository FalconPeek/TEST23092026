// Serves the built service worker (and its sourcemap) via a Route Handler, per @serwist/turbopack's
// Turbopack integration -- Turbopack has no webpack-plugin hook to inject the precache manifest at
// build time, so Serwist instead bundles app/sw.ts with esbuild behind this route and rewrites
// /sw.js -> /serwist/sw.js (see next.config.ts). Public by design: proxy.ts's matcher already skips
// auth middleware for this path, and a service worker script must be fetchable without a session.
import { createSerwistRoute } from "@serwist/turbopack";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "app/sw.ts",
});
