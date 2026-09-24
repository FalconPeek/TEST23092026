// Best-effort `tournament_generated` notification, called from lib/actions/tournaments.ts's
// generateTournamentBracket right after persistBracket succeeds. A standalone server-only helper
// (not folded into tournament-advance.ts, which is about post-*match*-advancement side effects)
// because it fires once, right after generation, from an action that only has a session client --
// notifications only grants DML to service_role, so this makes its own admin client, same pattern
// as tournament-advance.ts's handleTournamentAdvance.
import "server-only";
import { tournamentGeneratedPayload } from "@/lib/notifications/templates";
import { notify } from "@/lib/server/notifications";
import { createSupabaseNotificationsRepo } from "@/lib/server/notifications-repo";
import { loadUserIdsByPlayer } from "@/lib/server/player-users";
import { createSupabaseTournamentRepo } from "@/lib/server/tournament-repo";
import { createAdminClient } from "@/lib/supabase/admin";

/** Notifies every player on every entry (the tournament's actual participants, not the whole
 * group -- spectators/non-entrants have nothing to act on yet). Never throws. */
export async function notifyTournamentGeneratedBestEffort(tournamentId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: tournamentRow, error } = await admin
      .from("tournaments")
      .select("group_id, name")
      .eq("id", tournamentId)
      .maybeSingle();
    if (error) throw error;
    if (!tournamentRow) return;

    const tournamentRepo = createSupabaseTournamentRepo(admin);
    const entries = await tournamentRepo.loadEntries(tournamentId);
    const playerIds = [...new Set(entries.flatMap((e) => e.playerIds))];
    if (playerIds.length === 0) return;

    const userIdByPlayer = await loadUserIdsByPlayer(admin, playerIds);
    const userIds = [...new Set(playerIds.map((id) => userIdByPlayer.get(id)).filter((id): id is string => id !== undefined))];
    if (userIds.length === 0) return;

    const notificationsRepo = createSupabaseNotificationsRepo(admin);
    await notify(notificationsRepo, {
      userIds,
      groupId: tournamentRow.group_id,
      kind: "tournament_generated",
      payload: tournamentGeneratedPayload({
        tournamentName: tournamentRow.name,
        url: `/g/${tournamentRow.group_id}/torneos/${tournamentId}`,
      }),
    });
  } catch {
    // best-effort -- see doc comment above.
  }
}
