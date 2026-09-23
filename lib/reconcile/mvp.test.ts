import { describe, expect, it } from "vitest";
import { buildMvpCandidates, computeCleanSheets, selectMvp, type MvpCandidate } from "./mvp";
import type { ReconciledPlayerStats, RosterEntry } from "./types";

describe("computeCleanSheets", () => {
  const roster: RosterEntry[] = [
    { playerId: "p1", side: 1, role: "player" },
    { playerId: "p2", side: 1, role: "player" },
    { playerId: "p3", side: 2, role: "player" },
    { playerId: "spec1", side: 1, role: "spectator" },
  ];

  it("credits every player (not just the GK) on a side that conceded 0", () => {
    const result = computeCleanSheets(roster, { team1Goals: 2, team2Goals: 0 });
    expect(result.get("p1")).toBe(true);
    expect(result.get("p2")).toBe(true);
    expect(result.get("p3")).toBe(false);
  });

  it("does not include spectators", () => {
    const result = computeCleanSheets(roster, { team1Goals: 2, team2Goals: 0 });
    expect(result.has("spec1")).toBe(false);
  });

  it("nobody gets a clean sheet in a 1-1 draw", () => {
    const result = computeCleanSheets(roster, { team1Goals: 1, team2Goals: 1 });
    expect(result.get("p1")).toBe(false);
    expect(result.get("p3")).toBe(false);
  });

  it("both sides get one in a 0-0 draw", () => {
    const result = computeCleanSheets(roster, { team1Goals: 0, team2Goals: 0 });
    expect(result.get("p1")).toBe(true);
    expect(result.get("p3")).toBe(true);
  });
});

function candidate(playerId: string, overrides: Partial<MvpCandidate> = {}): MvpCandidate {
  return { playerId, medianRating: 7, goals: 0, assists: 0, openskillOrdinal: 0, ...overrides };
}

describe("selectMvp", () => {
  it("returns null with no candidates", () => {
    expect(selectMvp([])).toBeNull();
  });

  it("picks the highest median rating outright", () => {
    const result = selectMvp([candidate("low", { medianRating: 6 }), candidate("high", { medianRating: 9 })]);
    expect(result).toBe("high");
  });

  it("breaks a median-rating tie by goals+assists", () => {
    const result = selectMvp([
      candidate("a", { medianRating: 8, goals: 1, assists: 0 }),
      candidate("b", { medianRating: 8, goals: 1, assists: 1 }),
    ]);
    expect(result).toBe("b");
  });

  it("breaks a goals+assists tie by OpenSkill ordinal", () => {
    const result = selectMvp([
      candidate("a", { medianRating: 8, goals: 1, openskillOrdinal: 10 }),
      candidate("b", { medianRating: 8, goals: 1, openskillOrdinal: 20 }),
    ]);
    expect(result).toBe("b");
  });

  it("finally breaks a full tie by ascending player id (deterministic)", () => {
    const result = selectMvp([candidate("zeta"), candidate("alpha")]);
    expect(result).toBe("alpha");
  });
});

describe("buildMvpCandidates", () => {
  it("only includes players with a median rating (min raters requirement lives upstream)", () => {
    const stats: ReconciledPlayerStats[] = [
      { playerId: "p1", goals: 1, assists: 0, ownGoals: 0, saves: 0, nReports: 1 },
      { playerId: "p2", goals: 0, assists: 0, ownGoals: 0, saves: 0, nReports: 1 },
    ];
    const candidates = buildMvpCandidates(stats, new Map([["p1", 8]]), new Map());
    expect(candidates).toEqual([{ playerId: "p1", medianRating: 8, goals: 1, assists: 0, openskillOrdinal: 0 }]);
  });
});
