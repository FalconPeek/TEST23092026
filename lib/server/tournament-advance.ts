// Post-advancement side effects: awards tournament_champion (once the tournament is decided) and
// sends tournament_match_ready notifications for newly-paired matches. Split out from
// lib/server/tournaments.ts (which stays pure/DB-repo-only, no notifications concept) and called
// from every place lib/server/tournaments.ts's afterTournamentMatchCompleted is called:
// lib/server/finalize-repo.ts's advanceTournament (passes its own admin client) and
// lib/actions/tournaments.ts's tryAdvance (session-client-only action, so this makes its own admin
// client -- player_badges/notifications only grant DML to service_role either way). Always
// best-effort: never throws, callers still wrap it defensively themselves.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rng } from "@/lib/brackets";
import { badgeAwardedPayload, tournamentMatchReadyPayload } from "@/lib/notifications/templates";
import { createSupabaseBadgesRepo } from "@/lib/server/badges-repo";
import { notify } from "@/lib/server/notifications";
import { createSupabaseNotificationsRepo } from "@/lib/server/notifications-repo";
import { loadUserIdsByPlayer } from "@/lib/server/player-users";
import { createSupabaseTournamentRepo } from "@/lib/server/tournament-repo";
import { awardTournamentChampionIfDone, type AdvanceResult } from "@/lib/server/tournaments";
import { parseGroupSettings } from "@/lib/settings/group";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

async function notifyChampions(
  admin: SupabaseClient<Database>,
  tournamentId: string,
  groupId: string,
  badgesEnabled: boolean,
  rng: Rng,
): Promise<void> {
  const tournamentRepo = createSupabaseTournamentRepo(admin);
  const badgesRepo = createSupabaseBadgesRepo(admin);
  const awards = await awardTournamentChampionIfDone(tournamentRepo, badgesRepo, tournamentId, badgesEnabled, rng);
  if (awards.length === 0) return;

  const notificationsRepo = createSupabaseNotificationsRepo(admin);
  const userIdByPlayer = await loadUserIdsByPlayer(admin, awards.map((a) => a.playerId));
  for (const award of awards) {
    const userId = userIdByPlayer.get(award.playerId);
    if (!userId) continue; // guest: no auth account to notify
    await notify(notificationsRepo, {
      userIds: [userId],
      groupId,
      kind: "badge_awarded",
      payload: badgeAwardedPayload({ badgeCode: award.code, url: `/g/${groupId}/jugadores/${award.playerId}` }),
    });
  }
}

async function notifyNewlyReadyMatches(
  admin: SupabaseClient<Database>,
  tournamentId: string,
  groupId: string,
  advance: AdvanceResult,
): Promise<void> {
  if (advance.newlyReadyMatches.length === 0) return;

  const tournamentRepo = createSupabaseTournamentRepo(admin);
  const notificationsRepo = createSupabaseNotificationsRepo(admin);
  const entries = await tournamentRepo.loadEntries(tournamentId);
  const playerIdsByEntry = new Map(entries.map((e) => [e.id, e.playerIds]));

  for (const match of advance.newlyReadyMatches) {
    const playerIds = match.entryIds.flatMap((entryId) => playerIdsByEntry.get(entryId) ?? []);
    if (playerIds.length === 0) continue;
    const userIdByPlayer = await loadUserIdsByPlayer(admin, playerIds);
    const userIds = [...new Set(playerIds.map((id) => userIdByPlayer.get(id)).filter((id): id is string => id !== undefined))];
    if (userIds.length === 0) continue;
    await notify(notificationsRepo, {
      userIds,
      groupId,
      kind: "tournament_match_ready",
      payload: tournamentMatchReadyPayload({ round: match.round, url: `/g/${groupId}/torneos/${tournamentId}` }),
    });
  }
}

/** No-op (not an error) if the tournament can't be resolved -- a transient/racy call is not worth
 * failing over, matching every other best-effort hook in this module. */
export async function handleTournamentAdvance(
  tournamentId: string,
  advance: AdvanceResult,
  rng: Rng,
  admin: SupabaseClient<Database> = createAdminClient(),
): Promise<void> {
  try {
    const { data: tournamentRow, error } = await admin.from("tournaments").select("group_id").eq("id", tournamentId).maybeSingle();
    if (error) throw error;
    if (!tournamentRow) return;
    const groupId = tournamentRow.group_id;

    const { data: groupRow, error: groupError } = await admin.from("groups").select("settings").eq("id", groupId).single();
    if (groupError) throw groupError;
    const settings = parseGroupSettings(groupRow.settings);

    await notifyChampions(admin, tournamentId, groupId, settings.badges_enabled, rng);
    await notifyNewlyReadyMatches(admin, tournamentId, groupId, advance);
  } catch {
    // best-effort -- see doc comment above.
  }
}
