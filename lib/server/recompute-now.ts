// Convenience wrapper for Server Actions: recompute one or more players' cards right after a
// vote RPC succeeds. Not wired into any action yet — that's another agent's call to make.
import "server-only";
import { awardCardBadgesAndNotify } from "@/lib/server/card-badges";
import { createAdminClient } from "@/lib/supabase/admin";
import { recomputeGroupRaterStats, recomputePlayer } from "./recompute";
import { createSupabaseRatingRepo } from "./rating-repo";

export async function recomputeNow(playerIds: string[]): Promise<void> {
  if (playerIds.length === 0) return;

  const admin = createAdminClient();
  const repo = createSupabaseRatingRepo(admin);
  const now = new Date();

  const playersByGroup = new Map<string, string[]>();
  for (const playerId of playerIds) {
    const player = await repo.loadPlayer(playerId);
    if (!player) continue; // deleted/guest edge case: nothing to recompute
    const list = playersByGroup.get(player.groupId) ?? [];
    list.push(playerId);
    playersByGroup.set(player.groupId, list);
  }

  for (const [groupId, ids] of playersByGroup) {
    // Rater stats must be fresh before recomputing any player in this group, same order as
    // drainRecomputeQueue, so bias/reliability/collusion reflect the votes that just landed.
    await recomputeGroupRaterStats(repo, groupId, now);
    for (const id of ids) {
      await recomputePlayer(repo, id, now);
      // gold_card/scout_10: evaluated here (scouting-vote-triggered recompute), and separately by
      // lib/server/finalize-repo.ts's recomputeCard (match-triggered recompute) -- see
      // lib/server/card-badges.ts's doc comment for why both call sites exist. Best-effort: must
      // never fail the recompute that already durably succeeded above.
      await awardCardBadgesAndNotify(admin, id).catch(() => undefined);
    }
  }
}
