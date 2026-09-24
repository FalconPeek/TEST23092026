import { describe, expect, it } from "vitest";
import {
  buildRatingsPayload,
  buildStatReportsPayload,
  goalsCheck,
  ratingsComplete,
  type RatingRow,
  type StatRow,
} from "./report";

function statRow(overrides: Partial<StatRow> = {}): StatRow {
  return {
    playerId: "p1",
    side: 1,
    goals: 0,
    assists: 0,
    ownGoals: 0,
    saves: 0,
    wasPreviouslyReported: false,
    ...overrides,
  };
}

describe("buildStatReportsPayload", () => {
  it("drops rows with every value at zero that were never previously reported", () => {
    const rows = [statRow({ playerId: "p1" }), statRow({ playerId: "p2", goals: 1 })];
    expect(buildStatReportsPayload(rows)).toEqual([
      { subjectPlayerId: "p2", goals: 1, assists: 0, ownGoals: 0, saves: 0 },
    ]);
  });

  it("keeps a previously-reported row even when every value is now zero (allows clearing it)", () => {
    const rows = [statRow({ playerId: "p1", wasPreviouslyReported: true })];
    expect(buildStatReportsPayload(rows)).toEqual([
      { subjectPlayerId: "p1", goals: 0, assists: 0, ownGoals: 0, saves: 0 },
    ]);
  });

  it("maps camelCase fields to the subject_player_id-shaped payload", () => {
    const rows = [statRow({ playerId: "p1", assists: 2, ownGoals: 1, saves: 5 })];
    expect(buildStatReportsPayload(rows)).toEqual([
      { subjectPlayerId: "p1", goals: 0, assists: 2, ownGoals: 1, saves: 5 },
    ]);
  });
});

describe("goalsCheck", () => {
  it("sums only the requested side's goals", () => {
    const stats = [
      statRow({ playerId: "p1", side: 1, goals: 2 }),
      statRow({ playerId: "p2", side: 1, goals: 1 }),
      statRow({ playerId: "p3", side: 2, goals: 5 }),
    ];
    expect(goalsCheck(stats, { team1Goals: 3, team2Goals: 5 }, 1)).toEqual({ loaded: 3, expected: 3 });
    expect(goalsCheck(stats, { team1Goals: 3, team2Goals: 5 }, 2)).toEqual({ loaded: 5, expected: 5 });
  });

  it("returns expected: null when there's no score report yet", () => {
    const stats = [statRow({ side: 1, goals: 2 })];
    expect(goalsCheck(stats, null, 1)).toEqual({ loaded: 2, expected: null });
  });

  it("flags a mismatch by returning different loaded/expected values (warning, not blocking)", () => {
    const stats = [statRow({ side: 1, goals: 1 })];
    const result = goalsCheck(stats, { team1Goals: 3, team2Goals: 0 }, 1);
    expect(result.loaded).not.toBe(result.expected);
  });
});

function ratingRow(overrides: Partial<RatingRow> = {}): RatingRow {
  return { targetPlayerId: "p1", rating: undefined, standoutAttributes: [], ...overrides };
}

describe("ratingsComplete", () => {
  it("is false until every required player has a rating", () => {
    const ratings = [ratingRow({ targetPlayerId: "p1", rating: 8 })];
    expect(ratingsComplete(ratings, ["p1", "p2"])).toBe(false);
  });

  it("is true once every required player is rated", () => {
    const ratings = [ratingRow({ targetPlayerId: "p1", rating: 8 }), ratingRow({ targetPlayerId: "p2", rating: 6 })];
    expect(ratingsComplete(ratings, ["p1", "p2"])).toBe(true);
  });

  it("is false when there are no required players (nothing to rate is not 'complete')", () => {
    expect(ratingsComplete([], [])).toBe(false);
  });
});

describe("buildRatingsPayload", () => {
  it("only includes rows with a defined rating", () => {
    const ratings = [
      ratingRow({ targetPlayerId: "p1", rating: 7, standoutAttributes: ["finishing"] }),
      ratingRow({ targetPlayerId: "p2", rating: undefined }),
    ];
    expect(buildRatingsPayload(ratings)).toEqual([
      { targetPlayerId: "p1", rating: 7, standoutAttributes: ["finishing"] },
    ]);
  });
});
