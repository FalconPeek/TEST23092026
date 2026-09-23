// Orchestrates Rule A end-to-end: score agreement -> per-player medians -> consistency ->
// clean sheets + MVP. This is what `lib/actions/finalize.ts` (server side) is expected to call.

import { checkScoreAgreement } from "./score";
import { computeCleanSheets, buildMvpCandidates, selectMvp } from "./mvp";
import { computePlayerStats, enforceConsistency } from "./stats";
import type { PlayerMatchStats, ReconcileResult, RosterEntry, ScoreReportInput, StatReportInput } from "./types";

export interface ReconcileMatchInput {
  roster: RosterEntry[];
  scoreReports: ScoreReportInput[];
  statReports: StatReportInput[];
  /** Per-player weighted median match rating (see lib/rating/form.ts `matchWeightedMedian`). */
  medianRatings?: Map<string, number>;
  /** OpenSkill ordinal per player, used only as an MVP tiebreak. */
  openskillOrdinals?: Map<string, number>;
}

export function reconcileMatch(input: ReconcileMatchInput): ReconcileResult {
  const { reasons: scoreReasons, score } = checkScoreAgreement(input.scoreReports);
  if (!score) return { status: "disputed", reasons: scoreReasons };

  const rawStats = computePlayerStats(input.statReports, input.roster);
  const { stats, adjustments, reasons: consistencyReasons } = enforceConsistency(rawStats, input.roster, score);
  if (consistencyReasons.length > 0) return { status: "disputed", reasons: consistencyReasons };

  const medianRatings = input.medianRatings ?? new Map();
  const openskillOrdinals = input.openskillOrdinals ?? new Map();
  const cleanSheets = computeCleanSheets(input.roster, score);
  const mvpPlayerId = selectMvp(buildMvpCandidates(stats, medianRatings, openskillOrdinals));

  const finalStats: PlayerMatchStats[] = stats.map((s) => ({
    ...s,
    cleanSheet: cleanSheets.get(s.playerId) ?? false,
    isMvp: s.playerId === mvpPlayerId,
    medianRating: medianRatings.get(s.playerId) ?? null,
  }));

  return { status: "ok", result: score, stats: finalStats, adjustments };
}
