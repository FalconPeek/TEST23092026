import { describe, expect, it } from "vitest";
import { changedRows, unattributedGoals, validateAmendment, type AmendStatRow } from "./amend";

function row(overrides: Partial<AmendStatRow> = {}): AmendStatRow {
  return { playerId: "p1", side: 1, goals: 0, assists: 0, ownGoals: 0, saves: 0, ...overrides };
}

describe("unattributedGoals", () => {
  it("is the official score minus attributed goals minus the opponent's own goals", () => {
    const score = { team1Goals: 3, team2Goals: 1 };
    const stats = [row({ playerId: "p1", side: 1, goals: 1 }), row({ playerId: "p2", side: 2, ownGoals: 1 })];
    expect(unattributedGoals(score, stats)).toEqual({ side1: 1, side2: 1 });
  });

  it("never goes negative", () => {
    const score = { team1Goals: 1, team2Goals: 0 };
    const stats = [row({ playerId: "p1", side: 1, goals: 2 })];
    expect(unattributedGoals(score, stats).side1).toBe(0);
  });

  it("is 0 when every goal is attributed", () => {
    const score = { team1Goals: 2, team2Goals: 0 };
    const stats = [row({ playerId: "p1", side: 1, goals: 2 })];
    expect(unattributedGoals(score, stats).side1).toBe(0);
  });
});

describe("validateAmendment", () => {
  it("is valid when goals and assists fit within the score", () => {
    const score = { team1Goals: 2, team2Goals: 1 };
    const stats = [row({ playerId: "p1", side: 1, goals: 2, assists: 1 })];
    expect(validateAmendment(score, stats)).toEqual({ side1: false, side2: false });
  });

  it("flags a side whose attributed goals + opponent own goals exceed its score", () => {
    const score = { team1Goals: 1, team2Goals: 0 };
    const stats = [row({ playerId: "p1", side: 1, goals: 1 }), row({ playerId: "p2", side: 2, ownGoals: 1 })];
    // side1 = 1 (goals) + 1 (opponent own goal) = 2 > official 1
    expect(validateAmendment(score, stats).side1).toBe(true);
  });

  it("flags a side whose assists exceed score minus opponent own goals", () => {
    const score = { team1Goals: 1, team2Goals: 0 };
    const stats = [row({ playerId: "p1", side: 1, goals: 0, assists: 2 })];
    expect(validateAmendment(score, stats).side1).toBe(true);
  });

  it("does not flag the other side", () => {
    const score = { team1Goals: 1, team2Goals: 5 };
    const stats = [
      row({ playerId: "p1", side: 1, goals: 1 }),
      row({ playerId: "p2", side: 2, goals: 5 }),
    ];
    expect(validateAmendment(score, stats)).toEqual({ side1: false, side2: false });
  });
});

describe("changedRows", () => {
  it("includes only rows with a changed field, and only the changed keys", () => {
    const initial: AmendStatRow[] = [
      row({ playerId: "p1", goals: 0, assists: 0 }),
      row({ playerId: "p2", goals: 1, assists: 1 }),
    ];
    const edited: AmendStatRow[] = [
      row({ playerId: "p1", goals: 1, assists: 0 }),
      row({ playerId: "p2", goals: 1, assists: 1 }),
    ];
    expect(changedRows(initial, edited)).toEqual([{ subjectPlayerId: "p1", goals: 1 }]);
  });

  it("includes multiple changed keys on the same row", () => {
    const initial: AmendStatRow[] = [row({ playerId: "p1", goals: 0, saves: 0 })];
    const edited: AmendStatRow[] = [row({ playerId: "p1", goals: 2, saves: 3 })];
    expect(changedRows(initial, edited)).toEqual([{ subjectPlayerId: "p1", goals: 2, saves: 3 }]);
  });

  it("returns an empty array when nothing changed", () => {
    const initial: AmendStatRow[] = [row({ playerId: "p1", goals: 1 })];
    const edited: AmendStatRow[] = [row({ playerId: "p1", goals: 1 })];
    expect(changedRows(initial, edited)).toEqual([]);
  });
});
