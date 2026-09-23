"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail, type ActionResult } from "@/lib/actions/result";
import { mapDbError } from "@/lib/actions/errors";
import { finalizeMatch, type FinalizeOutcome } from "@/lib/server/finalize";
import { createSupabaseFinalizeRepo } from "@/lib/server/finalize-repo";

const finalizeMatchNowSchema = z.object({ matchId: z.uuid() });

/**
 * Admin-only "close this match now" action: closes the report/rating windows early and runs the
 * finalizer immediately instead of waiting for pg_cron / app/api/cron/finalize.
 */
export async function finalizeMatchNow(input: { matchId: string }): Promise<ActionResult<{ outcome: FinalizeOutcome }>> {
  const parsed = finalizeMatchNowSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();

  // RLS: the match is only visible to members of its group.
  const { data: matchRow } = await supabase
    .from("matches")
    .select("group_id, status")
    .eq("id", parsed.data.matchId)
    .maybeSingle();
  if (!matchRow) return fail(es.errors.notMember);

  // Explicit admin check before touching the admin client; the RPC below re-checks it for
  // `reporting` matches, but a `pending_finalize` match skips the RPC.
  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", matchRow.group_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (membership?.role !== "owner" && membership?.role !== "admin") return fail(es.errors.forbidden);

  // request_finalize collapses the report and rating windows to now() so the finalizer below
  // treats the match as eligible. It only accepts `reporting` matches.
  if (matchRow.status === "reporting") {
    const { error: requestError } = await supabase.rpc("request_finalize", { p_match_id: parsed.data.matchId });
    if (requestError) return fail(mapDbError(requestError));
  }

  const admin = createAdminClient();
  const repo = createSupabaseFinalizeRepo(admin);
  let outcome: FinalizeOutcome;
  try {
    outcome = await finalizeMatch(repo, parsed.data.matchId, new Date());
  } catch {
    return fail(es.common.error);
  }

  // The tournament sync error is a raw DB message; only a mapped string may reach the client.
  if (outcome.status === "finalized" && outcome.tournamentSyncError) {
    outcome = { ...outcome, tournamentSyncError: mapDbError({ message: outcome.tournamentSyncError }) };
  }

  revalidatePath(`/g/${matchRow.group_id}/partidos`);
  revalidatePath(`/g/${matchRow.group_id}/partidos/${parsed.data.matchId}`);

  return ok({ outcome });
}
