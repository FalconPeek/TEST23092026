// Per-(player, sub-attribute) vote aggregation: scaling, rater bias, MAD outlier trimming,
// recency/reliability/role weighting with a per-rater cap, and Bayesian shrinkage.
// See CLAUDE.md "Rating system" step-by-step spec.

import type { RatingSettings } from "@/lib/settings/group";
import { type AttributeKey, type OutfieldFaceStat, subAttributesOfFaceStat } from "./attributes";
import { mad, median, recencyWeight } from "./stats";
import { collusionKey } from "./rater-stats";

export interface ScoutingVoteInput {
  raterId: string;
  /** Either a sub-attribute key (detailed mode) or a face-stat code (quick mode). */
  attribute: AttributeKey | OutfieldFaceStat;
  /** Raw 1-10 vote. */
  value: number;
  createdAt: Date;
  raterRole: "player" | "spectator";
}

/**
 * Quick-mode votes target a face stat and implicitly vote the same raw value for every
 * sub-attribute that feeds it; detailed-mode votes already target a single sub-attribute.
 * Returns votes grouped by the sub-attribute they end up affecting.
 */
export function expandScoutingVotes(votes: ScoutingVoteInput[]): Map<AttributeKey, ScoutingVoteInput[]> {
  const byAttribute = new Map<AttributeKey, ScoutingVoteInput[]>();
  const push = (attr: AttributeKey, vote: ScoutingVoteInput) => {
    const list = byAttribute.get(attr) ?? [];
    list.push({ ...vote, attribute: attr });
    byAttribute.set(attr, list);
  };

  for (const vote of votes) {
    if ((["pac", "sho", "pas", "dri", "def", "phy"] as const).includes(vote.attribute as OutfieldFaceStat)) {
      for (const sub of subAttributesOfFaceStat(vote.attribute as OutfieldFaceStat)) push(sub, vote);
    } else {
      push(vote.attribute as AttributeKey, vote);
    }
  }
  return byAttribute;
}

/**
 * Caps any single rater's share of total weight at `cap` (fraction of total), redistributing
 * the excess proportionally to the remaining raters, iterating until stable. With <= 1 rater
 * there is nothing to redistribute to, so the cap is a no-op.
 */
export function capWeights(weights: number[], cap: number): number[] {
  if (weights.length <= 1) return [...weights];
  const w = [...weights];
  const EPS = 1e-9;
  for (let iter = 0; iter < w.length; iter += 1) {
    const total = w.reduce((a, b) => a + b, 0);
    if (total <= 0) break;
    const capValue = cap * total;
    const overIdx = w.map((v, i) => ({ v, i })).filter((x) => x.v > capValue + EPS);
    if (overIdx.length === 0) break;

    let excess = 0;
    const locked = new Set<number>();
    for (const { i, v } of overIdx) {
      excess += v - capValue;
      w[i] = capValue;
      locked.add(i);
    }
    const others = w.map((v, i) => ({ v, i })).filter((x) => !locked.has(x.i));
    const othersTotal = others.reduce((a, b) => a + b.v, 0);
    if (othersTotal <= 0) break; // nothing left to absorb the excess into
    for (const { v, i } of others) w[i] = v + (excess * v) / othersTotal;
  }
  return w;
}

export interface AggregateVoteContext {
  raterId: string;
  value: number; // raw 1-10
  createdAt: Date;
  raterRole: "player" | "spectator";
}

export interface AggregateResult {
  /** Shrunk base value (1-99 scale, unrounded, before form and rate limiting). */
  value: number;
  nEffective: number;
  nRaters: number;
  nVotes: number;
  droppedOutlierRaterIds: string[];
}

export interface AggregateAttributeParams {
  now: Date;
  settings: RatingSettings;
  targetId: string;
  /** Bias per rater; only include raters that qualify (nVotes >= bias_min_votes). */
  raterBias?: Map<string, number>;
  raterReliability?: Map<string, number>;
  collusionPairs?: Set<string>; // keys from rater-stats.ts `collusionKey`
  groupMean?: number; // C in the shrinkage formula; defaults to settings.default_mean
}

/**
 * Aggregates one sub-attribute's votes for one player into a shrunk base value.
 * With 0 votes, returns the group mean (fully shrunk, n_eff = 0).
 */
export function aggregateAttribute(votes: AggregateVoteContext[], params: AggregateAttributeParams): AggregateResult {
  const { settings } = params;
  const groupMean = params.groupMean ?? settings.default_mean;

  if (votes.length === 0) {
    return { value: groupMean, nEffective: 0, nRaters: 0, nVotes: 0, droppedOutlierRaterIds: [] };
  }

  // 1-2: scale each vote, subtract rater bias when known.
  const scaled = votes.map((v) => ({
    raterId: v.raterId,
    createdAt: v.createdAt,
    raterRole: v.raterRole,
    s: settings.scale_offset + settings.scale_factor * v.value - (params.raterBias?.get(v.raterId) ?? 0),
  }));

  // 3: MAD outlier trimming (only with enough votes, and only if MAD > 0).
  let kept = scaled;
  const droppedOutlierRaterIds: string[] = [];
  if (scaled.length >= settings.outlier_min_n) {
    const values = scaled.map((v) => v.s);
    const med = median(values);
    const m = mad(values);
    if (m > 0) {
      const threshold = settings.outlier_mad_k * 1.4826 * m;
      kept = scaled.filter((v) => {
        const isOutlier = Math.abs(v.s - med) > threshold;
        if (isOutlier) droppedOutlierRaterIds.push(v.raterId);
        return !isOutlier;
      });
    }
  }

  if (kept.length === 0) {
    // Degenerate: everything got trimmed. Fall back to the untrimmed set rather than 0 raters.
    kept = scaled;
    droppedOutlierRaterIds.length = 0;
  }

  // 4: weights = recency * reliability * role * collusion penalty, then cap per rater.
  const rawWeights = kept.map((v) => {
    const ageDays = Math.max(0, (params.now.getTime() - v.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const recency = recencyWeight(ageDays, settings.vote_half_life_days);
    const reliability = params.raterReliability?.get(v.raterId) ?? 1;
    const role = v.raterRole === "spectator" ? settings.spectator_weight : 1;
    const collusionPenalty = params.collusionPairs?.has(collusionKey(v.raterId, params.targetId)) ? settings.collusion_weight : 1;
    return recency * reliability * role * collusionPenalty;
  });
  const weights = capWeights(rawWeights, settings.rater_weight_cap);

  // 5: weighted mean and Bayesian shrinkage toward the group mean.
  const sumW = weights.reduce((a, b) => a + b, 0);
  const sumWSq = weights.reduce((a, b) => a + b * b, 0);
  const R = sumW > 0 ? kept.reduce((acc, v, i) => acc + weights[i] * v.s, 0) / sumW : groupMean;
  const nEffective = sumWSq > 0 ? (sumW * sumW) / sumWSq : 0;
  const base = (nEffective * R + settings.shrink_m * groupMean) / (nEffective + settings.shrink_m);

  return {
    value: base,
    nEffective,
    nRaters: new Set(kept.map((v) => v.raterId)).size,
    nVotes: votes.length,
    droppedOutlierRaterIds,
  };
}
