import { describe, expect, it } from "vitest";
import { defaultGroupSettings } from "@/lib/settings/group";
import { initialRating, mapOrdinalsToImpacto, ordinal, rateMatch, type SkillRating } from "./openskill";

const settings = defaultGroupSettings.rating.openskill; // mu 25, sigma 25/3

describe("initialRating / ordinal", () => {
  it("starts every player at the configured mu/sigma", () => {
    expect(initialRating(settings)).toEqual({ mu: 25, sigma: 25 / 3 });
  });

  it("ordinal is mu - 3*sigma by default", () => {
    const r: SkillRating = { mu: 30, sigma: 5 };
    expect(ordinal(r)).toBeCloseTo(30 - 3 * 5, 9);
  });
});

describe("rateMatch", () => {
  it("throws if teams and ranks length mismatch", () => {
    expect(() => rateMatch([[initialRating(settings)]], [0, 1], settings)).toThrow();
  });

  it("increases the winner's mu and decreases the loser's mu (rank 0 = best)", () => {
    const teamA: SkillRating[] = [initialRating(settings)];
    const teamB: SkillRating[] = [initialRating(settings)];
    const [[winner], [loser]] = rateMatch([teamA, teamB], [0, 1], settings);
    expect(winner.mu).toBeGreaterThan(25);
    expect(loser.mu).toBeLessThan(25);
  });

  it("a draw (equal ranks) keeps symmetric teams equally rated", () => {
    const teamA: SkillRating[] = [initialRating(settings)];
    const teamB: SkillRating[] = [initialRating(settings)];
    const [[a], [b]] = rateMatch([teamA, teamB], [0, 0], settings);
    expect(a.mu).toBeCloseTo(b.mu, 9);
  });

  it("supports more than 2 teams ranked distinctly", () => {
    const teams: SkillRating[][] = [[initialRating(settings)], [initialRating(settings)], [initialRating(settings)]];
    const result = rateMatch(teams, [0, 1, 2], settings);
    expect(result[0][0].mu).toBeGreaterThan(result[1][0].mu);
    expect(result[1][0].mu).toBeGreaterThan(result[2][0].mu);
  });

  it("reduces sigma (more confidence) after a match", () => {
    const teamA: SkillRating[] = [initialRating(settings)];
    const teamB: SkillRating[] = [initialRating(settings)];
    const [[a]] = rateMatch([teamA, teamB], [0, 1], settings);
    expect(a.sigma).toBeLessThan(settings.sigma);
  });
});

describe("mapOrdinalsToImpacto", () => {
  it("returns an empty map for no players", () => {
    expect(mapOrdinalsToImpacto(new Map()).size).toBe(0);
  });

  it("maps a single player to the midpoint (50)", () => {
    const result = mapOrdinalsToImpacto(new Map([["p1", 12.3]]));
    expect(result.get("p1")).toBe(50);
  });

  it("maps the lowest ordinal near 1 and the highest near 99", () => {
    const result = mapOrdinalsToImpacto(
      new Map([
        ["low", -5],
        ["mid", 10],
        ["high", 40],
      ]),
    );
    expect(result.get("low")).toBeLessThan(result.get("mid")!);
    expect(result.get("mid")).toBeLessThan(result.get("high")!);
    expect(result.get("low")).toBeGreaterThanOrEqual(1);
    expect(result.get("high")).toBeLessThanOrEqual(99);
  });

  it("gives tied ordinals the same (averaged-rank) Impacto value", () => {
    const result = mapOrdinalsToImpacto(
      new Map([
        ["a", 10],
        ["b", 10],
        ["c", 20],
      ]),
    );
    expect(result.get("a")).toBe(result.get("b"));
    expect(result.get("c")).toBeGreaterThan(result.get("a")!);
  });
});
