import { describe, expect, it } from "vitest";
import { checkScoreAgreement } from "./score";
import type { ScoreReportInput } from "./types";

describe("checkScoreAgreement", () => {
  it("disputes when a side has no reporter at all", () => {
    const result = checkScoreAgreement([{ reporterId: "r1", reporterSide: 1, team1Goals: 3, team2Goals: 1 }]);
    expect(result.score).toBeNull();
    expect(result.reasons).toEqual([{ code: "SCORE_MISSING_SIDE", side: 2 }]);
  });

  it("disputes both missing sides with 0 reports", () => {
    const result = checkScoreAgreement([]);
    expect(result.reasons).toEqual([
      { code: "SCORE_MISSING_SIDE", side: 1 },
      { code: "SCORE_MISSING_SIDE", side: 2 },
    ]);
  });

  it("accepts a single agreeing report per side", () => {
    const reports: ScoreReportInput[] = [
      { reporterId: "r1", reporterSide: 1, team1Goals: 3, team2Goals: 1 },
      { reporterId: "r2", reporterSide: 2, team1Goals: 3, team2Goals: 1 },
    ];
    const result = checkScoreAgreement(reports);
    expect(result.reasons).toEqual([]);
    expect(result.score).toEqual({ team1Goals: 3, team2Goals: 1 });
  });

  it("disputes on any mismatch between reports", () => {
    const reports: ScoreReportInput[] = [
      { reporterId: "r1", reporterSide: 1, team1Goals: 3, team2Goals: 1 },
      { reporterId: "r2", reporterSide: 2, team1Goals: 2, team2Goals: 1 },
    ];
    const result = checkScoreAgreement(reports);
    expect(result.score).toBeNull();
    expect(result.reasons).toEqual([
      {
        code: "SCORE_MISMATCH",
        reports: [
          { reporterId: "r1", team1Goals: 3, team2Goals: 1 },
          { reporterId: "r2", team1Goals: 2, team2Goals: 1 },
        ],
      },
    ]);
  });

  it("accepts multiple agreeing reports on the same side plus one from the other", () => {
    const reports: ScoreReportInput[] = [
      { reporterId: "r1", reporterSide: 1, team1Goals: 2, team2Goals: 2 },
      { reporterId: "r1b", reporterSide: 1, team1Goals: 2, team2Goals: 2 },
      { reporterId: "r2", reporterSide: 2, team1Goals: 2, team2Goals: 2 },
    ];
    expect(checkScoreAgreement(reports).score).toEqual({ team1Goals: 2, team2Goals: 2 });
  });
});
