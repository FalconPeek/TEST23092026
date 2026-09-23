import { describe, expect, it } from "vitest";
import { defaultGroupSettings } from "@/lib/settings/group";
import { applyRateLimit, computeFormAdjustments, matchWeightedMedian, type MatchFormInput } from "./form";
import { topAttributesForPosition } from "./positions";

const settings = defaultGroupSettings.rating; // form: min_raters 3, center 6.5, slope .5, max_per_match 1, half_life 30, max_total 3, standout x2

describe("matchWeightedMedian", () => {
  it("returns undefined below min_raters", () => {
    const match: MatchFormInput = { playedAt: new Date(), ratings: [{ value: 8, raterRole: "player" }, { value: 9, raterRole: "player" }] };
    expect(matchWeightedMedian(match, settings)).toBeUndefined();
  });

  it("computes the weighted median with role weights (min_raters met)", () => {
    const match: MatchFormInput = {
      playedAt: new Date(),
      ratings: [
        { value: 5, raterRole: "player" },
        { value: 5, raterRole: "player" },
        { value: 10, raterRole: "spectator" },
      ],
    };
    // Weights [1,1,0.75]; cumulative halfway 1.375; sorted values 5,5,10 -> lands on 5.
    expect(matchWeightedMedian(match, settings)).toBe(5);
  });
});

describe("computeFormAdjustments", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("applies no adjustment with no matches", () => {
    expect(computeFormAdjustments(now, "DC", [], settings)).toEqual({});
  });

  it("only touches the primary attributes of the position", () => {
    const match: MatchFormInput = { playedAt: now, ratings: [{ value: 9, raterRole: "player" }, { value: 9, raterRole: "player" }, { value: 9, raterRole: "player" }] };
    const result = computeFormAdjustments(now, "DC", [match], settings);
    const primary = new Set<string>(topAttributesForPosition("DC", settings.form.primary_attr_count));
    for (const attr of Object.keys(result)) expect(primary.has(attr)).toBe(true);
    expect(result.gk_diving).toBeUndefined();
  });

  it("doubles the per-match term on standout-tagged attributes", () => {
    // M = 9 -> f = clamp(0.5*(9-6.5), -1, 1) = 1 (capped); decay = 1 (age 0).
    const match: MatchFormInput = {
      playedAt: now,
      ratings: [{ value: 9, raterRole: "player" }, { value: 9, raterRole: "player" }, { value: 9, raterRole: "player" }],
      standoutAttributes: ["finishing"],
    };
    const result = computeFormAdjustments(now, "DC", [match], settings);
    expect(result.finishing).toBeCloseTo(2, 9); // 1 (f) * 2 (standout multiplier)
    const primary = topAttributesForPosition("DC", settings.form.primary_attr_count);
    const otherPrimary = primary.find((a) => a !== "finishing")!;
    expect(result[otherPrimary]).toBeCloseTo(1, 9);
  });

  it("a poor match rating produces a negative form term", () => {
    const match: MatchFormInput = { playedAt: now, ratings: [{ value: 2, raterRole: "player" }, { value: 2, raterRole: "player" }, { value: 2, raterRole: "player" }] };
    const result = computeFormAdjustments(now, "DC", [match], settings);
    // f = clamp(0.5*(2-6.5), -1, 1) = -1
    expect(result.finishing).toBeCloseTo(-1, 9);
  });

  it("clamps the accumulated total to +/- max_total across several matches", () => {
    const matches: MatchFormInput[] = Array.from({ length: 4 }, () => ({
      playedAt: now, // no recency decay
      ratings: [{ value: 9, raterRole: "player" }, { value: 9, raterRole: "player" }, { value: 9, raterRole: "player" }],
      standoutAttributes: ["finishing" as const],
    }));
    // 4 matches * (1 * 2) = 8, clamped to settings.form.max_total (3).
    const result = computeFormAdjustments(now, "DC", matches, settings);
    expect(result.finishing).toBe(settings.form.max_total);
  });

  it("decays older matches toward 0 by the configured half-life", () => {
    const halfLifeAgo = new Date(now.getTime() - settings.form.half_life_days * 24 * 60 * 60 * 1000);
    const oldMatch: MatchFormInput = { playedAt: halfLifeAgo, ratings: [{ value: 9, raterRole: "player" }, { value: 9, raterRole: "player" }, { value: 9, raterRole: "player" }] };
    const freshMatch: MatchFormInput = { playedAt: now, ratings: [{ value: 9, raterRole: "player" }, { value: 9, raterRole: "player" }, { value: 9, raterRole: "player" }] };
    const oldResult = computeFormAdjustments(now, "DC", [oldMatch], settings);
    const freshResult = computeFormAdjustments(now, "DC", [freshMatch], settings);
    expect(oldResult.finishing).toBeCloseTo((freshResult.finishing ?? 0) * 0.5, 9);
  });
});

describe("applyRateLimit", () => {
  const rl = defaultGroupSettings.rating.rate_limit; // per_match 2, per_30_days 4

  it("caps a large jump to per_match", () => {
    expect(applyRateLimit({ previousValue: 60, proposedValue: 70, changeInLast30Days: 0, settings: rl })).toBe(62);
    expect(applyRateLimit({ previousValue: 60, proposedValue: 50, changeInLast30Days: 0, settings: rl })).toBe(58);
  });

  it("further caps by remaining rolling-30-day budget", () => {
    // delta capped to 2 by per_match, but only 1 of the 4-point/30d budget remains.
    expect(applyRateLimit({ previousValue: 60, proposedValue: 63, changeInLast30Days: 3, settings: rl })).toBe(61);
  });

  it("allows no movement once the 30-day budget is exhausted", () => {
    expect(applyRateLimit({ previousValue: 60, proposedValue: 65, changeInLast30Days: 4, settings: rl })).toBe(60);
  });

  it("passes small changes through unchanged", () => {
    expect(applyRateLimit({ previousValue: 60, proposedValue: 61, changeInLast30Days: 0, settings: rl })).toBe(61);
  });

  it("never leaves the 1-99 range", () => {
    expect(applyRateLimit({ previousValue: 98, proposedValue: 999, changeInLast30Days: 0, settings: rl })).toBe(99);
    expect(applyRateLimit({ previousValue: 2, proposedValue: -999, changeInLast30Days: 0, settings: rl })).toBe(1);
  });
});
