// FinalizeRepo: the only place lib/server/finalize.ts talks to Postgres, mirroring the
// RatingRepo/rating-repo.ts split (see lib/server/rating-repo.ts) so the orchestration in
// finalize.ts stays a pure, synchronously-testable function over an in-memory fake
// (finalize.test.ts) while createSupabaseFinalizeRepo below does the real I/O with the admin
// (service_role) client.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rng } from "@/lib/brackets";
import type { PlayerMatchStats, Side } from "@/lib/reconcile";
import type { AttributeKey, MatchFormInput } from "@/lib/rating";
import { recomputePlayer } from "@/lib/server/recompute";
import { createSupabaseRatingRepo } from "@/lib/server/rating-repo";
import { createSupabaseTournamentRepo } from "@/lib/server/tournament-repo";
import { afterTournamentMatchCompleted } from "@/lib/server/tournaments";
import { type GroupSettings, parseGroupSettings } from "@/lib/settings/group";
import type { Database, Json } from "@/lib/supabase/database.types";

export type ParticipantRole = "player" | "spectator";

export interface MatchRosterEntry {
  playerId: string;
  /** Arbitrary/unused for spectators (they have no team_id): side only matters for team players. */
  side: Side;
  role: ParticipantRole;
}

export interface MatchScoreReport {
  reporterId: string;
  team1Goals: number;
  team2Goals: number;
}

export interface MatchStatReport {
  reporterId: string;
  subjectId: string;
  goals: number;
  assists: number;
  ownGoals: number;
  saves: number;
}

export interface MatchRatingRow {
  raterId: string;
  targetId: string;
  rating: number;
  raterRole: ParticipantRole;
  standoutAttributes: AttributeKey[];
}

export interface DisputeStatOverride {
  subjectId: string;
  goals?: number;
  assists?: number;
  ownGoals?: number;
  saves?: number;
}

/** The organizer's authoritative values from the most recent `resolve_dispute` call (see
 * 20260923064115_match_lifecycle.sql), or null if this match was never disputed/resolved. */
export interface DisputeResolution {
  team1Goals: number;
  team2Goals: number;
  stats: DisputeStatOverride[] | null;
}

export interface MatchGraph {
  id: string;
  groupId: string;
  status: Database["public"]["Enums"]["match_status"];
  playedAt: Date | null;
  scheduledAt: Date;
  ratingDeadline: Date | null;
  roster: MatchRosterEntry[];
  scoreReports: MatchScoreReport[];
  statReports: MatchStatReport[];
  ratings: MatchRatingRow[];
  disputeResolution: DisputeResolution | null;
  /** Non-null when this real match is playing out a tournament fixture (matches.tournament_match_id). */
  tournamentMatchId: string | null;
  /** The fixture's tournament (tournament_matches.tournament_id), resolved alongside tournamentMatchId. */
  tournamentId: string | null;
}

export interface OpenskillSnapshot {
  mu: number;
  sigma: number;
  matchesPlayed: number;
}

export interface OpenskillUpdate {
  playerId: string;
  mu: number;
  sigma: number;
  ordinal: number;
  matchesPlayed: number;
}

export interface MatchResultSave {
  team1Goals: number;
  team2Goals: number;
  decidedBy: "regular" | "manual";
  winnerSide: Side | null;
  finalizedAt: Date;
}

export interface FinalizeRepo {
  /** Ids of `pending_finalize` matches whose rating window has already closed. */
  loadPendingFinalizeMatchIds(now: Date): Promise<string[]>;
  loadMatchGraph(matchId: string): Promise<MatchGraph | null>;
  loadGroupSettings(groupId: string): Promise<GroupSettings>;
  /** Current openskill_ratings row per player id; missing players simply have no entry. */
  loadOpenskillRatings(playerIds: string[]): Promise<Map<string, OpenskillSnapshot>>;
  /** Other finalized matches (excluding `excludeMatchId`) this player received ratings in,
   * played on or after `since`, oldest first is not required (recency-weighted in lib/rating/form). */
  loadRecentMatchRatings(playerId: string, since: Date, excludeMatchId: string): Promise<MatchFormInput[]>;

  saveMatchResult(matchId: string, result: MatchResultSave): Promise<void>;
  saveMatchStats(matchId: string, stats: PlayerMatchStats[], nRatingsByPlayer: Map<string, number>): Promise<void>;
  saveOpenskillRatings(updates: OpenskillUpdate[]): Promise<void>;
  setMatchDisputed(matchId: string): Promise<void>;
  setMatchFinalized(matchId: string, finalizedAt: Date): Promise<void>;
  logAudit(matchId: string, action: string, payload: unknown): Promise<void>;
  /** Recomputes one team player's card (attributes + OVR + tier) folding in match form; delegates
   * to the existing recompute pipeline (lib/server/recompute.ts) reason "match". */
  recomputeCard(playerId: string, now: Date, formMatches: MatchFormInput[]): Promise<void>;
  /** Mirrors engine.ts's resolveWinner via the confirm_match_result RPC (service_role): records
   * the just-finalized real match's score against its tournament fixture and propagates
   * advancement. Pens are always null today (Rule A never determines a penalty shootout for a
   * real match) -- a tied knockout fixture surfaces as PICADO_KO_DRAW, which the caller (see
   * finalizeMatch) catches and reports rather than failing the real match's own finalization. */
  confirmTournamentMatchResult(
    tournamentMatchId: string,
    result: { score1: number; score2: number; pens1: number | null; pens2: number | null },
  ): Promise<void>;
  /** Runs lib/server/tournaments.ts's afterTournamentMatchCompleted (groups_ko seeding / next
   * swiss round) for the tournament the just-confirmed fixture belongs to. */
  advanceTournament(tournamentId: string, rng: Rng): Promise<void>;
}

const SUB_ATTRIBUTE_KEYS = new Set<string>([
  "acceleration", "sprint_speed",
  "positioning", "finishing", "shot_power", "long_shots", "volleys", "penalties",
  "vision", "crossing", "free_kick", "short_passing", "long_passing", "curve",
  "agility", "balance", "reactions", "ball_control", "dribbling", "composure",
  "interceptions", "heading", "def_awareness", "standing_tackle", "sliding_tackle",
  "jumping", "stamina", "strength", "aggression",
  "gk_diving", "gk_handling", "gk_kicking", "gk_reflexes", "gk_positioning",
]);

function isAttributeKey(value: string): value is AttributeKey {
  return SUB_ATTRIBUTE_KEYS.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/** Parses the jsonb payload written by public.resolve_dispute (see 20260923064115_match_lifecycle.sql). */
function parseDisputeResolutionPayload(payload: unknown): DisputeResolution | null {
  if (!isRecord(payload)) return null;
  const team1Goals = numberOrUndefined(payload.team1_goals);
  const team2Goals = numberOrUndefined(payload.team2_goals);
  if (team1Goals === undefined || team2Goals === undefined) return null;

  let stats: DisputeStatOverride[] | null = null;
  if (Array.isArray(payload.stats)) {
    stats = payload.stats.filter(isRecord).map((row) => ({
      subjectId: String(row.subject_player_id ?? ""),
      goals: numberOrUndefined(row.goals),
      assists: numberOrUndefined(row.assists),
      ownGoals: numberOrUndefined(row.own_goals),
      saves: numberOrUndefined(row.saves),
    }));
  }

  return { team1Goals, team2Goals, stats };
}

export function createSupabaseFinalizeRepo(admin: SupabaseClient<Database>): FinalizeRepo {
  const ratingRepo = createSupabaseRatingRepo(admin);

  return {
    async loadPendingFinalizeMatchIds(now) {
      const { data, error } = await admin
        .from("matches")
        .select("id, rating_deadline")
        .eq("status", "pending_finalize");
      if (error) throw error;
      return (data ?? [])
        .filter((m) => m.rating_deadline === null || new Date(m.rating_deadline) <= now)
        .map((m) => m.id);
    },

    async loadMatchGraph(matchId) {
      const { data: match, error: matchError } = await admin
        .from("matches")
        .select("id, group_id, status, played_at, scheduled_at, rating_deadline, tournament_match_id")
        .eq("id", matchId)
        .maybeSingle();
      if (matchError) throw matchError;
      if (!match) return null;

      let tournamentId: string | null = null;
      if (match.tournament_match_id) {
        const { data: tm, error: tmError } = await admin
          .from("tournament_matches")
          .select("tournament_id")
          .eq("id", match.tournament_match_id)
          .maybeSingle();
        if (tmError) throw tmError;
        tournamentId = tm?.tournament_id ?? null;
      }

      const [teamsRes, participantsRes, scoreRes, statRes, ratingsRes, auditRes] = await Promise.all([
        admin.from("match_teams").select("id, side").eq("match_id", matchId),
        admin.from("match_participants").select("player_id, team_id, role").eq("match_id", matchId),
        admin.from("score_reports").select("reporter_player_id, team1_goals, team2_goals").eq("match_id", matchId),
        admin
          .from("stat_reports")
          .select("reporter_player_id, subject_player_id, goals, assists, own_goals, saves")
          .eq("match_id", matchId),
        admin
          .from("match_ratings")
          .select("rater_player_id, target_player_id, rating, rater_role, standout_attributes")
          .eq("match_id", matchId),
        admin
          .from("match_audit")
          .select("payload")
          .eq("match_id", matchId)
          .eq("action", "resolve_dispute")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
      if (teamsRes.error) throw teamsRes.error;
      if (participantsRes.error) throw participantsRes.error;
      if (scoreRes.error) throw scoreRes.error;
      if (statRes.error) throw statRes.error;
      if (ratingsRes.error) throw ratingsRes.error;
      if (auditRes.error) throw auditRes.error;

      const sideByTeamId = new Map((teamsRes.data ?? []).map((t) => [t.id, t.side as Side]));
      const roster: MatchRosterEntry[] = (participantsRes.data ?? []).map((p) => ({
        playerId: p.player_id,
        side: (p.team_id ? sideByTeamId.get(p.team_id) : undefined) ?? 1,
        role: p.role,
      }));

      const scoreReports: MatchScoreReport[] = (scoreRes.data ?? []).map((r) => ({
        reporterId: r.reporter_player_id,
        team1Goals: r.team1_goals,
        team2Goals: r.team2_goals,
      }));

      const statReports: MatchStatReport[] = (statRes.data ?? []).map((r) => ({
        reporterId: r.reporter_player_id,
        subjectId: r.subject_player_id,
        goals: r.goals,
        assists: r.assists,
        ownGoals: r.own_goals,
        saves: r.saves,
      }));

      const ratings: MatchRatingRow[] = (ratingsRes.data ?? []).map((r) => ({
        raterId: r.rater_player_id,
        targetId: r.target_player_id,
        rating: r.rating,
        raterRole: r.rater_role,
        standoutAttributes: (r.standout_attributes ?? []).filter(isAttributeKey),
      }));

      const disputeResolution = parseDisputeResolutionPayload(auditRes.data?.[0]?.payload);

      return {
        id: match.id,
        groupId: match.group_id,
        status: match.status,
        playedAt: match.played_at ? new Date(match.played_at) : null,
        scheduledAt: new Date(match.scheduled_at),
        ratingDeadline: match.rating_deadline ? new Date(match.rating_deadline) : null,
        roster,
        scoreReports,
        statReports,
        ratings,
        disputeResolution,
        tournamentMatchId: match.tournament_match_id,
        tournamentId,
      };
    },

    async loadGroupSettings(groupId) {
      const { data, error } = await admin.from("groups").select("settings").eq("id", groupId).single();
      if (error) throw error;
      return parseGroupSettings(data.settings);
    },

    async loadOpenskillRatings(playerIds) {
      const result = new Map<string, OpenskillSnapshot>();
      if (playerIds.length === 0) return result;
      const { data, error } = await admin
        .from("openskill_ratings")
        .select("player_id, mu, sigma, matches_played")
        .in("player_id", playerIds);
      if (error) throw error;
      for (const row of data ?? []) {
        result.set(row.player_id, { mu: row.mu, sigma: row.sigma, matchesPlayed: row.matches_played });
      }
      return result;
    },

    async loadRecentMatchRatings(playerId, since, excludeMatchId) {
      // Two-step instead of an embedded `matches!inner(...)` select: keeps the query result
      // shape a plain flat row (no ambiguity about whether the embed is a single object or an
      // array), which the generated Database types don't disambiguate for us here.
      const ratingsRes = await admin
        .from("match_ratings")
        .select("match_id, rating, rater_role, standout_attributes")
        .eq("target_player_id", playerId)
        .neq("match_id", excludeMatchId);
      if (ratingsRes.error) throw ratingsRes.error;
      const ratingRows = ratingsRes.data ?? [];
      if (ratingRows.length === 0) return [];

      const matchIds = [...new Set(ratingRows.map((r) => r.match_id))];
      const matchesRes = await admin
        .from("matches")
        .select("id, played_at, scheduled_at")
        .in("id", matchIds)
        .eq("status", "finalized")
        .gte("played_at", since.toISOString());
      if (matchesRes.error) throw matchesRes.error;

      const playedAtById = new Map(
        (matchesRes.data ?? []).map((m) => [m.id, new Date(m.played_at ?? m.scheduled_at)]),
      );

      const byMatch = new Map<string, { playedAt: Date; ratings: { value: number; raterRole: ParticipantRole }[]; standout: Set<AttributeKey> }>();
      for (const row of ratingRows) {
        const playedAt = playedAtById.get(row.match_id);
        if (!playedAt) continue; // not finalized, or outside the recency window
        const entry = byMatch.get(row.match_id) ?? { playedAt, ratings: [], standout: new Set<AttributeKey>() };
        entry.ratings.push({ value: row.rating, raterRole: row.rater_role });
        for (const attr of (row.standout_attributes ?? []).filter(isAttributeKey)) entry.standout.add(attr);
        byMatch.set(row.match_id, entry);
      }

      return [...byMatch.values()].map((m) => ({
        playedAt: m.playedAt,
        ratings: m.ratings,
        standoutAttributes: [...m.standout],
      }));
    },

    async saveMatchResult(matchId, result) {
      const { error } = await admin.from("match_results").upsert(
        {
          match_id: matchId,
          team1_goals: result.team1Goals,
          team2_goals: result.team2Goals,
          pens1: null,
          pens2: null,
          decided_by: result.decidedBy,
          winner_side: result.winnerSide,
          finalized_at: result.finalizedAt.toISOString(),
        },
        { onConflict: "match_id" },
      );
      if (error) throw error;
    },

    async saveMatchStats(matchId, stats, nRatingsByPlayer) {
      if (stats.length === 0) return;
      const rows = stats.map((s) => ({
        match_id: matchId,
        player_id: s.playerId,
        goals: s.goals,
        assists: s.assists,
        own_goals: s.ownGoals,
        saves: s.saves,
        clean_sheet: s.cleanSheet,
        is_mvp: s.isMvp,
        median_rating: s.medianRating,
        n_ratings: nRatingsByPlayer.get(s.playerId) ?? 0,
      }));
      const { error } = await admin.from("match_stats").upsert(rows, { onConflict: "match_id,player_id" });
      if (error) throw error;
    },

    async saveOpenskillRatings(updates) {
      if (updates.length === 0) return;
      const rows = updates.map((u) => ({
        player_id: u.playerId,
        mu: u.mu,
        sigma: u.sigma,
        ordinal: u.ordinal,
        matches_played: u.matchesPlayed,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await admin.from("openskill_ratings").upsert(rows, { onConflict: "player_id" });
      if (error) throw error;
    },

    async setMatchDisputed(matchId) {
      const { error } = await admin.from("matches").update({ status: "disputed" }).eq("id", matchId);
      if (error) throw error;
    },

    async setMatchFinalized(matchId, finalizedAt) {
      const { error } = await admin
        .from("matches")
        .update({ status: "finalized", finalized_at: finalizedAt.toISOString() })
        .eq("id", matchId);
      if (error) throw error;
    },

    async logAudit(matchId, action, payload) {
      const { error } = await admin
        .from("match_audit")
        .insert({ match_id: matchId, actor_user_id: null, action, payload: payload as Json });
      if (error) throw error;
    },

    async recomputeCard(playerId, now, formMatches) {
      await recomputePlayer(ratingRepo, playerId, now, formMatches, "match");
    },

    async confirmTournamentMatchResult(tournamentMatchId, result) {
      const { error } = await admin.rpc("confirm_match_result", {
        p_tournament_match_id: tournamentMatchId,
        p_score1: result.score1,
        p_score2: result.score2,
        p_pens1: result.pens1 ?? undefined,
        p_pens2: result.pens2 ?? undefined,
      });
      if (error) throw error;
    },

    async advanceTournament(tournamentId, rng) {
      const tournamentRepo = createSupabaseTournamentRepo(admin);
      await afterTournamentMatchCompleted(tournamentRepo, tournamentId, rng);
    },
  };
}
