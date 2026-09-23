import { describe, expect, it } from "vitest";
import { ALL_ATTRIBUTES, GK_ATTRIBUTES } from "./attributes";
import { POSITIONS, POSITION_WEIGHTS, computeOvr, isGoalkeeperPosition, topAttributesForPosition } from "./positions";

describe("position weight tables", () => {
  it("has exactly 15 positions", () => {
    expect(POSITIONS.length).toBe(15);
    expect(new Set(POSITIONS).size).toBe(15);
  });

  it("every position row sums to 1", () => {
    for (const position of POSITIONS) {
      const total = Object.values(POSITION_WEIGHTS[position]).reduce((a: number, b) => a + (b as number), 0);
      expect(total).toBeCloseTo(1, 9);
    }
  });

  it("every weight key is a real attribute", () => {
    for (const position of POSITIONS) {
      for (const attr of Object.keys(POSITION_WEIGHTS[position])) {
        expect(ALL_ATTRIBUTES).toContain(attr);
      }
    }
  });

  it("POR uses only GK attributes", () => {
    const keys = Object.keys(POSITION_WEIGHTS.POR);
    expect(keys.sort()).toEqual([...GK_ATTRIBUTES].sort());
    expect(isGoalkeeperPosition("POR")).toBe(true);
    expect(isGoalkeeperPosition("DC")).toBe(false);
  });

  it("no outfield position uses GK attributes", () => {
    for (const position of POSITIONS) {
      if (position === "POR") continue;
      for (const attr of GK_ATTRIBUTES) {
        expect(POSITION_WEIGHTS[position][attr]).toBeUndefined();
      }
    }
  });
});

describe("computeOvr", () => {
  it("returns exactly the group mean when every attribute equals that value", () => {
    const attributes = Object.fromEntries(ALL_ATTRIBUTES.map((a) => [a, 70]));
    for (const position of POSITIONS) {
      expect(computeOvr(position, attributes, 60)).toBe(70);
    }
  });

  it("falls back to the provided default for missing attributes", () => {
    expect(computeOvr("DC", {}, 60)).toBe(60);
  });

  it("weights a striker's finishing more than a center back's", () => {
    const attrs = Object.fromEntries(ALL_ATTRIBUTES.map((a) => [a, 60]));
    const withHighFinishing = { ...attrs, finishing: 99 };
    const dcOvr = computeOvr("DC", withHighFinishing, 60);
    const dfcOvr = computeOvr("DFC", withHighFinishing, 60);
    expect(dcOvr).toBeGreaterThan(dfcOvr);
  });
});

describe("topAttributesForPosition", () => {
  it("returns n attributes ordered by descending weight", () => {
    const top = topAttributesForPosition("DC", 8);
    expect(top.length).toBe(8);
    expect(top[0]).toBe("finishing"); // highest emphasis for DC
  });

  it("clamps to however many attributes the position actually has (POR only has 5)", () => {
    const top = topAttributesForPosition("POR", 8);
    expect(top.length).toBe(5);
  });
});
