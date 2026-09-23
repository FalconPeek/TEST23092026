export type Side = 1 | 2;

export interface ScoreReportInput {
  reporterId: string;
  reporterSide: Side;
  team1Goals: number;
  team2Goals: number;
}

export interface StatReportInput {
  reporterId: string;
  subjectId: string;
  goals: number;
  assists: number;
  ownGoals: number;
  saves: number;
}

export interface RosterEntry {
  playerId: string;
  side: Side;
  role: "player" | "spectator";
}

export type DisputeReason =
  | { code: "SCORE_MISSING_SIDE"; side: Side }
  | { code: "SCORE_MISMATCH"; reports: { reporterId: string; team1Goals: number; team2Goals: number }[] }
  | { code: "GOALS_INCONSISTENT"; side: Side; claimedTotal: number; officialScore: number }
  | { code: "ASSISTS_EXCEED_GOALS"; side: Side; assistsTotal: number; goalsTotal: number };

export interface StatAdjustment {
  playerId: string;
  field: "goals" | "assists" | "own_goals";
  from: number;
  to: number;
  reason: "GOALS_INCONSISTENT" | "ASSISTS_EXCEED_GOALS";
}

export interface ReconciledPlayerStats {
  playerId: string;
  goals: number;
  assists: number;
  ownGoals: number;
  saves: number;
  /** How many distinct reporters submitted a stat report about this player (0 = no report at all). */
  nReports: number;
}

export interface PlayerMatchStats extends ReconciledPlayerStats {
  cleanSheet: boolean;
  isMvp: boolean;
  medianRating: number | null;
}

export interface MatchResultScore {
  team1Goals: number;
  team2Goals: number;
}

export type ReconcileResult =
  | { status: "ok"; result: MatchResultScore; stats: PlayerMatchStats[]; adjustments: StatAdjustment[] }
  | { status: "disputed"; reasons: DisputeReason[] };
