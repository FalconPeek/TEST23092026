// Match finalizer: orchestrates Rule A reconciliation (lib/reconcile), OpenSkill updates
// (lib/rating/openskill) and card recompute (lib/server/recompute, via FinalizeRepo.recomputeCard)
// for one match, driven entirely through the injected FinalizeRepo -- no I/O happens here
// directly, which is what makes this file testable with an in-memory fake (finalize.test.ts).
import {
  buildMvpCandidates,
  computeCleanSheets,
  computePlayerStats,
  reconcileMatch,
  selectMvp,
} from "@/lib/reconcile";
import type {
  DisputeReason,
  PlayerMatchStats,
  ReconciledPlayerStats,
  RosterEntry,
  ScoreReportInput,
  Side,
  StatReportInput,
} from "@/lib/reconcile";
import { initialRating, matchWeightedMedian, ordinal as openskillOrdinal, rateMatch } from "@/lib/rating";
import type { AttributeKey, MatchFormInput, MatchRatingVote } from "@/lib/rating";
import type { GroupSettings } from "@/lib/settings/group";
import type { DisputeStatOverride, FinalizeRepo, MatchGraph, MatchRosterEntry, OpenskillSnapshot } from "./finalize-repo";

/** How many form half-lives back to fetch a player's recent match-rating history for
 * (lib/rating/form's computeFormAdjustments already decays each match's contribution to F with
 * age; this only bounds how much history is worth *fetching* -- beyond ~6 half-lives a match
 * contributes under 2% either way). Deliberately not a group setting: it doesn't change the
 * math, only the size of one query. */
const FORM_HISTORY_HALF_LIFE_MULTIPLIER = 6;

export type FinalizeOutcome =
  | { matchId: string; status: "finalized" }
  | { matchId: string; status: "disputed"; reasons: DisputeReason[] }
  | {
      matchId: string;
      status: "skipped";
      reason: "not_found" | "not_pending_finalize" | "rating_window_open" | "already_finalized" | "already_disputed";
    };

function buildRoster(graph: MatchGraph): RosterEntry[] {
  return graph.roster.map((r) => ({ playerId: r.playerId, side: r.side, role: r.role }));
}

function sideOfPlayer(roster: MatchRosterEntry[], playerId: string): Side {
  return roster.find((r) => r.playerId === playerId)?.side ?? 1;
}

function buildScoreReportInputs(graph: MatchGraph): ScoreReportInput[] {
  return graph.scoreReports.map((r) => ({
    reporterId: r.reporterId,
    reporterSide: sideOfPlayer(graph.roster, r.reporterId),
    team1Goals: r.team1Goals,
    team2Goals: r.team2Goals,
  }));
}

function buildStatReportInputs(graph: MatchGraph): StatReportInput[] {
  return graph.statReports.map((r) => ({
    reporterId: r.reporterId,
    subjectId: r.subjectId,
    goals: r.goals,
    assists: r.assists,
    ownGoals: r.ownGoals,
    saves: r.saves,
  }));
}

interface RatingsByTarget {
  votes: Map<string, MatchRatingVote[]>;
  standout: Map<string, Set<AttributeKey>>;
  counts: Map<string, number>;
}

function groupRatingsByTarget(graph: MatchGraph): RatingsByTarget {
  const votes = new Map<string, MatchRatingVote[]>();
  const standout = new Map<string, Set<AttributeKey>>();
  const counts = new Map<string, number>();
  for (const r of graph.ratings) {
    votes.set(r.targetId, [...(votes.get(r.targetId) ?? []), { value: r.rating, raterRole: r.raterRole }]);
    const s = standout.get(r.targetId) ?? new Set<AttributeKey>();
    for (const attr of r.standoutAttributes) s.add(attr);
    standout.set(r.targetId, s);
    counts.set(r.targetId, (counts.get(r.targetId) ?? 0) + 1);
  }
  return { votes, standout, counts };
}

function buildMedianRatings(playedAt: Date, byTarget: RatingsByTarget, settings: GroupSettings): Map<string, number> {
  const result = new Map<string, number>();
  for (const [targetId, ratings] of byTarget.votes) {
    const m = matchWeightedMedian({ playedAt, ratings }, settings.rating);
    if (m !== undefined) result.set(targetId, m);
  }
  return result;
}

/** Current (pre-this-match) OpenSkill ordinal per team player, used only as an MVP tiebreak. */
function buildCurrentOrdinals(roster: RosterEntry[], skills: Map<string, OpenskillSnapshot>, settings: GroupSettings): Map<string, number> {
  const result = new Map<string, number>();
  for (const r of roster) {
    if (r.role !== "player") continue;
    const snap = skills.get(r.playerId) ?? initialRating(settings.rating.openskill);
    result.set(r.playerId, openskillOrdinal(snap));
  }
  return result;
}

/** Applies only the fields the organizer actually overrode; everything else stays the Rule A
 * per-player median computed from the raw stat reports. */
function applyDisputeOverrides(baseline: ReconciledPlayerStats[], overrides: DisputeStatOverride[] | null): ReconciledPlayerStats[] {
  if (!overrides || overrides.length === 0) return baseline;
  const byId = new Map(overrides.map((o) => [o.subjectId, o]));
  return baseline.map((s) => {
    const o = byId.get(s.playerId);
    if (!o) return s;
    return {
      ...s,
      goals: o.goals ?? s.goals,
      assists: o.assists ?? s.assists,
      ownGoals: o.ownGoals ?? s.ownGoals,
      saves: o.saves ?? s.saves,
    };
  });
}

function winnerSideOf(team1Goals: number, team2Goals: number): Side | null {
  if (team1Goals > team2Goals) return 1;
  if (team2Goals > team1Goals) return 2;
  return null;
}

/**
 * Finalizes one match: reconciles score/stats (or trusts an admin's resolve_dispute override),
 * persists match_results/match_stats, updates OpenSkill, marks the match finalized, and
 * recomputes every team player's card. Idempotent (a no-op on an already-finalized or
 * already-disputed match) and only processes a `pending_finalize` match whose rating window has
 * actually closed -- callers that want to force it early (finalizeMatchNow) must first close the
 * window (public.request_finalize) so `graph.ratingDeadline <= now` holds.
 */
export async function finalizeMatch(repo: FinalizeRepo, matchId: string, now: Date): Promise<FinalizeOutcome> {
  const graph = await repo.loadMatchGraph(matchId);
  if (!graph) return { matchId, status: "skipped", reason: "not_found" };
  if (graph.status === "finalized") return { matchId, status: "skipped", reason: "already_finalized" };
  if (graph.status === "disputed") return { matchId, status: "skipped", reason: "already_disputed" };
  if (graph.status !== "pending_finalize") return { matchId, status: "skipped", reason: "not_pending_finalize" };
  if (graph.ratingDeadline && graph.ratingDeadline > now) return { matchId, status: "skipped", reason: "rating_window_open" };

  const settings = await repo.loadGroupSettings(graph.groupId);
  const roster = buildRoster(graph);
  const playedAt = graph.playedAt ?? graph.scheduledAt;
  const byTarget = groupRatingsByTarget(graph);
  const medianRatings = buildMedianRatings(playedAt, byTarget, settings);

  const rosterPlayerIds = roster.filter((r) => r.role === "player").map((r) => r.playerId);
  const skills = await repo.loadOpenskillRatings(rosterPlayerIds);
  const openskillOrdinals = buildCurrentOrdinals(roster, skills, settings);

  let score: { team1Goals: number; team2Goals: number };
  let stats: PlayerMatchStats[];
  let decidedBy: "regular" | "manual";

  if (graph.disputeResolution) {
    // An admin already resolved this dispute (public.resolve_dispute logged the authoritative
    // score/stats to match_audit); trust those instead of re-running Rule A, which would very
    // likely dispute again on the same conflicting reports. Rule A's per-player median still
    // seeds every field the admin didn't explicitly override.
    score = { team1Goals: graph.disputeResolution.team1Goals, team2Goals: graph.disputeResolution.team2Goals };
    const baseline = computePlayerStats(buildStatReportInputs(graph), roster);
    const merged = applyDisputeOverrides(baseline, graph.disputeResolution.stats);
    const cleanSheets = computeCleanSheets(roster, score);
    const mvpPlayerId = selectMvp(buildMvpCandidates(merged, medianRatings, openskillOrdinals));
    stats = merged.map((s) => ({
      ...s,
      cleanSheet: cleanSheets.get(s.playerId) ?? false,
      isMvp: s.playerId === mvpPlayerId,
      medianRating: medianRatings.get(s.playerId) ?? null,
    }));
    decidedBy = "manual";
  } else {
    const reconciled = reconcileMatch({
      roster,
      scoreReports: buildScoreReportInputs(graph),
      statReports: buildStatReportInputs(graph),
      medianRatings,
      openskillOrdinals,
    });
    if (reconciled.status === "disputed") {
      await repo.setMatchDisputed(matchId);
      await repo.logAudit(matchId, "auto_dispute", { reasons: reconciled.reasons });
      return { matchId, status: "disputed", reasons: reconciled.reasons };
    }
    score = reconciled.result;
    stats = reconciled.stats;
    decidedBy = "regular";
  }

  await repo.saveMatchResult(matchId, {
    team1Goals: score.team1Goals,
    team2Goals: score.team2Goals,
    decidedBy,
    winnerSide: winnerSideOf(score.team1Goals, score.team2Goals),
    finalizedAt: now,
  });
  await repo.saveMatchStats(matchId, stats, byTarget.counts);

  await updateOpenskill(repo, roster, score, skills, settings);

  await repo.setMatchFinalized(matchId, now);

  await recomputeCards(repo, matchId, roster, byTarget, playedAt, settings, now);

  return { matchId, status: "finalized" };
}

async function updateOpenskill(
  repo: FinalizeRepo,
  roster: RosterEntry[],
  score: { team1Goals: number; team2Goals: number },
  skills: Map<string, OpenskillSnapshot>,
  settings: GroupSettings,
): Promise<void> {
  const side1 = roster.filter((r) => r.role === "player" && r.side === 1).map((r) => r.playerId);
  const side2 = roster.filter((r) => r.role === "player" && r.side === 2).map((r) => r.playerId);
  if (side1.length === 0 || side2.length === 0) return; // nothing to rate (e.g. a side with no team players)

  const ratingOf = (playerId: string) => {
    const snap = skills.get(playerId);
    return snap ? { mu: snap.mu, sigma: snap.sigma } : initialRating(settings.rating.openskill);
  };

  const teams = [side1.map(ratingOf), side2.map(ratingOf)];
  // rank 0 = best; a draw ranks both teams 0 (tie), matching lib/rating/openskill's rateMatch contract.
  const ranks = score.team1Goals > score.team2Goals ? [0, 1] : score.team2Goals > score.team1Goals ? [1, 0] : [0, 0];

  const [updated1, updated2] = rateMatch(teams, ranks, settings.rating.openskill);

  const updates = [
    ...side1.map((playerId, i) => ({ playerId, rating: updated1[i] })),
    ...side2.map((playerId, i) => ({ playerId, rating: updated2[i] })),
  ].map(({ playerId, rating }) => ({
    playerId,
    mu: rating.mu,
    sigma: rating.sigma,
    ordinal: openskillOrdinal(rating),
    matchesPlayed: (skills.get(playerId)?.matchesPlayed ?? 0) + 1,
  }));

  await repo.saveOpenskillRatings(updates);
}

async function recomputeCards(
  repo: FinalizeRepo,
  matchId: string,
  roster: RosterEntry[],
  byTarget: RatingsByTarget,
  playedAt: Date,
  settings: GroupSettings,
  now: Date,
): Promise<void> {
  const windowStart = new Date(
    now.getTime() - settings.rating.form.half_life_days * FORM_HISTORY_HALF_LIFE_MULTIPLIER * 24 * 60 * 60 * 1000,
  );

  // Only team players get card updates from match form -- ratings only ever target team players
  // (submit_match_ratings enforces this), so spectators never receive one here either way.
  for (const r of roster) {
    if (r.role !== "player") continue;
    const thisMatch: MatchFormInput = {
      playedAt,
      ratings: byTarget.votes.get(r.playerId) ?? [],
      standoutAttributes: [...(byTarget.standout.get(r.playerId) ?? [])],
    };
    const priorMatches = await repo.loadRecentMatchRatings(r.playerId, windowStart, matchId);
    await repo.recomputeCard(r.playerId, now, [thisMatch, ...priorMatches]);
  }
}

export interface ProcessPendingFinalizeResult {
  matchIds: string[];
  outcomes: FinalizeOutcome[];
  finalized: number;
  disputed: number;
  errors: { matchId: string; error: string }[];
}

/** Drains every `pending_finalize` match whose rating window has closed. A single match's
 * failure is collected and does not stop the rest of the batch (mirrors drainRecomputeQueue). */
export async function processPendingFinalize(repo: FinalizeRepo, now: Date): Promise<ProcessPendingFinalizeResult> {
  const matchIds = await repo.loadPendingFinalizeMatchIds(now);
  const outcomes: FinalizeOutcome[] = [];
  const errors: { matchId: string; error: string }[] = [];

  for (const matchId of matchIds) {
    try {
      outcomes.push(await finalizeMatch(repo, matchId, now));
    } catch (err) {
      errors.push({ matchId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    matchIds,
    outcomes,
    finalized: outcomes.filter((o) => o.status === "finalized").length,
    disputed: outcomes.filter((o) => o.status === "disputed").length,
    errors,
  };
}
