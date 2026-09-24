import { describe, expect, it } from "vitest";
import { computePlayerStats, enforceConsistency } from "./stats";
import type { ReconciledPlayerStats, RosterEntry, StatReportInput } from "./types";

const roster: RosterEntry[] = [
  { playerId: "p1", side: 1, role: "player" },
  { playerId: "p2", side: 1, role: "player" },
  { playerId: "s1", side: 1, role: "spectator" },
];

describe("computePlayerStats", () => {
  it("returns zeroed stats (0 reports) for a player with no reports at all", () => {
    const result = computePlayerStats([], roster);
    expect(result).toEqual([
      { playerId: "p1", goals: 0, assists: 0, ownGoals: 0, saves: 0, nReports: 0 },
      { playerId: "p2", goals: 0, assists: 0, ownGoals: 0, saves: 0, nReports: 0 },
    ]);
  });

  it("accepts a lone self-report as the median of 1", () => {
    const reports: StatReportInput[] = [{ reporterId: "p1", subjectId: "p1", goals: 2, assists: 1, ownGoals: 0, saves: 0 }];
    const result = computePlayerStats(reports, roster);
    expect(result.find((s) => s.playerId === "p1")).toEqual({ playerId: "p1", goals: 2, assists: 1, ownGoals: 0, saves: 0, nReports: 1 });
  });

  it("medians multiple reports about the same subject", () => {
    const reports: StatReportInput[] = [
      { reporterId: "p1", subjectId: "p1", goals: 2, assists: 1, ownGoals: 0, saves: 0 },
      { reporterId: "p2", subjectId: "p1", goals: 4, assists: 1, ownGoals: 0, saves: 0 },
    ];
    const result = computePlayerStats(reports, roster);
    expect(result.find((s) => s.playerId === "p1")!.goals).toBe(3); // median(2,4)=3
    expect(result.find((s) => s.playerId === "p1")!.nReports).toBe(2);
  });

  it("ignores reports about a non-player (e.g. a spectator)", () => {
    const reports: StatReportInput[] = [{ reporterId: "p1", subjectId: "s1", goals: 5, assists: 0, ownGoals: 0, saves: 0 }];
    const result = computePlayerStats(reports, roster);
    expect(result.some((s) => s.playerId === "s1")).toBe(false);
  });
});

function claim(playerId: string, values: Partial<ReconciledPlayerStats>): ReconciledPlayerStats {
  return { playerId, goals: 0, assists: 0, ownGoals: 0, saves: 0, nReports: 1, ...values };
}

describe("enforceConsistency", () => {
  const twoSideRoster: RosterEntry[] = [
    { playerId: "p1", side: 1, role: "player" },
    { playerId: "p2", side: 1, role: "player" },
    { playerId: "p3", side: 2, role: "player" },
  ];

  it("passes through an already-consistent match with no adjustments", () => {
    const stats = [claim("p1", { goals: 1, nReports: 2 }), claim("p2", { goals: 1, nReports: 2 }), claim("p3", { nReports: 1 })];
    const result = enforceConsistency(stats, twoSideRoster, { team1Goals: 2, team2Goals: 0 });
    expect(result.adjustments).toEqual([]);
    expect(result.reasons).toEqual([]);
  });

  it("drops the least-supported goal claim when claims exceed the official score", () => {
    // side1 scored 3, but p1(support2)+p2(support1) claim 2+2=4.
    const stats = [claim("p1", { goals: 2, nReports: 2 }), claim("p2", { goals: 2, nReports: 1 }), claim("p3", { nReports: 1 })];
    const result = enforceConsistency(stats, twoSideRoster, { team1Goals: 3, team2Goals: 0 });
    expect(result.reasons).toEqual([]);
    expect(result.adjustments).toEqual([{ playerId: "p2", field: "goals", from: 2, to: 1, reason: "GOALS_INCONSISTENT" }]);
    expect(result.stats.find((s) => s.playerId === "p1")!.goals).toBe(2);
    expect(result.stats.find((s) => s.playerId === "p2")!.goals).toBe(1);
  });

  it("accepts claims that fall short of the official score (the rest stay unattributed)", () => {
    const stats = [claim("p1", { goals: 1, nReports: 2 }), claim("p2", { nReports: 1 }), claim("p3", { nReports: 1 })];
    const result = enforceConsistency(stats, twoSideRoster, { team1Goals: 5, team2Goals: 0 });
    expect(result.reasons).toEqual([]);
    expect(result.adjustments).toEqual([]);
    expect(result.stats.find((s) => s.playerId === "p1")!.goals).toBe(1);
  });

  it("caps assists by the official score, not by the attributed goals", () => {
    // Side 1 won 3-0 but only 1 goal was attributed; 2 assists are still possible.
    const stats = [claim("p1", { goals: 1, assists: 2, nReports: 2 }), claim("p2", { nReports: 1 }), claim("p3", { nReports: 1 })];
    const result = enforceConsistency(stats, twoSideRoster, { team1Goals: 3, team2Goals: 0 });
    expect(result.reasons).toEqual([]);
    expect(result.stats.find((s) => s.playerId === "p1")!.assists).toBe(2);
  });

  it("does not count the opponent's own goals toward the assists cap", () => {
    // Side 1's single goal was an own goal by p3, so side 1 can have no assists.
    const stats = [claim("p1", { assists: 1, nReports: 2 }), claim("p2", { nReports: 1 }), claim("p3", { ownGoals: 1, nReports: 3 })];
    const result = enforceConsistency(stats, twoSideRoster, { team1Goals: 1, team2Goals: 0 });
    expect(result.stats.find((s) => s.playerId === "p1")!.assists).toBe(0);
  });

  it("counts an opponent's own goals toward a side's official score", () => {
    const stats = [claim("p1", { goals: 1, nReports: 2 }), claim("p2", { nReports: 1 }), claim("p3", { ownGoals: 1, nReports: 3 })];
    const result = enforceConsistency(stats, twoSideRoster, { team1Goals: 2, team2Goals: 0 });
    expect(result.reasons).toEqual([]);
    expect(result.adjustments).toEqual([]);
  });

  it("drops the least-supported assist claim when assists exceed the side's goals", () => {
    const stats = [
      claim("p1", { goals: 2, assists: 1, nReports: 2 }),
      claim("p2", { assists: 2, nReports: 1 }),
      claim("p3", { nReports: 1 }),
    ];
    const result = enforceConsistency(stats, twoSideRoster, { team1Goals: 2, team2Goals: 0 });
    expect(result.reasons).toEqual([]);
    expect(result.adjustments).toEqual([{ playerId: "p2", field: "assists", from: 2, to: 1, reason: "ASSISTS_EXCEED_GOALS" }]);
    const assistsTotal = result.stats.filter((s) => s.playerId !== "p3").reduce((a, s) => a + s.assists, 0);
    expect(assistsTotal).toBeLessThanOrEqual(2);
  });

  it("handles a 0-0 draw with no stats cleanly", () => {
    const stats = [claim("p1", { nReports: 0 }), claim("p2", { nReports: 0 }), claim("p3", { nReports: 0 })];
    const result = enforceConsistency(stats, twoSideRoster, { team1Goals: 0, team2Goals: 0 });
    expect(result.reasons).toEqual([]);
    expect(result.adjustments).toEqual([]);
  });
});
