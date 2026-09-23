// Assembles the full FUT-style card from aggregated attribute bases + form + rate limiting.

import type { GroupSettings } from "@/lib/settings/group";
import {
  type AttributeKey,
  type GkFaceStat,
  type OutfieldFaceStat,
  computeGkFaceStats,
  computeOutfieldFaceStats,
} from "./attributes";
import { applyRateLimit } from "./form";
import { POSITIONS, type PositionCode, computeOvr, isGoalkeeperPosition } from "./positions";
import { clamp, median } from "./stats";
import { type Tier, computeTier, isProvisional } from "./tiers";

export interface PlayStyleVote {
  code: string;
  raterId: string;
}

export interface PlayStyleResult {
  code: string;
  plus: boolean;
}

export interface AttributeFinalizeInput {
  base: number; // shrunk value from aggregateAttribute, pre-form, pre-round
  form?: number; // F from computeFormAdjustments, defaults to 0
  previousValue?: number; // last persisted snapshot; omit to skip rate limiting (first snapshot)
  changeInLast30Days?: number;
}

/** value = clamp(round(base + F), 1, 99), then rate-limited against the previous snapshot. */
export function finalizeAttributeValue(input: AttributeFinalizeInput, settings: GroupSettings["rating"]): number {
  const raw = clamp(Math.round(input.base + (input.form ?? 0)), 1, 99);
  if (input.previousValue === undefined) return raw;
  return applyRateLimit({
    previousValue: input.previousValue,
    proposedValue: raw,
    changeInLast30Days: input.changeInLast30Days ?? 0,
    settings: settings.rate_limit,
  });
}

/** Median of 1-5 star votes, rounded to the nearest integer; defaults to 3 with no votes. */
export function computeStarRating(votes: number[]): number {
  if (votes.length === 0) return 3;
  return clamp(Math.round(median(votes)), 1, 5);
}

export function computePlayStyles(
  votes: PlayStyleVote[],
  totalRaters: number,
  settings: GroupSettings["playstyles"],
): PlayStyleResult[] {
  if (totalRaters <= 0 || votes.length === 0) return [];

  const raterIdsByCode = new Map<string, Set<string>>();
  for (const v of votes) {
    const set = raterIdsByCode.get(v.code) ?? new Set<string>();
    set.add(v.raterId);
    raterIdsByCode.set(v.code, set);
  }

  const results: (PlayStyleResult & { ratio: number })[] = [];
  for (const [code, raters] of raterIdsByCode) {
    const ratio = raters.size / totalRaters;
    if (ratio < settings.show_ratio) continue;
    const plus = ratio >= settings.plus_ratio && raters.size >= settings.plus_min_raters;
    results.push({ code, plus, ratio });
  }

  results.sort((a, b) => b.ratio - a.ratio || a.code.localeCompare(b.code));
  return results.slice(0, settings.max_on_card).map(({ code, plus }) => ({ code, plus }));
}

export interface PlayerCardInput {
  /** Final 1-99 attribute values (already form-adjusted and rate-limited by the caller, or via finalizeAttributeValue). */
  attributes: Partial<Record<AttributeKey, number>>;
  primaryPosition: PositionCode;
  nDistinctRaters: number;
  weakFootVotes: number[];
  skillMovesVotes: number[];
  playStyleVotes: PlayStyleVote[];
  totalPlaystyleRaters: number;
  wasMvpLastMatch?: boolean;
}

export interface PlayerCard {
  position: PositionCode;
  isGk: boolean;
  ovr: number;
  ovrByPosition: Record<PositionCode, number>;
  tier: Tier;
  isProvisional: boolean;
  weakFoot: number;
  skillMoves: number;
  playStyles: PlayStyleResult[];
  faceStats: Record<OutfieldFaceStat, number> | Record<GkFaceStat, number>;
}

export function buildPlayerCard(input: PlayerCardInput, settings: GroupSettings): PlayerCard {
  const fallback = settings.rating.default_mean;
  const isGk = isGoalkeeperPosition(input.primaryPosition);

  const ovrByPosition = {} as Record<PositionCode, number>;
  for (const position of POSITIONS) {
    ovrByPosition[position] = computeOvr(position, input.attributes, fallback);
  }
  const ovr = ovrByPosition[input.primaryPosition];

  const faceStats = isGk ? computeGkFaceStats(input.attributes, fallback) : computeOutfieldFaceStats(input.attributes, fallback);

  return {
    position: input.primaryPosition,
    isGk,
    ovr,
    ovrByPosition,
    tier: computeTier({ ovr, wasMvpLastMatch: input.wasMvpLastMatch }, settings.tiers),
    isProvisional: isProvisional(input.nDistinctRaters, settings.rating.min_raters),
    weakFoot: computeStarRating(input.weakFootVotes),
    skillMoves: computeStarRating(input.skillMovesVotes),
    playStyles: computePlayStyles(input.playStyleVotes, input.totalPlaystyleRaters, settings.playstyles),
    faceStats,
  };
}
