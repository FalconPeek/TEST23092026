import type { MetadataRoute } from "next";
import { es } from "@/messages/es";

// Dark background/theme hex mirrors app/layout.tsx's `viewport.themeColor` (oklch(0.15 0.018 155)
// converted to sRGB) -- the manifest spec wants a plain CSS color and hex has the widest support.
const THEME_COLOR = "#060d08";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: es.app.name,
    short_name: es.app.name,
    description: es.app.tagline,
    lang: "es-AR",
    start_url: "/g",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
