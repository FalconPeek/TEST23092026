// Thin, pure wrapper around the `openskill` package (Plackett-Luce model) for team matches,
// including draws (equal `rank` = tie). No RNG involved — openskill is itself deterministic.

import { ordinal as openskillOrdinal, rate as openskillRate } from "openskill";
import type { RatingSettings } from "@/lib/settings/group";

export interface SkillRating {
  mu: number;
  sigma: number;
}

export function initialRating(settings: RatingSettings["openskill"]): SkillRating {
  return { mu: settings.mu, sigma: settings.sigma };
}

/**
 * Updates every player's rating from a finalized match.
 * `ranks[i]` is the placement of `teams[i]` (0 = best); equal values mean a draw between
 * those teams. For a 2-team match: side with more goals gets rank 0, the loser rank 1, and a
 * draw is `[0, 0]`.
 */
export function rateMatch(teams: SkillRating[][], ranks: number[], settings: RatingSettings["openskill"]): SkillRating[][] {
  if (teams.length !== ranks.length) {
    throw new Error("rateMatch: teams and ranks must have the same length");
  }
  const result = openskillRate(teams, { mu: settings.mu, sigma: settings.sigma, rank: ranks });
  return result.map((team) => team.map((r) => ({ mu: r.mu, sigma: r.sigma })));
}

/** Conservative skill estimate (mu - z*sigma, z=3 by default). Higher is better. */
export function ordinal(rating: SkillRating): number {
  return openskillOrdinal(rating);
}

/**
 * Maps raw ordinals to a 1-99 "Impacto" display value via percentile rank within the group.
 * Ties share the average rank (fair, deterministic) so equal ordinals map to equal Impacto.
 */
export function mapOrdinalsToImpacto(ordinals: Map<string, number>): Map<string, number> {
  const entries = [...ordinals.entries()];
  if (entries.length === 0) return new Map();
  if (entries.length === 1) return new Map([[entries[0][0], 50]]);

  const sorted = [...entries].sort((a, b) => a[1] - b[1]);
  const n = sorted.length;

  // Average-rank percentile for ties: group runs of equal ordinal values.
  const percentileById = new Map<string, number>();
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && sorted[j + 1][1] === sorted[i][1]) j += 1;
    const avgIndex = (i + j) / 2; // 0-based average rank of the tied group
    const percentile = (avgIndex + 0.5) / n;
    for (let k = i; k <= j; k += 1) percentileById.set(sorted[k][0], percentile);
    i = j + 1;
  }

  const result = new Map<string, number>();
  for (const [id, percentile] of percentileById) {
    result.set(id, Math.min(99, Math.max(1, Math.round(1 + 98 * percentile))));
  }
  return result;
}
