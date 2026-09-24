import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

// The service worker is built by @serwist/turbopack and served through the Route Handler at
// app/serwist/[path]/route.ts (Turbopack doesn't support webpack-style build plugins yet, so
// Serwist's Next.js integration bundles the SW per-request/at-build-time behind a route instead).
// These rewrites expose it at the conventional root-scoped `/sw.js` URL; proxy.ts's matcher
// already excludes both `sw.js` and `serwist` from auth middleware (see proxy.ts).
const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/sw.js", destination: "/serwist/sw.js" },
      { source: "/sw.js.map", destination: "/serwist/sw.js.map" },
    ];
  },
};

export default withSerwist(nextConfig);
