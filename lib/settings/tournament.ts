import { z } from "zod";

export const tournamentFormats = ["league", "single_elim", "double_elim", "groups_ko", "swiss"] as const;
export type TournamentFormat = (typeof tournamentFormats)[number];

export const tiebreakers = [
  "points",
  "goal_diff",
  "goals_for",
  "goals_against",
  "head_to_head",
  "wins",
  "buchholz",
  "sonneborn_berger",
  "lots",
] as const;
export type Tiebreaker = (typeof tiebreakers)[number];

export const drawResolutions = ["penalties", "extra_time_then_penalties", "manual"] as const;
export type DrawResolution = (typeof drawResolutions)[number];

export const seedingModes = ["ovr", "openskill", "manual", "random"] as const;
export type SeedingMode = (typeof seedingModes)[number];

const tiebreakerList = z
  .array(z.enum(tiebreakers))
  .min(1)
  .refine((l) => new Set(l).size === l.length, { message: "tiebreakers must be unique" });

export const tournamentSettingsSchema = z.object({
  seeding: z.enum(seedingModes).default("ovr"),
  points: z
    .object({
      win: z.int().min(0).default(3),
      draw: z.int().min(0).default(1),
      loss: z.int().min(0).default(0),
      // Bye in round robin / swiss counts as a win when true.
      bye_counts_as_win: z.boolean().default(true),
    })
    .prefault({}),
  tiebreakers: tiebreakerList.default(["points", "goal_diff", "goals_for", "head_to_head", "lots"]),
  // Only used for knockout matches; league/group/swiss matches may end in a draw.
  ko_draw_resolution: z.enum(drawResolutions).default("penalties"),
  league: z
    .object({
      double_round_robin: z.boolean().default(false),
    })
    .prefault({}),
  single_elim: z
    .object({
      third_place: z.boolean().default(false),
    })
    .prefault({}),
  double_elim: z
    .object({
      grand_final_reset: z.boolean().default(true),
    })
    .prefault({}),
  groups_ko: z
    .object({
      group_count: z.int().min(1).max(16).default(2),
      qualifiers_per_group: z.int().min(1).max(8).default(2),
      double_round_robin: z.boolean().default(false),
      third_place: z.boolean().default(false),
    })
    .prefault({}),
  swiss: z
    .object({
      // null → ceil(log2(n)).
      rounds: z.int().min(1).max(20).nullable().default(null),
      tiebreakers: tiebreakerList.default(["points", "buchholz", "sonneborn_berger", "head_to_head", "lots"]),
    })
    .prefault({}),
});

export type TournamentSettings = z.infer<typeof tournamentSettingsSchema>;
export type TournamentSettingsInput = z.input<typeof tournamentSettingsSchema>;

export const defaultTournamentSettings: TournamentSettings = tournamentSettingsSchema.parse({});

/** Parse stored jsonb (possibly null/partial) into a complete, validated config. */
export function parseTournamentSettings(raw: unknown): TournamentSettings {
  return tournamentSettingsSchema.parse(raw ?? {});
}
