import { describe, expect, it } from "vitest";
import { clamp, daysBetween, mad, mean, median, recencyWeight, stdDev, weightedMedian } from "./stats";

describe("mean/median/mad/stdDev", () => {
  it("handle the empty array as 0", () => {
    expect(mean([])).toBe(0);
    expect(median([])).toBe(0);
    expect(mad([])).toBe(0);
    expect(stdDev([])).toBe(0);
  });

  it("compute hand-checked values for a small odd-length set", () => {
    const values = [1, 2, 3, 4, 100];
    expect(mean(values)).toBeCloseTo(22, 9);
    expect(median(values)).toBe(3);
    // deviations from median 3: [2,1,0,1,97] -> median of those = 1
    expect(mad(values)).toBe(1);
  });

  it("median averages the two middle values for even-length sets", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("mad is 0 for identical values (all votes agree)", () => {
    expect(mad([5, 5, 5, 5])).toBe(0);
  });

  it("stdDev of a single value is 0", () => {
    expect(stdDev([42])).toBe(0);
  });
});

describe("weightedMedian", () => {
  it("returns 0 for no entries or all-zero weights", () => {
    expect(weightedMedian([])).toBe(0);
    expect(weightedMedian([{ value: 5, weight: 0 }])).toBe(0);
  });

  it("matches plain median when weights are equal", () => {
    const entries = [1, 2, 3, 4, 5].map((value) => ({ value, weight: 1 }));
    expect(weightedMedian(entries)).toBe(3);
  });

  it("a heavily-weighted single vote can dominate", () => {
    const entries = [
      { value: 10, weight: 100 },
      { value: 1, weight: 1 },
      { value: 2, weight: 1 },
    ];
    expect(weightedMedian(entries)).toBe(10);
  });

  it("averages across the halfway point on an even weight split", () => {
    const entries = [
      { value: 2, weight: 1 },
      { value: 8, weight: 1 },
    ];
    expect(weightedMedian(entries)).toBe(5);
  });
});

describe("clamp / daysBetween / recencyWeight", () => {
  it("clamps into range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it("daysBetween is never negative and counts whole days correctly", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-01-03T00:00:00Z");
    expect(daysBetween(from, to)).toBe(2);
    expect(daysBetween(to, from)).toBe(0); // clamps negative age to 0
  });

  it("recencyWeight halves exactly at the half-life", () => {
    expect(recencyWeight(90, 90)).toBeCloseTo(0.5, 9);
    expect(recencyWeight(0, 90)).toBe(1);
    expect(recencyWeight(180, 90)).toBeCloseTo(0.25, 9);
  });
});
