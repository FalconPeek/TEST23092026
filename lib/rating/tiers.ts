import type { TierSettings } from "@/lib/settings/group";

export const TIERS = ["bronze", "silver", "gold", "special"] as const;
export type Tier = (typeof TIERS)[number];

export interface TierInput {
  ovr: number;
  /** Was this player MVP of their last finalized match? */
  wasMvpLastMatch?: boolean;
}

/** bronze < silver_min <= silver < gold_min <= gold < special_min <= special (or MVP override). */
export function computeTier(input: TierInput, settings: TierSettings): Tier {
  if (input.ovr >= settings.special_min) return "special";
  if (settings.special_on_last_match_mvp && input.wasMvpLastMatch) return "special";
  if (input.ovr >= settings.gold_min) return "gold";
  if (input.ovr >= settings.silver_min) return "silver";
  return "bronze";
}

/** Provisional (grey) card until the player has been rated by `min_raters` distinct raters. */
export function isProvisional(nDistinctRaters: number, minRaters: number): boolean {
  return nDistinctRaters < minRaters;
}
