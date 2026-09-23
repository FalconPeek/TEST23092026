import { describe, expect, it } from "vitest";
import { defaultGroupSettings, groupSettingsSchema, parseGroupSettings } from "./group";
import { defaultTournamentSettings, parseTournamentSettings, tournamentSettingsSchema } from "./tournament";

describe("group settings", () => {
  it("fills every default from an empty or null object", () => {
    expect(parseGroupSettings(null)).toEqual(defaultGroupSettings);
    expect(defaultGroupSettings.rating.spectator_weight).toBe(0.75);
    expect(defaultGroupSettings.rating.form.max_total).toBe(3);
    expect(defaultGroupSettings.rating.rate_limit).toEqual({ per_match: 2, per_30_days: 4 });
    expect(defaultGroupSettings.windows).toEqual({ report_hours: 48, rating_hours: 72 });
    expect(defaultGroupSettings.tiers.gold_min).toBe(75);
    expect(defaultGroupSettings.rating.min_raters).toBe(3);
  });

  it("keeps partial overrides and defaults the rest", () => {
    const s = parseGroupSettings({ rating: { spectator_weight: 0.5, form: { max_total: 2 } } });
    expect(s.rating.spectator_weight).toBe(0.5);
    expect(s.rating.form.max_total).toBe(2);
    expect(s.rating.form.half_life_days).toBe(30);
    expect(s.rating.shrink_m).toBe(3);
  });

  it("rejects invalid values", () => {
    expect(groupSettingsSchema.safeParse({ rating: { spectator_weight: 2 } }).success).toBe(false);
    expect(groupSettingsSchema.safeParse({ tiers: { silver_min: 80, gold_min: 75 } }).success).toBe(false);
    expect(groupSettingsSchema.safeParse({ default_team_size: 4 }).success).toBe(false);
    expect(groupSettingsSchema.safeParse({ rating: { reliability_min: 2, reliability_max: 1 } }).success).toBe(false);
  });
});

describe("tournament settings", () => {
  it("fills defaults", () => {
    expect(parseTournamentSettings(undefined)).toEqual(defaultTournamentSettings);
    expect(defaultTournamentSettings.points).toEqual({ win: 3, draw: 1, loss: 0, bye_counts_as_win: true });
    expect(defaultTournamentSettings.tiebreakers).toEqual(["points", "goal_diff", "goals_for", "head_to_head", "lots"]);
    expect(defaultTournamentSettings.ko_draw_resolution).toBe("penalties");
    expect(defaultTournamentSettings.swiss.rounds).toBeNull();
  });

  it("rejects duplicate or unknown tiebreakers", () => {
    expect(tournamentSettingsSchema.safeParse({ tiebreakers: ["points", "points"] }).success).toBe(false);
    expect(tournamentSettingsSchema.safeParse({ tiebreakers: ["vibes"] }).success).toBe(false);
    expect(tournamentSettingsSchema.safeParse({ tiebreakers: [] }).success).toBe(false);
  });
});
