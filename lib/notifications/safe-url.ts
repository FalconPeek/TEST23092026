// Guards a notification payload's `url` field (stored jsonb, never trusted) before it's ever used
// as a Link href or a redirect target: only a same-origin relative path is safe. Returns null
// (never a fallback path) so the caller can simply not render a link at all -- unlike
// lib/supabase/env.ts's safeNextPath, which is for a post-login redirect and always needs
// *somewhere* to go, so it falls back to "/".

const UNSAFE_CHARS = /[\u0000-\u001f\u007f\\]/;
const GUARD_ORIGIN = "http://notification.invalid";

/** null for anything that isn't a plain, same-origin relative path: a protocol-relative
 * `//host/...`, an absolute URL (`https://...`), a non-http(s) scheme (`javascript:...`), or a
 * control character / backslash a browser could normalize into an off-origin URL. */
export function safeInternalUrl(url: string | null | undefined): string | null {
  if (!url || !url.startsWith("/") || url.startsWith("//") || UNSAFE_CHARS.test(url)) return null;

  let parsed: URL;
  try {
    parsed = new URL(url, GUARD_ORIGIN);
  } catch {
    return null;
  }
  if (parsed.origin !== GUARD_ORIGIN) return null;

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
