// Cross-vote rater statistics: bias, reliability and collusion detection.
//
// These are computed from "residuals" — scaled_vote - consensus_at_vote_time — which the
// caller (DB layer) derives by joining scouting_votes against the attribute_ratings consensus
// that existed when each vote landed. Keeping that join out of this module is what makes it
// pure: aggregate.ts only needs the resulting per-rater bias/reliability numbers.

import type { RatingSettings } from "@/lib/settings/group";
import { clamp, mean, stdDev } from "./stats";

export interface RaterResidual {
  raterId: string;
  residual: number;
}

export interface RaterStat {
  raterId: string;
  /** Mean residual, only meaningful once nVotes >= bias_min_votes (0 otherwise). */
  bias: number;
  rmse: number;
  reliability: number;
  nVotes: number;
}

/**
 * Per-rater bias (mean residual) and RMSE-based reliability 2/(1+(RMSE/σ)²), clamped to
 * [reliability_min, reliability_max]. `sigmaGroup` is the group-wide residual stdev used to
 * normalize RMSE into a reliability multiplier; defaults to the stdev of all input residuals.
 */
export function raterStats(residuals: RaterResidual[], settings: RatingSettings, sigmaGroup?: number): Map<string, RaterStat> {
  const byRater = new Map<string, number[]>();
  for (const { raterId, residual } of residuals) {
    const list = byRater.get(raterId) ?? [];
    list.push(residual);
    byRater.set(raterId, list);
  }

  const sigma = sigmaGroup ?? stdDev(residuals.map((r) => r.residual));
  const result = new Map<string, RaterStat>();
  for (const [raterId, values] of byRater) {
    const nVotes = values.length;
    const bias = nVotes >= settings.bias_min_votes ? mean(values) : 0;
    const rmse = Math.sqrt(mean(values.map((v) => v ** 2)));
    // 2/(1+x²): a typical rater (RMSE = σ) weighs 1, precise raters up to reliability_max,
    // noisy ones down to reliability_min. Neutral until the rater has enough votes to judge.
    const reliability =
      nVotes < settings.bias_min_votes
        ? 1
        : sigma > 0
          ? clamp(2 / (1 + (rmse / sigma) ** 2), settings.reliability_min, settings.reliability_max)
          : settings.reliability_max;
    result.set(raterId, { raterId, bias, rmse, reliability, nVotes });
  }
  return result;
}

export interface RaterPairResidual {
  raterId: string;
  targetId: string;
  meanResidual: number;
}

export interface RaterOverallResidual {
  raterId: string;
  meanResidual: number;
  stdResidual: number;
}

export interface CollusionPair {
  raterId: string;
  targetId: string;
}

function pairKey(raterId: string, targetId: string): string {
  return `${raterId}|${targetId}`;
}

/**
 * A rater→target pair is flagged when the rater's mean residual on that specific target is
 * more than `collusion_sigma` standard deviations above their own overall mean residual, AND
 * the reciprocal (target rating rater) is inflated the same way.
 */
export function collusionPairs(
  pairResiduals: RaterPairResidual[],
  overall: Map<string, RaterOverallResidual>,
  settings: RatingSettings,
): CollusionPair[] {
  const byPair = new Map<string, RaterPairResidual>();
  for (const p of pairResiduals) byPair.set(pairKey(p.raterId, p.targetId), p);

  const isInflated = (p: RaterPairResidual): boolean => {
    const stats = overall.get(p.raterId);
    if (!stats) return false;
    const threshold = stats.meanResidual + settings.collusion_sigma * stats.stdResidual;
    return p.meanResidual > threshold;
  };

  const flagged: CollusionPair[] = [];
  const seen = new Set<string>();
  for (const p of pairResiduals) {
    const key = pairKey(p.raterId, p.targetId);
    if (seen.has(key)) continue;
    const reciprocal = byPair.get(pairKey(p.targetId, p.raterId));
    if (reciprocal && isInflated(p) && isInflated(reciprocal)) {
      flagged.push({ raterId: p.raterId, targetId: p.targetId });
      flagged.push({ raterId: reciprocal.raterId, targetId: reciprocal.targetId });
      seen.add(key);
      seen.add(pairKey(reciprocal.raterId, reciprocal.targetId));
    }
  }
  return flagged;
}

export function collusionKey(raterId: string, targetId: string): string {
  return pairKey(raterId, targetId);
}
