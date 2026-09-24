// Pure helpers for the match report/rate forms: building RPC payloads from form state and
// the two live checks (goals-loaded vs. reported score, ratings completeness). No I/O.

export interface StatRow {
  playerId: string;
  side: 1 | 2;
  goals: number;
  assists: number;
  ownGoals: number;
  saves: number;
  /** True if this player already had a stat_reports row from me before this edit session. */
  wasPreviouslyReported: boolean;
}

export interface StatReportPayloadRow {
  subjectPlayerId: string;
  goals: number;
  assists: number;
  ownGoals: number;
  saves: number;
}

/**
 * Only rows with a non-zero value, or rows I'd already reported (so an edit can clear a
 * previously-reported stat back to zero), are sent to submitStatReports.
 */
export function buildStatReportsPayload(rows: StatRow[]): StatReportPayloadRow[] {
  return rows
    .filter((r) => r.wasPreviouslyReported || r.goals > 0 || r.assists > 0 || r.ownGoals > 0 || r.saves > 0)
    .map(({ playerId, goals, assists, ownGoals, saves }) => ({
      subjectPlayerId: playerId,
      goals,
      assists,
      ownGoals,
      saves,
    }));
}

export interface ScoreReport {
  team1Goals: number;
  team2Goals: number;
}

/** Sum of goals currently entered in the stats form for one side, vs. that side's reported score. */
export function goalsCheck(
  stats: StatRow[],
  score: ScoreReport | null,
  side: 1 | 2,
): { loaded: number; expected: number | null } {
  const loaded = stats.filter((s) => s.side === side).reduce((sum, s) => sum + s.goals, 0);
  const expected = score === null ? null : side === 1 ? score.team1Goals : score.team2Goals;
  return { loaded, expected };
}

export interface RatingRow {
  targetPlayerId: string;
  rating: number | undefined;
  standoutAttributes: string[];
}

export interface RatingPayloadRow {
  targetPlayerId: string;
  rating: number;
  standoutAttributes: string[];
}

/** Every one of `requiredPlayerIds` must have a rating before the ratings can be submitted. */
export function ratingsComplete(ratings: RatingRow[], requiredPlayerIds: string[]): boolean {
  const rated = new Set(ratings.filter((r) => r.rating !== undefined).map((r) => r.targetPlayerId));
  return requiredPlayerIds.length > 0 && requiredPlayerIds.every((id) => rated.has(id));
}

export function buildRatingsPayload(ratings: RatingRow[]): RatingPayloadRow[] {
  return ratings
    .filter((r): r is RatingRow & { rating: number } => r.rating !== undefined)
    .map(({ targetPlayerId, rating, standoutAttributes }) => ({ targetPlayerId, rating, standoutAttributes }));
}
