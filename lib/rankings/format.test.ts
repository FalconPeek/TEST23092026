import { describe, expect, it } from "vitest";
import { formatMetricValue, parseMetric, splitPodium, type LeaderboardRow } from "./format";

function row(overrides: Partial<LeaderboardRow>): LeaderboardRow {
  return {
    playerId: "p1",
    displayName: "Juan",
    avatarUrl: null,
    value: 10,
    rank: 1,
    matchesPlayed: 5,
    ...overrides,
  };
}

describe("parseMetric", () => {
  it("accepts every known metric", () => {
    for (const metric of ["ovr", "impacto", "goals", "assists", "mvps", "clean_sheets", "avg_rating", "matches"]) {
      expect(parseMetric(metric)).toBe(metric);
    }
  });

  it("falls back to ovr for an unknown or missing value", () => {
    expect(parseMetric("not_a_metric")).toBe("ovr");
    expect(parseMetric(undefined)).toBe("ovr");
    expect(parseMetric(null)).toBe("ovr");
    expect(parseMetric("")).toBe("ovr");
  });

  it("uses the first value when given an array (repeated query param)", () => {
    expect(parseMetric(["goals", "assists"])).toBe("goals");
    expect(parseMetric(["bogus", "assists"])).toBe("ovr");
  });
});

describe("formatMetricValue", () => {
  it("formats avg_rating with one decimal", () => {
    expect(formatMetricValue("avg_rating", 7.456)).toBe("7,5");
    expect(formatMetricValue("avg_rating", 7)).toBe("7,0");
  });

  it("formats every other metric as a rounded integer", () => {
    expect(formatMetricValue("goals", 12.6)).toBe("13");
    expect(formatMetricValue("ovr", 74)).toBe("74");
    expect(formatMetricValue("impacto", 55.2)).toBe("55");
  });
});

describe("splitPodium", () => {
  it("splits ranks 1-3 into positions and the rest into a flat list", () => {
    const rows = [1, 2, 3, 4, 5].map((rank) => row({ playerId: `p${rank}`, rank }));
    const { positions, rest } = splitPodium(rows);

    expect(positions.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(positions.every((p) => p.rows.length === 1)).toBe(true);
    expect(rest.map((r) => r.playerId)).toEqual(["p4", "p5"]);
  });

  it("groups a tie at the top into a single position with multiple rows", () => {
    const rows = [
      row({ playerId: "a", rank: 1, value: 90 }),
      row({ playerId: "b", rank: 1, value: 90 }),
      row({ playerId: "c", rank: 2, value: 80 }),
      row({ playerId: "d", rank: 3, value: 70 }),
    ];
    const { positions, rest } = splitPodium(rows);

    expect(positions).toHaveLength(3);
    expect(positions[0]!.rank).toBe(1);
    expect(positions[0]!.rows.map((r) => r.playerId)).toEqual(["a", "b"]);
    expect(positions[1]!.rank).toBe(2);
    expect(positions[2]!.rank).toBe(3);
    expect(rest).toEqual([]);
  });

  it("only ever returns up to 3 distinct rank positions, even with more entries tied at rank 3", () => {
    const rows = [
      row({ playerId: "a", rank: 1 }),
      row({ playerId: "b", rank: 2 }),
      row({ playerId: "c", rank: 3 }),
      row({ playerId: "d", rank: 3 }),
      row({ playerId: "e", rank: 3 }),
    ];
    const { positions, rest } = splitPodium(rows);

    expect(positions).toHaveLength(3);
    expect(positions[2]!.rows.map((r) => r.playerId)).toEqual(["c", "d", "e"]);
    expect(rest).toEqual([]);
  });

  it("returns an empty podium for an empty leaderboard", () => {
    expect(splitPodium([])).toEqual({ positions: [], rest: [] });
  });
});
