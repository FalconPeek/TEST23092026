// One-off generator for the PWA icon set referenced by app/manifest.ts and app/layout.tsx's
// `metadata.icons`. Run with `node scripts/generate-pwa-icons.mjs` whenever the mark changes; the
// output PNGs under public/icons/ are committed (no build-time dependency on this script). Uses
// next/og's ImageResponse (Satori) directly -- it works fine outside an actual Next.js request as
// long as it's run with this repo's node_modules on the module path (i.e. from the repo root).
import { ImageResponse } from "next/og.js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

const BG_FROM = "#0d2417";
const BG_TO = "#060d08";
const BALL = "#eff3f0";
const BALL_PATCH = "#060d08";
const RING = "#20c45f";

/**
 * A simple ball-on-shield mark, built entirely from styled <div>s (no text/glyphs, so it never
 * depends on font loading). `safeZonePct` shrinks the mark for maskable icons, which Android may
 * crop to a circle/squircle -- content must stay inside the centered ~80% "safe zone".
 */
function mark({ size, safeZonePct, rounded }) {
  const ballSize = Math.round(size * safeZonePct * 0.72);
  const patch = Math.round(ballSize * 0.24);

  return {
    type: "div",
    props: {
      style: {
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(160deg, ${BG_FROM}, ${BG_TO})`,
        borderRadius: rounded ? size * 0.22 : 0,
      },
      children: {
        type: "div",
        props: {
          style: {
            width: ballSize,
            height: ballSize,
            borderRadius: "50%",
            background: BALL,
            border: `${Math.round(ballSize * 0.05)}px solid ${RING}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          },
          children: [
            {
              type: "div",
              props: {
                style: {
                  width: patch,
                  height: patch,
                  background: BALL_PATCH,
                  borderRadius: patch * 0.25,
                  transform: "rotate(45deg)",
                },
              },
            },
            {
              type: "div",
              props: {
                style: {
                  position: "absolute",
                  top: ballSize * 0.14,
                  left: ballSize * 0.16,
                  width: patch * 0.7,
                  height: patch * 0.7,
                  background: BALL_PATCH,
                  borderRadius: patch * 0.2,
                  transform: "rotate(45deg)",
                },
              },
            },
            {
              type: "div",
              props: {
                style: {
                  position: "absolute",
                  bottom: ballSize * 0.16,
                  right: ballSize * 0.14,
                  width: patch * 0.7,
                  height: patch * 0.7,
                  background: BALL_PATCH,
                  borderRadius: patch * 0.2,
                  transform: "rotate(45deg)",
                },
              },
            },
          ],
        },
      },
    },
  };
}

async function render(size, { maskable = false, rounded = true } = {}) {
  const res = new ImageResponse(mark({ size, safeZonePct: maskable ? 0.8 : 1, rounded }), { width: size, height: size });
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const files = [
    ["icon-192.png", await render(192)],
    ["icon-512.png", await render(512)],
    // Maskable icons must be a full-bleed square (the OS applies its own mask shape), so this one
    // skips the rounded corners the other sizes use.
    ["icon-maskable-512.png", await render(512, { maskable: true, rounded: false })],
    // Apple ignores border-radius on apple-touch-icon and rounds it itself; keep it square/opaque.
    ["apple-touch-icon.png", await render(180, { rounded: false })],
  ];

  for (const [name, buf] of files) {
    await writeFile(path.join(OUT_DIR, name), buf);
    console.log(`wrote public/icons/${name} (${buf.length} bytes)`);
  }
}

main();
