// Match-rating "form" term (recent performance nudges attributes up/down) and rate limiting.

import type { RatingSettings } from "@/lib/settings/group";
import type { AttributeKey } from "./attributes";
import { type PositionCode, topAttributesForPosition } from "./positions";
import { clamp, daysBetween, recencyWeight, weightedMedian } from "./stats";

export interface MatchRatingVote {
  value: number; // 1-10
  raterRole: "player" | "spectator";
}

export interface MatchFormInput {
  playedAt: Date;
  ratings: MatchRatingVote[];
  /** Attributes tagged "standout" by at least one rater for this player in this match. */
  standoutAttributes?: AttributeKey[];
}

type FormSettings = RatingSettings["form"];

/** Weighted median of a single match's ratings (role weight only); undefined if under min_raters. */
export function matchWeightedMedian(match: MatchFormInput, settings: RatingSettings): number | undefined {
  if (match.ratings.length < settings.form.min_raters) return undefined;
  return weightedMedian(
    match.ratings.map((r) => ({
      value: r.value,
      weight: r.raterRole === "spectator" ? settings.spectator_weight : 1,
    })),
  );
}

/**
 * F per attribute: sum over recent matches of recency-decayed per-match form `f`, applied only
 * to the primary attributes of the player's position (doubled for standout-tagged attributes),
 * clamped to +/- form.max_total.
 */
export function computeFormAdjustments(
  now: Date,
  position: PositionCode,
  matches: MatchFormInput[],
  settings: RatingSettings,
): Partial<Record<AttributeKey, number>> {
  const form: FormSettings = settings.form;
  const primaryAttrs = new Set(topAttributesForPosition(position, form.primary_attr_count));
  const totals = new Map<AttributeKey, number>();

  for (const match of matches) {
    const M = matchWeightedMedian(match, settings);
    if (M === undefined) continue;

    const f = clamp(form.slope * (M - form.center), -form.max_per_match, form.max_per_match);
    const ageDays = daysBetween(match.playedAt, now);
    const decay = recencyWeight(ageDays, form.half_life_days);
    const standout = new Set(match.standoutAttributes ?? []);

    for (const attr of primaryAttrs) {
      const multiplier = standout.has(attr) ? form.standout_multiplier : 1;
      totals.set(attr, (totals.get(attr) ?? 0) + decay * f * multiplier);
    }
  }

  const result: Partial<Record<AttributeKey, number>> = {};
  for (const [attr, total] of totals) {
    result[attr] = clamp(total, -form.max_total, form.max_total);
  }
  return result;
}

export interface RateLimitParams {
  previousValue: number; // last persisted snapshot, 1-99
  proposedValue: number; // newly computed value before limiting, 1-99
  /** Net absolute change already applied within the current rolling 30-day window. */
  changeInLast30Days: number;
  settings: RatingSettings["rate_limit"];
}

/**
 * Limits how much a single finalized match may move an attribute: at most `per_match` this
 * update, and at most `per_30_days` cumulative net change within the rolling window.
 */
export function applyRateLimit(params: RateLimitParams): number {
  const { previousValue, proposedValue, changeInLast30Days, settings } = params;
  const delta = proposedValue - previousValue;
  const perMatchCapped = clamp(delta, -settings.per_match, settings.per_match);

  const remaining30 = Math.max(0, settings.per_30_days - Math.abs(changeInLast30Days));
  const finalDelta = clamp(perMatchCapped, -remaining30, remaining30);

  return clamp(previousValue + finalDelta, 1, 99);
}
