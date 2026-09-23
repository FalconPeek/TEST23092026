// Rule A step 1: score agreement. At least one reporter per side, and every report must agree.

import type { DisputeReason, MatchResultScore, ScoreReportInput, Side } from "./types";

export interface ScoreAgreementResult {
  reasons: DisputeReason[];
  score: MatchResultScore | null;
}

export function checkScoreAgreement(reports: ScoreReportInput[]): ScoreAgreementResult {
  const reasons: DisputeReason[] = [];

  for (const side of [1, 2] as Side[]) {
    if (!reports.some((r) => r.reporterSide === side)) {
      reasons.push({ code: "SCORE_MISSING_SIDE", side });
    }
  }
  if (reasons.length > 0) return { reasons, score: null };

  const first = reports[0];
  const allAgree = reports.every((r) => r.team1Goals === first.team1Goals && r.team2Goals === first.team2Goals);
  if (!allAgree) {
    reasons.push({
      code: "SCORE_MISMATCH",
      reports: reports.map((r) => ({ reporterId: r.reporterId, team1Goals: r.team1Goals, team2Goals: r.team2Goals })),
    });
    return { reasons, score: null };
  }

  return { reasons: [], score: { team1Goals: first.team1Goals, team2Goals: first.team2Goals } };
}
