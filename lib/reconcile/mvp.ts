// Clean sheets and MVP selection, computed once Rule A has produced a final score + stats.

import type { MatchResultScore, ReconciledPlayerStats, RosterEntry, Side } from "./types";

/** Every player (any position) on a side that conceded 0 gets a clean sheet. */
export function computeCleanSheets(roster: RosterEntry[], score: MatchResultScore): Map<string, boolean> {
  const conceded: Record<Side, number> = { 1: score.team2Goals, 2: score.team1Goals };
  const result = new Map<string, boolean>();
  for (const r of roster) {
    if (r.role !== "player") continue;
    result.set(r.playerId, conceded[r.side] === 0);
  }
  return result;
}

export interface MvpCandidate {
  playerId: string;
  medianRating: number;
  goals: number;
  assists: number;
  openskillOrdinal: number;
}

/**
 * Highest median rating wins; ties broken by goals+assists, then OpenSkill ordinal, then
 * player id (ascending) as a final, arbitrary-but-deterministic tiebreak.
 */
export function selectMvp(candidates: MvpCandidate[]): string | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort(
    (a, b) =>
      b.medianRating - a.medianRating ||
      b.goals + b.assists - (a.goals + a.assists) ||
      b.openskillOrdinal - a.openskillOrdinal ||
      a.playerId.localeCompare(b.playerId),
  );
  return sorted[0].playerId;
}

export function buildMvpCandidates(
  stats: ReconciledPlayerStats[],
  medianRatings: Map<string, number>,
  openskillOrdinals: Map<string, number>,
): MvpCandidate[] {
  return stats
    .filter((s) => medianRatings.has(s.playerId))
    .map((s) => ({
      playerId: s.playerId,
      medianRating: medianRatings.get(s.playerId)!,
      goals: s.goals,
      assists: s.assists,
      openskillOrdinal: openskillOrdinals.get(s.playerId) ?? 0,
    }));
}
