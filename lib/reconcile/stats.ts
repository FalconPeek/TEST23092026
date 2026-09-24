// Rule A steps 2-3: per-player median stats, then consistency (goals + opponent own goals =
// score; assists <= goals), dropping the least-supported claims until consistent.

import { median } from "@/lib/rating/stats";
import type { DisputeReason, MatchResultScore, ReconciledPlayerStats, RosterEntry, Side, StatAdjustment, StatReportInput } from "./types";

/** Median of all reports about each roster player. A lone self-report is accepted (median of 1). */
export function computePlayerStats(statReports: StatReportInput[], roster: RosterEntry[]): ReconciledPlayerStats[] {
  const players = roster.filter((r) => r.role === "player");
  const bySubject = new Map<string, StatReportInput[]>();
  for (const report of statReports) {
    if (!players.some((p) => p.playerId === report.subjectId)) continue; // ignore reports about non-players
    const list = bySubject.get(report.subjectId) ?? [];
    list.push(report);
    bySubject.set(report.subjectId, list);
  }

  return players.map((p) => {
    const reports = bySubject.get(p.playerId) ?? [];
    if (reports.length === 0) {
      return { playerId: p.playerId, goals: 0, assists: 0, ownGoals: 0, saves: 0, nReports: 0 };
    }
    return {
      playerId: p.playerId,
      goals: Math.max(0, Math.round(median(reports.map((r) => r.goals)))),
      assists: Math.max(0, Math.round(median(reports.map((r) => r.assists)))),
      ownGoals: Math.max(0, Math.round(median(reports.map((r) => r.ownGoals)))),
      saves: Math.max(0, Math.round(median(reports.map((r) => r.saves)))),
      nReports: reports.length,
    };
  });
}

interface Claim {
  playerId: string;
  field: "goals" | "own_goals" | "assists";
  value: number;
  support: number;
}

/** Reduces claims (least-supported first) until their total drops to `target`, or they run out. */
function dropExcess(claims: Claim[], excess: number): { adjustments: Map<string, number>; remaining: number } {
  const pool = claims.filter((c) => c.value > 0).map((c) => ({ ...c }));
  const adjustments = new Map<string, number>(); // key = `${playerId}:${field}` -> new value
  let remaining = excess;

  while (remaining > 1e-9) {
    pool.sort((a, b) => a.support - b.support || a.value - b.value || a.playerId.localeCompare(b.playerId));
    const claim = pool.find((c) => c.value > 0);
    if (!claim) break; // nothing left to drop

    const reduceBy = Math.min(claim.value, remaining);
    claim.value -= reduceBy;
    remaining -= reduceBy;
    adjustments.set(`${claim.playerId}:${claim.field}`, claim.value);
  }

  return { adjustments, remaining };
}

export interface ConsistencyResult {
  stats: ReconciledPlayerStats[];
  adjustments: StatAdjustment[];
  reasons: DisputeReason[];
}

/**
 * Enforces: sum(goals on side) + sum(own_goals by the opponent) === official score(side),
 * and sum(assists on side) <= sum(goals on side). Mutates a copy of `stats`, dropping the
 * least-supported claims (fewest reporters) first when a total needs to shrink.
 */
export function enforceConsistency(stats: ReconciledPlayerStats[], roster: RosterEntry[], score: MatchResultScore): ConsistencyResult {
  const byId = new Map(stats.map((s) => [s.playerId, { ...s }]));
  const sideOf = new Map(roster.map((r) => [r.playerId, r.side]));
  const adjustments: StatAdjustment[] = [];
  const reasons: DisputeReason[] = [];

  const playersOfSide = (side: Side) =>
    stats.filter((s) => sideOf.get(s.playerId) === side).map((s) => byId.get(s.playerId)!);

  const applyAdjustment = (playerId: string, field: "goals" | "own_goals" | "assists", newValue: number, reason: StatAdjustment["reason"]) => {
    const current = byId.get(playerId)!;
    const fromValue = field === "goals" ? current.goals : field === "own_goals" ? current.ownGoals : current.assists;
    if (fromValue === newValue) return;
    if (field === "goals") current.goals = newValue;
    else if (field === "own_goals") current.ownGoals = newValue;
    else current.assists = newValue;
    adjustments.push({ playerId, field, from: fromValue, to: newValue, reason });
  };

  // --- goals + opponent own goals === official score, per side -------------------------------
  for (const side of [1, 2] as Side[]) {
    const otherSide: Side = side === 1 ? 2 : 1;
    const officialScore = side === 1 ? score.team1Goals : score.team2Goals;

    const goalClaims: Claim[] = playersOfSide(side)
      .filter((p) => p.goals > 0)
      .map((p) => ({ playerId: p.playerId, field: "goals" as const, value: p.goals, support: p.nReports }));
    const ownGoalClaims: Claim[] = playersOfSide(otherSide)
      .filter((p) => p.ownGoals > 0)
      .map((p) => ({ playerId: p.playerId, field: "own_goals" as const, value: p.ownGoals, support: p.nReports }));

    const claimedTotal = goalClaims.reduce((a, c) => a + c.value, 0) + ownGoalClaims.reduce((a, c) => a + c.value, 0);

    // Under-attribution is fine: the agreed score is authoritative and the missing goals simply stay
    // unattributed (an admin can assign them after finalization). Only over-claims are a conflict.
    if (claimedTotal > officialScore) {
      const { adjustments: dropped, remaining } = dropExcess([...goalClaims, ...ownGoalClaims], claimedTotal - officialScore);
      for (const [key, value] of dropped) {
        const [playerId, field] = key.split(":") as [string, "goals" | "own_goals"];
        applyAdjustment(playerId, field, value, "GOALS_INCONSISTENT");
      }
      if (remaining > 1e-9) {
        reasons.push({ code: "GOALS_INCONSISTENT", side, claimedTotal: officialScore + remaining, officialScore });
      }
    }
  }

  // --- assists <= goals, per side ---------------------------------------------------------------
  // The cap is the side's official score minus the opponent's own goals (an own goal has no
  // assist). It isn't the attributed goals total, since goals may be left unattributed.
  for (const side of [1, 2] as Side[]) {
    const otherSide: Side = side === 1 ? 2 : 1;
    const sidePlayers = playersOfSide(side);
    const opponentOwnGoals = playersOfSide(otherSide).reduce((a, p) => a + p.ownGoals, 0);
    const officialScore = side === 1 ? score.team1Goals : score.team2Goals;
    const goalsTotal = Math.max(0, officialScore - opponentOwnGoals);
    const assistClaims: Claim[] = sidePlayers
      .filter((p) => p.assists > 0)
      .map((p) => ({ playerId: p.playerId, field: "assists" as const, value: p.assists, support: p.nReports }));
    const assistsTotal = assistClaims.reduce((a, c) => a + c.value, 0);

    if (assistsTotal > goalsTotal) {
      const { adjustments: dropped, remaining } = dropExcess(assistClaims, assistsTotal - goalsTotal);
      for (const [key, value] of dropped) {
        const [playerId, field] = key.split(":") as [string, "assists"];
        applyAdjustment(playerId, field, value, "ASSISTS_EXCEED_GOALS");
      }
      if (remaining > 1e-9) {
        reasons.push({ code: "ASSISTS_EXCEED_GOALS", side, assistsTotal: goalsTotal + remaining, goalsTotal });
      }
    }
  }

  return { stats: stats.map((s) => byId.get(s.playerId)!), adjustments, reasons };
}
