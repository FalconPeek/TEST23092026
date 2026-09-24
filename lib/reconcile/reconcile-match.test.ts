import { describe, expect, it } from "vitest";
import { reconcileMatch } from "./reconcile-match";
import type { RosterEntry, ScoreReportInput, StatReportInput } from "./types";

const roster: RosterEntry[] = [
  { playerId: "p1", side: 1, role: "player" },
  { playerId: "p2", side: 1, role: "player" },
  { playerId: "p3", side: 2, role: "player" },
  { playerId: "p4", side: 2, role: "player" },
  { playerId: "spec1", side: 1, role: "spectator" },
];

const agreedScore: ScoreReportInput[] = [
  { reporterId: "p1", reporterSide: 1, team1Goals: 2, team2Goals: 1 },
  { reporterId: "p3", reporterSide: 2, team1Goals: 2, team2Goals: 1 },
];

describe("reconcileMatch", () => {
  it("disputes when the score itself is unresolved, without touching stats", () => {
    const result = reconcileMatch({ roster, scoreReports: [], statReports: [] });
    expect(result.status).toBe("disputed");
    if (result.status === "disputed") {
      expect(result.reasons).toEqual([
        { code: "SCORE_MISSING_SIDE", side: 1 },
        { code: "SCORE_MISSING_SIDE", side: 2 },
      ]);
    }
  });

  it("finalizes a score-only match: with no stat reports every goal stays unattributed", () => {
    const result = reconcileMatch({ roster, scoreReports: agreedScore, statReports: [] });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.stats.every((s) => s.goals === 0 && s.assists === 0)).toBe(true);
    }
  });

  it("produces final stats, clean sheets and MVP for a consistent match", () => {
    const statReports: StatReportInput[] = [
      { reporterId: "p1", subjectId: "p1", goals: 2, assists: 0, ownGoals: 0, saves: 0 },
      { reporterId: "p3", subjectId: "p1", goals: 2, assists: 0, ownGoals: 0, saves: 0 },
      { reporterId: "p1", subjectId: "p3", goals: 1, assists: 0, ownGoals: 0, saves: 0 },
    ];
    const medianRatings = new Map([
      ["p1", 9],
      ["p2", 6],
      ["p3", 5],
      ["p4", 5],
    ]);
    const result = reconcileMatch({ roster, scoreReports: agreedScore, statReports, medianRatings });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.result).toEqual({ team1Goals: 2, team2Goals: 1 });
    const p1 = result.stats.find((s) => s.playerId === "p1")!;
    expect(p1.goals).toBe(2);
    expect(p1.cleanSheet).toBe(false); // side 1 conceded 1
    expect(p1.isMvp).toBe(true); // highest median rating
    expect(p1.medianRating).toBe(9);

    const p2 = result.stats.find((s) => s.playerId === "p2")!;
    expect(p2.goals).toBe(0);
    expect(p2.isMvp).toBe(false);

    expect(result.stats.some((s) => s.playerId === "spec1")).toBe(false);
  });

  it("drops the least-supported goal claim and still finalizes instead of disputing", () => {
    const statReports: StatReportInput[] = [
      { reporterId: "p1", subjectId: "p1", goals: 1, assists: 0, ownGoals: 0, saves: 0 },
      { reporterId: "p3", subjectId: "p1", goals: 1, assists: 0, ownGoals: 0, saves: 0 },
      { reporterId: "p1", subjectId: "p2", goals: 1, assists: 0, ownGoals: 0, saves: 0 }, // single, weakly supported extra claim
      { reporterId: "p1", subjectId: "p3", goals: 1, assists: 0, ownGoals: 0, saves: 0 },
      { reporterId: "p3", subjectId: "p3", goals: 1, assists: 0, ownGoals: 0, saves: 0 },
    ];
    // Side1 claims: p1=1 (support2), p2=1 (support1) -> total 2, but official score is 2-1... wait
    // team1Goals is 2, so 1+1=2 matches exactly; use a 3-1 score to force an actual drop.
    const scoreReports: ScoreReportInput[] = [
      { reporterId: "p1", reporterSide: 1, team1Goals: 1, team2Goals: 1 },
      { reporterId: "p3", reporterSide: 2, team1Goals: 1, team2Goals: 1 },
    ];
    const result = reconcileMatch({ roster, scoreReports, statReports });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.adjustments).toEqual([{ playerId: "p2", field: "goals", from: 1, to: 0, reason: "GOALS_INCONSISTENT" }]);
    expect(result.stats.find((s) => s.playerId === "p1")!.goals).toBe(1);
    expect(result.stats.find((s) => s.playerId === "p2")!.goals).toBe(0);
  });

  it("has no MVP when no median ratings are provided", () => {
    const statReports: StatReportInput[] = [{ reporterId: "p1", subjectId: "p1", goals: 0, assists: 0, ownGoals: 0, saves: 0 }];
    const result = reconcileMatch({ roster, scoreReports: [
      { reporterId: "p1", reporterSide: 1, team1Goals: 0, team2Goals: 0 },
      { reporterId: "p3", reporterSide: 2, team1Goals: 0, team2Goals: 0 },
    ], statReports });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.stats.every((s) => !s.isMvp)).toBe(true);
    expect(result.stats.every((s) => s.cleanSheet)).toBe(true); // 0-0
  });
});
