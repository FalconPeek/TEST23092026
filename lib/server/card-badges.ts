// Shared "evaluate gold_card/scout_10 against this player's just-saved card, notify on award"
// step, called from both places a card gets recomputed: lib/server/finalize-repo.ts's
// recomputeCard (match-triggered) and lib/server/recompute-now.ts (scouting-vote-triggered) -- see
// the final report for why these two call sites, not a hook inside lib/server/recompute.ts itself.
// Deliberately its own tiny file rather than folded into badges.ts: badges.ts stays a pure
// orchestration layer over BadgesRepo (testable with a fake, no admin client), while this one does
// real I/O (loads the just-saved card + group settings, then calls it) and is exercised
// indirectly through finalize.test.ts's fake FinalizeRepo / recompute-now's own dbint coverage.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardTier } from "@/lib/badges/engine";
import { badgeAwardedPayload } from "@/lib/notifications/templates";
import { awardCardBadges } from "@/lib/server/badges";
import { createSupabaseBadgesRepo } from "@/lib/server/badges-repo";
import { notify } from "@/lib/server/notifications";
import { createSupabaseNotificationsRepo } from "@/lib/server/notifications-repo";
import { parseGroupSettings } from "@/lib/settings/group";
import type { Database } from "@/lib/supabase/database.types";

function isCardTier(value: string): value is CardTier {
  return value === "bronze" || value === "silver" || value === "gold" || value === "special";
}

/** No-op (not an error) if the player has no card yet, or its group can't be resolved -- both are
 * transient states (e.g. mid-recompute) that simply have nothing to evaluate yet. */
export async function awardCardBadgesAndNotify(admin: SupabaseClient<Database>, playerId: string): Promise<void> {
  const [playerRes, cardRes] = await Promise.all([
    admin.from("players").select("group_id, user_id").eq("id", playerId).maybeSingle(),
    admin.from("player_cards").select("tier, is_provisional").eq("player_id", playerId).maybeSingle(),
  ]);
  if (playerRes.error) throw playerRes.error;
  if (cardRes.error) throw cardRes.error;
  if (!playerRes.data || !cardRes.data || !isCardTier(cardRes.data.tier)) return;

  const groupId = playerRes.data.group_id;
  const { data: groupRow, error: groupError } = await admin.from("groups").select("settings").eq("id", groupId).single();
  if (groupError) throw groupError;
  const settings = parseGroupSettings(groupRow.settings);

  const badgesRepo = createSupabaseBadgesRepo(admin);
  const awards = await awardCardBadges(badgesRepo, playerId, cardRes.data.tier, cardRes.data.is_provisional, settings.badges_enabled);
  if (awards.length === 0 || !playerRes.data.user_id) return; // guest: no auth account to notify

  const notificationsRepo = createSupabaseNotificationsRepo(admin);
  const url = `/g/${groupId}/jugadores/${playerId}`;
  for (const award of awards) {
    await notify(notificationsRepo, {
      userIds: [playerRes.data.user_id],
      groupId,
      kind: "badge_awarded",
      payload: badgeAwardedPayload({ badgeCode: award.code, url }),
    });
  }
}
