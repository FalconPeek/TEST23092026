// FC-style playstyle codes. Source of truth mirrored from private.playstyle_codes() in
// supabase/migrations/20260923061627_scouting_helpers.sql — keep both lists in sync.

export const PLAYSTYLES = [
  "finesse_shot",
  "power_shot",
  "dead_ball",
  "chip_shot",
  "incisive_pass",
  "pinged_pass",
  "long_ball_pass",
  "tiki_taka",
  "whipped_pass",
  "first_touch",
  "rapid",
  "flair",
  "press_proven",
  "technical",
  "trickster",
  "intercept",
  "anticipate",
  "block",
  "bruiser",
  "jockey",
  "slide_tackle",
  "aerial",
  "relentless",
  "quick_step",
  "acrobatic",
  "far_reach",
  "footwork",
  "cross_claimer",
  "rush_out",
  "deflector",
] as const;

export type PlayStyleCode = (typeof PLAYSTYLES)[number];

/** GK-only playstyles; only shown/allowed when the target's position is POR. */
export const GK_PLAYSTYLES = ["far_reach", "footwork", "cross_claimer", "rush_out", "deflector"] as const;

export function isPlayStyleCode(value: string): value is PlayStyleCode {
  return (PLAYSTYLES as readonly string[]).includes(value);
}
