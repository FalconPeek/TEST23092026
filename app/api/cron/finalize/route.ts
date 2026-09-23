// Cron entry point: closes expired report windows, runs the match finalizer on every eligible
// `pending_finalize` match, then drains any queued card recomputes. Triggered by pg_cron (when
// available -- see private.close_expired_windows in 20260923064115_match_lifecycle.sql, which
// only closes windows, not finalize) or an external scheduler hitting this route with
// `Authorization: Bearer ${CRON_SECRET}`. GET is supported too since some schedulers (e.g.
// Vercel Cron) only issue GET requests.
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseFinalizeRepo } from "@/lib/server/finalize-repo";
import { processPendingFinalize } from "@/lib/server/finalize";
import { createSupabaseRatingRepo } from "@/lib/server/rating-repo";
import { drainRecomputeQueue } from "@/lib/server/recompute";

/** Constant-time comparison so response timing can't leak how many leading characters of
 * CRON_SECRET a guess got right. Falls back to a length check (also constant-time-safe: it never
 * compares byte contents when lengths differ) before the byte comparison, since
 * `timingSafeEqual` throws on mismatched buffer lengths. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return safeEqual(header, `Bearer ${secret}`);
}

const RECOMPUTE_BATCH_LIMIT = 200;

async function handle(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: closedWindows, error: closeError } = await admin.rpc("close_expired_windows");
  if (closeError) {
    return NextResponse.json({ error: closeError.message }, { status: 500 });
  }

  const now = new Date();

  const finalizeRepo = createSupabaseFinalizeRepo(admin);
  const finalizeResult = await processPendingFinalize(finalizeRepo, now);

  const ratingRepo = createSupabaseRatingRepo(admin);
  const drainResult = await drainRecomputeQueue(ratingRepo, { limit: RECOMPUTE_BATCH_LIMIT, now });

  return NextResponse.json({
    closedWindows: closedWindows ?? 0,
    matchesProcessed: finalizeResult.matchIds.length,
    matchesFinalized: finalizeResult.finalized,
    matchesDisputed: finalizeResult.disputed,
    matchErrors: finalizeResult.errors,
    playersRecomputed: drainResult.playersSucceeded,
    recomputeFailures: drainResult.failures,
  });
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}
