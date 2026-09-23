import { describe, expect, it } from "vitest";
import { buildBracketSlots, nextPow2, standardSeedOrder } from "./seeding";
import { BYE, type Entry } from "./types";

describe("nextPow2", () => {
  it("rounds up to the next power of two", () => {
    expect(nextPow2(1)).toBe(1);
    expect(nextPow2(2)).toBe(2);
    expect(nextPow2(3)).toBe(4);
    expect(nextPow2(5)).toBe(8);
    expect(nextPow2(16)).toBe(16);
    expect(nextPow2(17)).toBe(32);
    expect(nextPow2(33)).toBe(64);
  });
});

describe("standardSeedOrder", () => {
  it("matches the well-known recursive seed order", () => {
    expect(standardSeedOrder(2)).toEqual([1, 2]);
    expect(standardSeedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(standardSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(standardSeedOrder(16)).toEqual([1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]);
  });

  it("pairs seed s with (size+1-s) in round 1 for every size 2..64 (power of two)", () => {
    for (let size = 2; size <= 64; size *= 2) {
      const order = standardSeedOrder(size);
      expect(order).toHaveLength(size);
      expect(new Set(order).size).toBe(size); // every seed appears exactly once
      for (let i = 0; i < size; i += 2) {
        expect(order[i] + order[i + 1]).toBe(size + 1);
      }
    }
  });
});

describe("buildBracketSlots", () => {
  function makeEntries(n: number): Entry[] {
    return Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, name: `E${i + 1}`, seed: i + 1 }));
  }

  it("gives byes to the top seeds for every n = 2..33", () => {
    for (let n = 2; n <= 33; n++) {
      const entries = makeEntries(n);
      const slots = buildBracketSlots(entries);
      const pow2 = slots.length;
      expect(pow2).toBeGreaterThanOrEqual(n);
      expect(Math.log2(pow2) % 1).toBe(0);

      // Every entry appears exactly once; the rest are BYE.
      const realSlots = slots.filter((s) => s !== BYE);
      expect(realSlots.sort()).toEqual(entries.map((e) => e.id).sort());
      expect(slots.filter((s) => s === BYE)).toHaveLength(pow2 - n);

      // No BYE-vs-BYE in round 1 (mathematically impossible for a minimal bracket).
      for (let i = 0; i < pow2; i += 2) {
        expect(slots[i] === BYE && slots[i + 1] === BYE).toBe(false);
      }

      // Seed 1 (best) always faces a BYE unless the bracket is full (n === pow2).
      if (n < pow2) {
        const seed1Index = slots.indexOf("e1");
        const opponentIndex = seed1Index % 2 === 0 ? seed1Index + 1 : seed1Index - 1;
        expect(slots[opponentIndex]).toBe(BYE);
      }
    }
  });
});
