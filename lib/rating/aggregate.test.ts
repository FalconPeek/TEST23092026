import { describe, expect, it } from "vitest";
import { defaultGroupSettings } from "@/lib/settings/group";
import { aggregateAttribute, capWeights, expandScoutingVotes, type AggregateVoteContext, type ScoutingVoteInput } from "./aggregate";

const settings = defaultGroupSettings.rating;
const now = new Date("2026-01-01T00:00:00Z");

describe("expandScoutingVotes", () => {
  it("expands a quick-mode face-stat vote to all of its sub-attributes", () => {
    const votes: ScoutingVoteInput[] = [{ raterId: "r1", attribute: "pac", value: 8, createdAt: now, raterRole: "player" }];
    const result = expandScoutingVotes(votes);
    expect(new Set(result.keys())).toEqual(new Set(["sprint_speed", "acceleration"]));
    expect(result.get("sprint_speed")).toEqual([{ raterId: "r1", attribute: "sprint_speed", value: 8, createdAt: now, raterRole: "player" }]);
  });

  it("passes a detailed-mode vote through unchanged", () => {
    const votes: ScoutingVoteInput[] = [{ raterId: "r1", attribute: "finishing", value: 7, createdAt: now, raterRole: "player" }];
    const result = expandScoutingVotes(votes);
    expect([...result.keys()]).toEqual(["finishing"]);
  });

  it("merges quick and detailed votes landing on the same sub-attribute", () => {
    const votes: ScoutingVoteInput[] = [
      { raterId: "r1", attribute: "pac", value: 8, createdAt: now, raterRole: "player" },
      { raterId: "r2", attribute: "acceleration", value: 5, createdAt: now, raterRole: "player" },
    ];
    const result = expandScoutingVotes(votes);
    expect(result.get("acceleration")).toHaveLength(2);
    expect(result.get("sprint_speed")).toHaveLength(1);
  });
});

describe("capWeights", () => {
  it("is a no-op for 0 or 1 raters", () => {
    expect(capWeights([], 0.2)).toEqual([]);
    expect(capWeights([5], 0.2)).toEqual([5]);
  });

  it("caps a dominant rater and redistributes to the rest, converging to equal shares in a symmetric case", () => {
    const result = capWeights([10, 1, 1, 1, 1], 0.2);
    for (const w of result) expect(w).toBeCloseTo(2.8, 9);
  });

  it("leaves weights untouched when already within the cap", () => {
    expect(capWeights([1, 1, 1, 1, 1], 0.2)).toEqual([1, 1, 1, 1, 1]);
  });

  it("terminates and best-effort-equalizes when the cap is mathematically unsatisfiable (n < 1/cap)", () => {
    // 4 equal raters each hold 25% > 20% cap; with nothing uncapped to redistribute into, all
    // are clamped to the cap value (0.2 * 4 = 0.8) and the excess is simply not redistributed.
    const result = capWeights([1, 1, 1, 1], 0.2);
    expect(result).toHaveLength(4);
    for (const w of result) expect(w).toBeCloseTo(0.8, 9);
  });
});

function vote(raterId: string, value: number, overrides: Partial<AggregateVoteContext> = {}): AggregateVoteContext {
  return { raterId, value, createdAt: now, raterRole: "player", ...overrides };
}

describe("aggregateAttribute", () => {
  it("returns the group mean with 0 votes", () => {
    const result = aggregateAttribute([], { now, settings, targetId: "p1" });
    expect(result).toEqual({ value: 60, nEffective: 0, nRaters: 0, nVotes: 0, droppedOutlierRaterIds: [] });
  });

  it("heavily shrinks a single vote toward the group mean", () => {
    // s = 30 + 6.5*10 = 95; n_eff = 1; base = (1*95 + 3*60) / 4 = 68.75
    const result = aggregateAttribute([vote("r1", 10)], { now, settings, targetId: "p1" });
    expect(result.nEffective).toBe(1);
    expect(result.nRaters).toBe(1);
    expect(result.value).toBeCloseTo(68.75, 9);
  });

  it("identical votes (MAD = 0) skip outlier trimming and all count", () => {
    // s = 30 + 6.5*7 = 75.5 for all 6; n_eff = 6; base = (6*75.5 + 180)/9 = 70.3333...
    const votes = Array.from({ length: 6 }, (_, i) => vote(`r${i}`, 7));
    const result = aggregateAttribute(votes, { now, settings, targetId: "p1" });
    expect(result.droppedOutlierRaterIds).toEqual([]);
    expect(result.nRaters).toBe(6);
    expect(result.value).toBeCloseTo(70.3333333, 6);
  });

  it("a lone extreme vote survives when it is outnumbered enough to make group MAD 0 (documented edge case)", () => {
    // 4 raters at 7, 1 rater bombing at 1: sorted s = [36.5,75.5,75.5,75.5,75.5], MAD = 0 -> no trim.
    const votes = [vote("bomber", 1), vote("a", 7), vote("b", 7), vote("c", 7), vote("d", 7)];
    const result = aggregateAttribute(votes, { now, settings, targetId: "p1" });
    expect(result.droppedOutlierRaterIds).toEqual([]);
    expect(result.nRaters).toBe(5);
  });

  it("drops a genuine outlier once the remaining votes are varied enough for MAD > 0", () => {
    // s: bomber=36.5, others = 69,75.5,69,75.5 -> median 69, MAD 6.5, threshold ~24.09 -> bomber dropped.
    const votes = [vote("bomber", 1), vote("a", 6), vote("b", 7), vote("c", 6), vote("d", 7)];
    const result = aggregateAttribute(votes, { now, settings, targetId: "p1" });
    expect(result.droppedOutlierRaterIds).toEqual(["bomber"]);
    expect(result.nRaters).toBe(4);
  });

  it("caps one rater spamming a dominant reliability weight at 20% of total weight", () => {
    const votes = [vote("dominant", 10), vote("r2", 1), vote("r3", 1), vote("r4", 1), vote("r5", 1)];
    const raterReliability = new Map([
      ["dominant", 1.5],
      ["r2", 0.5],
      ["r3", 0.5],
      ["r4", 0.5],
      ["r5", 0.5],
    ]);
    const result = aggregateAttribute(votes, { now, settings, targetId: "p1", raterReliability });
    // Hand-computed: weights [1.5,.5,.5,.5,.5] -> capped to [.7,.7,.7,.7,.7] (see aggregate.ts cap).
    // R = 0.7*(95+36.5*4)/3.5 = 48.2; n_eff = 5 (equal weights); base = (5*48.2+180)/8 = 52.625
    expect(result.value).toBeCloseTo(52.625, 6);
    expect(result.nEffective).toBeCloseTo(5, 6);
  });

  it("weighs spectators at spectator_weight relative to players", () => {
    const votes = [
      vote("p1", 6),
      vote("p2", 6),
      vote("p3", 6),
      vote("p4", 6),
      vote("p5", 6),
      vote("spectator", 10, { raterRole: "spectator" }),
    ];
    const result = aggregateAttribute(votes, { now, settings, targetId: "target" });

    const sPlayer = 30 + 6.5 * 6;
    const sSpectator = 30 + 6.5 * 10;
    const wSpectator = settings.spectator_weight;
    const R = (5 * sPlayer + wSpectator * sSpectator) / (5 + wSpectator);
    const sumWSq = 5 * 1 + wSpectator * wSpectator;
    const nEff = (5 + wSpectator) ** 2 / sumWSq;
    const expected = (nEff * R + settings.shrink_m * settings.default_mean) / (nEff + settings.shrink_m);

    expect(result.value).toBeCloseTo(expected, 9);
  });

  it("applies a rater bias correction before shrinkage", () => {
    const raterBias = new Map([["biased", 10]]);
    const withoutBias = aggregateAttribute([vote("biased", 8)], { now, settings, targetId: "p1" });
    const withBias = aggregateAttribute([vote("biased", 8)], { now, settings, targetId: "p1", raterBias });
    expect(withBias.value).toBeLessThan(withoutBias.value);
  });

  it("halves vote weight as recency decays by one half-life (hand-computed, cap disabled to isolate recency)", () => {
    const uncappedSettings = { ...settings, rater_weight_cap: 1 };
    const old = vote("r1", 10, { createdAt: new Date(now.getTime() - settings.vote_half_life_days * 24 * 60 * 60 * 1000) });
    const fresh = vote("r2", 2, { createdAt: now });
    const result = aggregateAttribute([old, fresh], { now, settings: uncappedSettings, targetId: "p1" });
    // weights [0.5, 1]; R = (0.5*95 + 1*43)/1.5 = 60.333...; n_eff = 1.5^2/1.25 = 1.8
    // base = (1.8*60.333... + 3*60) / (1.8+3) = 60.125
    expect(result.value).toBeCloseTo(60.125, 9);
  });

  it("applies the collusion weight penalty to a flagged rater/target pair", () => {
    // rater_weight_cap disabled (1 = 100%) here so the 20% cap doesn't mask the penalty: with
    // only 2 raters any real cap forces both down to equal shares regardless of the penalty.
    const uncappedSettings = { ...settings, rater_weight_cap: 1 };
    const votes = [vote("colluder", 10), vote("neutral", 5)];
    const collusionPairs = new Set(["colluder|target"]);
    const withPenalty = aggregateAttribute(votes, { now, settings: uncappedSettings, targetId: "target", collusionPairs });
    const withoutPenalty = aggregateAttribute(votes, { now, settings: uncappedSettings, targetId: "target" });
    expect(withPenalty.value).toBeLessThan(withoutPenalty.value);
  });
});
