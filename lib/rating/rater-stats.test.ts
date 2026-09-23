import { describe, expect, it } from "vitest";
import { defaultGroupSettings } from "@/lib/settings/group";
import { collusionKey, collusionPairs, raterStats, type RaterOverallResidual, type RaterPairResidual } from "./rater-stats";

const settings = defaultGroupSettings.rating; // bias_min_votes 10, reliability [0.5, 1.5]

describe("raterStats", () => {
  it("returns an empty map for no residuals", () => {
    expect(raterStats([], settings).size).toBe(0);
  });

  it("bias is 0 below bias_min_votes even if residuals are consistently high", () => {
    const residuals = Array.from({ length: 5 }, () => ({ raterId: "r1", residual: 10 }));
    const stat = raterStats(residuals, settings).get("r1")!;
    expect(stat.nVotes).toBe(5);
    expect(stat.bias).toBe(0);
  });

  it("bias is the mean residual once bias_min_votes is reached", () => {
    const residuals = Array.from({ length: 10 }, (_, i) => ({ raterId: "r1", residual: i % 2 === 0 ? 4 : 2 })); // mean 3
    const stat = raterStats(residuals, settings).get("r1")!;
    expect(stat.bias).toBeCloseTo(3, 9);
  });

  it("a rater with 0 residual variance gets reliability_max", () => {
    const residuals = Array.from({ length: 12 }, () => ({ raterId: "r1", residual: 0 }));
    const stat = raterStats(residuals, settings, 5).get("r1")!; // raw 2/(1+0) = 2 → clamped to 1.5
    expect(stat.rmse).toBe(0);
    expect(stat.reliability).toBeCloseTo(settings.reliability_max, 9);
  });

  it("a rater whose RMSE equals the group sigma weighs exactly 1", () => {
    const residuals = Array.from({ length: 12 }, (_, i) => ({ raterId: "r1", residual: i % 2 === 0 ? 5 : -5 }));
    expect(raterStats(residuals, settings, 5).get("r1")!.reliability).toBeCloseTo(1, 9);
  });

  it("reliability stays neutral below bias_min_votes", () => {
    const residuals = Array.from({ length: 3 }, () => ({ raterId: "new", residual: 0 }));
    expect(raterStats(residuals, settings, 5).get("new")!.reliability).toBe(1);
  });

  it("reliability is clamped within [reliability_min, reliability_max]", () => {
    const wildResiduals = Array.from({ length: 12 }, () => ({ raterId: "wild", residual: 100 }));
    const stat = raterStats(wildResiduals, settings, 1).get("wild")!;
    expect(stat.reliability).toBeCloseTo(settings.reliability_min, 9);
  });

  it("handles a single vote from a single rater", () => {
    const stat = raterStats([{ raterId: "solo", residual: 7 }], settings).get("solo")!;
    expect(stat.nVotes).toBe(1);
    expect(stat.bias).toBe(0); // below bias_min_votes
    expect(stat.rmse).toBe(7);
  });

  it("gates on rawVoteCounts instead of the residual count when supplied", () => {
    // Simulates one rater's 3 raw (quick-mode) ballots expanding into 12 residual entries
    // (e.g. pas + sho + def sub-attributes): residuals.length alone would clear bias_min_votes
    // (10), but the true raw ballot count (3) must not.
    const residuals = Array.from({ length: 12 }, () => ({ raterId: "r1", residual: 10 }));
    const rawVoteCounts = new Map([["r1", 3]]);
    const stat = raterStats(residuals, settings, undefined, rawVoteCounts).get("r1")!;
    expect(stat.nVotes).toBe(3);
    expect(stat.bias).toBe(0);
    expect(stat.reliability).toBe(1);
  });

  it("rawVoteCounts can also let a rater qualify sooner than their residual count would", () => {
    const residuals = Array.from({ length: 5 }, () => ({ raterId: "r1", residual: 4 }));
    const rawVoteCounts = new Map([["r1", 10]]);
    const stat = raterStats(residuals, settings, undefined, rawVoteCounts).get("r1")!;
    expect(stat.nVotes).toBe(10);
    expect(stat.bias).toBeCloseTo(4, 9);
  });

  it("keeps separate stats per rater", () => {
    const residuals = [
      ...Array.from({ length: 10 }, () => ({ raterId: "a", residual: 5 })),
      ...Array.from({ length: 10 }, () => ({ raterId: "b", residual: -5 })),
    ];
    const stats = raterStats(residuals, settings);
    expect(stats.get("a")!.bias).toBeCloseTo(5, 9);
    expect(stats.get("b")!.bias).toBeCloseTo(-5, 9);
  });
});

describe("collusionPairs", () => {
  const baseOverall: Map<string, RaterOverallResidual> = new Map([
    ["a", { raterId: "a", meanResidual: 0, stdResidual: 1 }],
    ["b", { raterId: "b", meanResidual: 0, stdResidual: 1 }],
    ["c", { raterId: "c", meanResidual: 0, stdResidual: 1 }],
  ]);

  it("flags a mutually inflated pair", () => {
    const pairs: RaterPairResidual[] = [
      { raterId: "a", targetId: "b", meanResidual: 5 }, // > 0 + 2*1
      { raterId: "b", targetId: "a", meanResidual: 5 },
    ];
    const flagged = collusionPairs(pairs, baseOverall, settings);
    expect(flagged).toHaveLength(2);
    expect(flagged.map((f) => collusionKey(f.raterId, f.targetId)).sort()).toEqual(
      ["a|b", "b|a"].sort(),
    );
  });

  it("does not flag when only one side is inflated (no reciprocal boost)", () => {
    const pairs: RaterPairResidual[] = [
      { raterId: "a", targetId: "b", meanResidual: 5 },
      { raterId: "b", targetId: "a", meanResidual: 0 },
    ];
    expect(collusionPairs(pairs, baseOverall, settings)).toHaveLength(0);
  });

  it("does not flag ordinary reciprocal votes within normal variance", () => {
    const pairs: RaterPairResidual[] = [
      { raterId: "a", targetId: "b", meanResidual: 0.5 },
      { raterId: "b", targetId: "a", meanResidual: 0.5 },
    ];
    expect(collusionPairs(pairs, baseOverall, settings)).toHaveLength(0);
  });

  it("does not flag when there is no reciprocal vote at all", () => {
    const pairs: RaterPairResidual[] = [{ raterId: "a", targetId: "c", meanResidual: 10 }];
    expect(collusionPairs(pairs, baseOverall, settings)).toHaveLength(0);
  });

  it("returns nothing for an empty input", () => {
    expect(collusionPairs([], baseOverall, settings)).toHaveLength(0);
  });
});
