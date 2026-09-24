// Loads everything a squad page needs for one group (players, cards, club rosters, shared
// appearances, squad settings) and returns the pure SquadContext from lib/squads/view.ts.
// Works with the session client (RSC pages, RLS-scoped) or the admin client (public OG image).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { parseGroupSettings, type SquadSettings } from "@/lib/settings/group";
import { buildSquadContext, type SharedAppearanceRow, type SquadContext } from "@/lib/squads/view";

export async function loadSquadContext(
  supabase: SupabaseClient<Database>,
  groupId: string,
  options: { sharedAppearances?: SharedAppearanceRow[] } = {},
): Promise<{ context: SquadContext; settings: SquadSettings }> {
  const [groupRes, playersRes, clubsRes] = await Promise.all([
    supabase.from("groups").select("settings").eq("id", groupId).single(),
    supabase
      .from("players")
      .select("id, display_name, avatar_url, primary_position, alt_positions")
      .eq("group_id", groupId)
      .is("left_at", null),
    supabase.from("clubs").select("id, club_players(club_id, player_id)").eq("group_id", groupId),
  ]);
  if (groupRes.error) throw groupRes.error;
  if (playersRes.error) throw playersRes.error;
  if (clubsRes.error) throw clubsRes.error;

  const players = playersRes.data ?? [];
  const cardsRes = await supabase
    .from("player_cards")
    .select("player_id, ovr, ovr_by_position, tier, is_provisional")
    .in("player_id", players.map((p) => p.id));
  if (cardsRes.error) throw cardsRes.error;

  // The RPC checks membership, so the admin client (no auth.uid) passes shared appearances in.
  let shared = options.sharedAppearances;
  if (!shared) {
    const sharedRes = await supabase.rpc("get_shared_appearances", { p_group_id: groupId });
    if (sharedRes.error) throw sharedRes.error;
    shared = sharedRes.data ?? [];
  }

  const clubPlayers = (clubsRes.data ?? []).flatMap((c) => c.club_players);
  return {
    context: buildSquadContext(players, cardsRes.data ?? [], clubPlayers, shared),
    settings: parseGroupSettings(groupRes.data.settings).squads,
  };
}

/** Same pairs as public.get_shared_appearances, for the admin client (no auth.uid), e.g. the
 * public share image. Only ever called for a group whose squad is published. */
export async function loadSharedAppearancesAdmin(admin: SupabaseClient<Database>, groupId: string): Promise<SharedAppearanceRow[]> {
  const { data, error } = await admin
    .from("match_participants")
    .select("match_id, team_id, player_id, matches!inner(group_id, status)")
    .eq("matches.group_id", groupId)
    .eq("matches.status", "finalized")
    .eq("role", "player")
    .not("team_id", "is", null);
  if (error) throw error;

  const byTeam = new Map<string, { matchId: string; players: string[] }>();
  for (const row of data ?? []) {
    const key = `${row.match_id}|${row.team_id}`;
    const entry = byTeam.get(key) ?? { matchId: row.match_id, players: [] };
    entry.players.push(row.player_id);
    byTeam.set(key, entry);
  }
  const counts = new Map<string, SharedAppearanceRow>();
  for (const { players } of byTeam.values()) {
    const sorted = [...new Set(players)].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}|${sorted[j]}`;
        const row = counts.get(key) ?? { player_a: sorted[i]!, player_b: sorted[j]!, matches: 0 };
        row.matches += 1;
        counts.set(key, row);
      }
    }
  }
  return [...counts.values()];
}
