import { describe, expect, it } from "vitest";
import { seededRng, shuffle } from "./rng";

describe("seededRng", () => {
  it("is deterministic for a given seed", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces values in [0, 1)", () => {
    const rng = seededRng(7);
    for (let i = 0; i < 500; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("different seeds diverge", () => {
    const a = seededRng(1)();
    const b = seededRng(2)();
    expect(a).not.toBe(b);
  });
});

describe("shuffle", () => {
  it("is a permutation and deterministic for a given rng seed", () => {
    const items = Array.from({ length: 15 }, (_, i) => i);
    const s1 = shuffle(items, seededRng(9));
    const s2 = shuffle(items, seededRng(9));
    expect(s1).toEqual(s2);
    expect([...s1].sort((a, b) => a - b)).toEqual(items);
  });

  it("does not mutate the input", () => {
    const items = [1, 2, 3, 4];
    const copy = [...items];
    shuffle(items, seededRng(3));
    expect(items).toEqual(copy);
  });
});
