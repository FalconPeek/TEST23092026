import { z } from "zod";

// Every tunable of the rating pipeline, windows and tiers lives here. Nested objects use
// `.prefault({})` so a partial (or empty) stored jsonb always parses to a complete config.

const unit = z.number().min(0).max(1);

export const ratingSettingsSchema = z
  .object({
    // Vote x in 1..10 maps to s = scale_offset + scale_factor * x (1 → 36.5, 10 → 95).
    scale_offset: z.number().default(30),
    scale_factor: z.number().positive().default(6.5),
    bias_min_votes: z.int().min(1).default(10),
    outlier_mad_k: z.number().positive().default(2.5),
    outlier_min_n: z.int().min(3).default(5),
    vote_half_life_days: z.number().positive().default(90),
    reliability_min: z.number().positive().default(0.5),
    reliability_max: z.number().positive().default(1.5),
    spectator_weight: unit.default(0.75),
    collusion_sigma: z.number().positive().default(2),
    collusion_weight: unit.default(0.5),
    rater_weight_cap: z.number().gt(0).max(1).default(0.2),
    shrink_m: z.number().min(0).default(3),
    default_mean: z.number().min(1).max(99).default(60),
    min_raters: z.int().min(1).default(3),
    form: z
      .object({
        min_raters: z.int().min(1).default(3),
        center: z.number().min(1).max(10).default(6.5),
        slope: z.number().positive().default(0.5),
        max_per_match: z.number().positive().default(1),
        half_life_days: z.number().positive().default(30),
        max_total: z.number().positive().default(3),
        standout_multiplier: z.number().min(1).default(2),
        // How many of the primary position's highest-weighted attributes form applies to.
        primary_attr_count: z.int().min(1).max(29).default(8),
      })
      .prefault({}),
    rate_limit: z
      .object({
        per_match: z.number().positive().default(2),
        per_30_days: z.number().positive().default(4),
      })
      .prefault({}),
    openskill: z
      .object({
        mu: z.number().default(25),
        sigma: z.number().positive().default(25 / 3),
      })
      .prefault({}),
  })
  .refine((r) => r.reliability_min <= r.reliability_max, {
    message: "reliability_min must be <= reliability_max",
    path: ["reliability_min"],
  });

export const scoutingSettingsSchema = z
  .object({
    revote_days: z.int().min(0).default(30),
    require_shared_match: z.boolean().default(true),
    allow_detailed_mode: z.boolean().default(true),
  })
  .prefault({});

export const windowSettingsSchema = z
  .object({
    report_hours: z.int().min(1).max(24 * 14).default(48),
    rating_hours: z.int().min(1).max(24 * 14).default(72),
  })
  .prefault({});

export const tierSettingsSchema = z
  .object({
    silver_min: z.int().min(1).max(99).default(65),
    gold_min: z.int().min(1).max(99).default(75),
    special_min: z.int().min(1).max(99).default(85),
    special_on_last_match_mvp: z.boolean().default(true),
  })
  .refine((t) => t.silver_min < t.gold_min && t.gold_min < t.special_min, {
    message: "tier thresholds must be strictly increasing",
  })
  .prefault({});

export const playStyleSettingsSchema = z
  .object({
    show_ratio: unit.default(0.4),
    plus_ratio: unit.default(0.7),
    plus_min_raters: z.int().min(1).default(5),
    max_on_card: z.int().min(0).max(8).default(3),
  })
  .prefault({});

export const groupSettingsSchema = z.object({
  default_team_size: z.union([z.literal(5), z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(11)]).default(5),
  rating: ratingSettingsSchema.prefault({}),
  scouting: scoutingSettingsSchema,
  windows: windowSettingsSchema,
  tiers: tierSettingsSchema,
  playstyles: playStyleSettingsSchema,
  badges_enabled: z.boolean().default(true),
  spectators_can_rate: z.boolean().default(true),
});

export type GroupSettings = z.infer<typeof groupSettingsSchema>;
export type GroupSettingsInput = z.input<typeof groupSettingsSchema>;
export type RatingSettings = GroupSettings["rating"];
export type TierSettings = GroupSettings["tiers"];
export type PlayStyleSettings = GroupSettings["playstyles"];

export const defaultGroupSettings: GroupSettings = groupSettingsSchema.parse({});

/** Parse stored jsonb (possibly null/partial) into a complete, validated config. */
export function parseGroupSettings(raw: unknown): GroupSettings {
  return groupSettingsSchema.parse(raw ?? {});
}
