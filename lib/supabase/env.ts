export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** Absolute site URL with trailing slash; used for OAuth redirects. */
export function siteUrl(): string {
  let url =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_VERCEL_URL ?? "http://localhost:3000/";
  url = url.startsWith("http") ? url : `https://${url}`;
  return url.endsWith("/") ? url : `${url}/`;
}

/** Only allow same-origin relative paths as post-login destinations (open-redirect guard). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
