// BadgesRepo: the only place lib/server/badges.ts talks to Postgres, mirroring the
// FinalizeRepo/RatingRepo split so badge awarding stays testable against an in-memory fake
// (badges.test.ts) while createSupabaseBadgesRepo below does the real I/O with the admin
// (service_role) client -- player_badges only grants DML to service_role (see
// 20260923211703_badges_tables.sql), so this repo is always constructed with the admin client.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type BadgeAward, type BadgeCode, type MatchBadgeHistoryEntry, isBadgeCode } from "@/lib/badges/engine";
import type { Database } from "@/lib/supabase/database.types";

export interface BadgesRepo {
  /** This player's `role = 'player'` participations in finalized matches, ascending by
   * played_at. Assumes the caller already persisted the current match's match_stats/match_results
   * row (finalizeMatch does, before awarding badges) so it's included as the last entry. */
  loadPlayerMatchHistory(playerId: string): Promise<MatchBadgeHistoryEntry[]>;
  loadExistingBadgeCodes(playerId: string): Promise<Set<BadgeCode>>;
  /** Distinct players this player has ever cast a (possibly since-superseded) scouting vote for. */
  loadScoutingTargetCount(playerId: string): Promise<number>;
  saveAwards(playerId: string, awards: BadgeAward[]): Promise<void>;
}

export function createSupabaseBadgesRepo(admin: SupabaseClient<Database>): BadgesRepo {
  return {
    async loadPlayerMatchHistory(playerId) {
      const statsRes = await admin
        .from("match_stats")
        .select("match_id, goals, assists, clean_sheet, is_mvp")
        .eq("player_id", playerId);
      if (statsRes.error) throw statsRes.error;
      const statsRows = statsRes.data ?? [];
      if (statsRows.length === 0) return [];

      const matchIds = statsRows.map((r) => r.match_id);
      const [matchesRes, participantsRes, resultsRes] = await Promise.all([
        admin.from("matches").select("id, played_at, scheduled_at, status").in("id", matchIds).eq("status", "finalized"),
        admin.from("match_participants").select("match_id, team_id, role").eq("player_id", playerId).in("match_id", matchIds),
        admin.from("match_results").select("match_id, winner_side").in("match_id", matchIds),
      ]);
      if (matchesRes.error) throw matchesRes.error;
      if (participantsRes.error) throw participantsRes.error;
      if (resultsRes.error) throw resultsRes.error;

      const finalizedMatches = new Map((matchesRes.data ?? []).map((m) => [m.id, new Date(m.played_at ?? m.scheduled_at)]));
      const participantByMatch = new Map((participantsRes.data ?? []).filter((p) => p.role === "player").map((p) => [p.match_id, p.team_id]));
      const teamIds = [...participantByMatch.values()].filter((id): id is string => id !== null);
      const winnerSideByMatch = new Map((resultsRes.data ?? []).map((r) => [r.match_id, r.winner_side]));

      let sideByTeamId = new Map<string, number>();
      if (teamIds.length > 0) {
        const teamsRes = await admin.from("match_teams").select("id, side").in("id", teamIds);
        if (teamsRes.error) throw teamsRes.error;
        sideByTeamId = new Map((teamsRes.data ?? []).map((t) => [t.id, t.side]));
      }

      const entries: (MatchBadgeHistoryEntry & { playedAt: Date })[] = [];
      for (const row of statsRows) {
        const playedAt = finalizedMatches.get(row.match_id);
        if (!playedAt) continue; // not finalized (yet), or somehow missing -- skip, not a badge-eligible match
        const teamId = participantByMatch.get(row.match_id);
        if (teamId === undefined) continue; // this player was a spectator in that match, not a team player
        const side = teamId ? sideByTeamId.get(teamId) : undefined;
        const winnerSide = winnerSideByMatch.get(row.match_id) ?? null;
        const result: MatchBadgeHistoryEntry["result"] = winnerSide === null ? "draw" : winnerSide === side ? "win" : "loss";
        entries.push({
          matchId: row.match_id,
          goals: row.goals,
          assists: row.assists,
          cleanSheet: row.clean_sheet,
          isMvp: row.is_mvp,
          result,
          playedAt,
        });
      }

      entries.sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
      return entries.map((e) => ({ matchId: e.matchId, goals: e.goals, assists: e.assists, cleanSheet: e.cleanSheet, isMvp: e.isMvp, result: e.result }));
    },

    async loadExistingBadgeCodes(playerId) {
      const { data, error } = await admin.from("player_badges").select("badge_code").eq("player_id", playerId);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.badge_code).filter(isBadgeCode));
    },

    async loadScoutingTargetCount(playerId) {
      const { data, error } = await admin.from("scouting_votes").select("target_player_id").eq("rater_player_id", playerId);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.target_player_id)).size;
    },

    async saveAwards(playerId, awards) {
      for (const award of awards) {
        if (award.increment) {
          // Repeatable badge: read-then-write to bump `count` (no server-side increment available
          // through supabase-js upsert). Best-effort/low-concurrency by construction -- badges are
          // only ever awarded from a single finalizeMatch/tournament-completion call at a time per
          // player, so a lost increment from a genuine race is a cosmetic undercount, not a
          // correctness bug, and self-heals on the next occurrence.
          const { data: existing, error: readError } = await admin
            .from("player_badges")
            .select("count")
            .eq("player_id", playerId)
            .eq("badge_code", award.code)
            .maybeSingle();
          if (readError) throw readError;
          const { error: upsertError } = await admin.from("player_badges").upsert(
            {
              player_id: playerId,
              badge_code: award.code,
              count: (existing?.count ?? 0) + 1,
              awarded_at: new Date().toISOString(),
              match_id: award.matchId ?? null,
              tournament_id: award.tournamentId ?? null,
            },
            { onConflict: "player_id,badge_code" },
          );
          if (upsertError) throw upsertError;
        } else {
          // One-time badge: insert once, silently keep the existing row on conflict (idempotent).
          const { error } = await admin
            .from("player_badges")
            .upsert(
              {
                player_id: playerId,
                badge_code: award.code,
                match_id: award.matchId ?? null,
                tournament_id: award.tournamentId ?? null,
              },
              { onConflict: "player_id,badge_code", ignoreDuplicates: true },
            );
          if (error) throw error;
        }
      }
    },
  };
}
