import { describe, expect, it } from "vitest";
import {
  ALL_ATTRIBUTES,
  FACE_STAT_WEIGHTS,
  GK_ATTRIBUTES,
  OUTFIELD_ATTRIBUTES,
  OUTFIELD_FACE_STATS,
  computeFaceStat,
  computeGkFaceStats,
  computeOutfieldFaceStats,
  isAttributeKey,
  isGkAttributeKey,
  quickVoteAttributes,
  subAttributesOfFaceStat,
} from "./attributes";

describe("attribute keys", () => {
  it("has exactly 29 outfield + 5 gk = 34 attributes, no duplicates", () => {
    expect(OUTFIELD_ATTRIBUTES.length).toBe(29);
    expect(GK_ATTRIBUTES.length).toBe(5);
    expect(ALL_ATTRIBUTES.length).toBe(34);
    expect(new Set(ALL_ATTRIBUTES).size).toBe(34);
  });

  it("isAttributeKey / isGkAttributeKey narrow correctly", () => {
    expect(isAttributeKey("finishing")).toBe(true);
    expect(isAttributeKey("gk_reflexes")).toBe(true);
    expect(isAttributeKey("not_a_real_attribute")).toBe(false);
    expect(isGkAttributeKey("gk_reflexes")).toBe(true);
    expect(isGkAttributeKey("finishing")).toBe(false);
  });
});

describe("face stat weights", () => {
  it("every outfield face stat's weights sum to 1", () => {
    for (const stat of OUTFIELD_FACE_STATS) {
      const total = Object.values(FACE_STAT_WEIGHTS[stat]).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 9);
    }
  });

  it("subAttributesOfFaceStat matches the weight table keys", () => {
    expect(subAttributesOfFaceStat("pac").sort()).toEqual(["acceleration", "sprint_speed"]);
    expect(subAttributesOfFaceStat("sho")).toContain("finishing");
  });

  it("computeFaceStat computes a weighted sum with fallback for missing attrs", () => {
    // All attributes at 60 -> face stat should also be 60.
    expect(computeFaceStat("pac", {}, 60)).toBeCloseTo(60, 9);
    expect(computeFaceStat("pac", { sprint_speed: 80, acceleration: 60 }, 60)).toBeCloseTo(0.55 * 80 + 0.45 * 60, 9);
  });

  it("computeOutfieldFaceStats returns all 6 keys", () => {
    const result = computeOutfieldFaceStats({}, 50);
    expect(Object.keys(result).sort()).toEqual(["def", "dri", "pac", "pas", "phy", "sho"]);
    expect(result.pac).toBeCloseTo(50, 9);
  });

  it("card face stats are rounded to integers", () => {
    // pas = .35·70 + .20·71 + … is fractional before rounding.
    const result = computeOutfieldFaceStats({ short_passing: 70, vision: 71, crossing: 69, long_passing: 72, curve: 68, free_kick: 67 }, 50);
    for (const v of Object.values(result)) expect(Number.isInteger(v)).toBe(true);
    expect(computeGkFaceStats({ sprint_speed: 71, acceleration: 70 }, 50).spd).toBe(71);
  });

  it("computeGkFaceStats maps gk_* 1:1 and spd from the pac formula", () => {
    const result = computeGkFaceStats(
      { gk_diving: 70, gk_handling: 65, gk_kicking: 55, gk_reflexes: 75, gk_positioning: 68, sprint_speed: 60, acceleration: 60 },
      50,
    );
    expect(result).toEqual({ div: 70, han: 65, kic: 55, ref: 75, pos: 68, spd: 60 });
  });

  it("computeGkFaceStats falls back to group mean when attributes are missing (0 votes)", () => {
    const result = computeGkFaceStats({}, 50);
    expect(result).toEqual({ div: 50, han: 50, kic: 50, ref: 50, pos: 50, spd: 50 });
  });
});

describe("quickVoteAttributes", () => {
  it("expands an outfield face stat to its sub-attributes", () => {
    expect(new Set(quickVoteAttributes("pac"))).toEqual(new Set(["sprint_speed", "acceleration"]));
  });

  it("maps each goalkeeper quick key 1:1 to its gk_* attribute", () => {
    expect(quickVoteAttributes("div")).toEqual(["gk_diving"]);
    expect(quickVoteAttributes("han")).toEqual(["gk_handling"]);
    expect(quickVoteAttributes("kic")).toEqual(["gk_kicking"]);
    expect(quickVoteAttributes("ref")).toEqual(["gk_reflexes"]);
    expect(quickVoteAttributes("pos")).toEqual(["gk_positioning"]);
  });

  it("passes detailed keys through and ignores unknown keys", () => {
    expect(quickVoteAttributes("finishing")).toEqual(["finishing"]);
    expect(quickVoteAttributes("gk_diving")).toEqual(["gk_diving"]);
    expect(quickVoteAttributes("spd")).toEqual([]);
    expect(quickVoteAttributes("nope")).toEqual([]);
  });
});
