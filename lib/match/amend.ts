// Pure helpers for amending a finalized match's stats (lib/actions/matches.ts's amendMatchStats):
// how many goals are still unattributed, whether an edited set of rows would exceed the official
// score (the same two caps amend_match_stats enforces in SQL), and diffing edited rows against
// their prefilled values so only changed fields are ever sent. No I/O.

export interface AmendScore {
  team1Goals: number;
  team2Goals: number;
}

export interface AmendStatRow {
  playerId: string;
  side: 1 | 2;
  goals: number;
  assists: number;
  ownGoals: number;
  saves: number;
}

export interface UnattributedGoals {
  side1: number;
  side2: number;
}

function sumBySide(stats: AmendStatRow[], side: 1 | 2, field: "goals" | "assists" | "ownGoals"): number {
  return stats.filter((s) => s.side === side).reduce((acc, s) => acc + s[field], 0);
}

/** Per side: official score minus that side's attributed goals minus the opponent's own goals
 * (own goals count toward the scoring side), never negative. */
export function unattributedGoals(score: AmendScore, stats: AmendStatRow[]): UnattributedGoals {
  return {
    side1: Math.max(0, score.team1Goals - sumBySide(stats, 1, "goals") - sumBySide(stats, 2, "ownGoals")),
    side2: Math.max(0, score.team2Goals - sumBySide(stats, 2, "goals") - sumBySide(stats, 1, "ownGoals")),
  };
}

export interface AmendValidationErrors {
  side1: boolean;
  side2: boolean;
}

/** Mirrors amend_match_stats' two per-side caps: goals(side) + own_goals(opponent) <= score(side),
 * and assists(side) <= score(side) - own_goals(opponent). */
export function validateAmendment(score: AmendScore, stats: AmendStatRow[]): AmendValidationErrors {
  function overCap(side: 1 | 2, official: number): boolean {
    const opponent = side === 1 ? 2 : 1;
    const opponentOwnGoals = sumBySide(stats, opponent, "ownGoals");
    const goalsOver = sumBySide(stats, side, "goals") + opponentOwnGoals > official;
    const assistsOver = sumBySide(stats, side, "assists") > official - opponentOwnGoals;
    return goalsOver || assistsOver;
  }

  return {
    side1: overCap(1, score.team1Goals),
    side2: overCap(2, score.team2Goals),
  };
}

export interface AmendPayloadRow {
  subjectPlayerId: string;
  goals?: number;
  assists?: number;
  ownGoals?: number;
  saves?: number;
}

/** Only rows with at least one changed field, and only the changed keys within them -- matches
 * amend_match_stats' "only the keys present are changed" contract. */
export function changedRows(initial: AmendStatRow[], edited: AmendStatRow[]): AmendPayloadRow[] {
  const initialByPlayer = new Map(initial.map((r) => [r.playerId, r]));
  const rows: AmendPayloadRow[] = [];

  for (const e of edited) {
    const before = initialByPlayer.get(e.playerId);
    if (!before) continue;

    const row: AmendPayloadRow = { subjectPlayerId: e.playerId };
    let changed = false;
    if (e.goals !== before.goals) {
      row.goals = e.goals;
      changed = true;
    }
    if (e.assists !== before.assists) {
      row.assists = e.assists;
      changed = true;
    }
    if (e.ownGoals !== before.ownGoals) {
      row.ownGoals = e.ownGoals;
      changed = true;
    }
    if (e.saves !== before.saves) {
      row.saves = e.saves;
      changed = true;
    }
    if (changed) rows.push(row);
  }

  return rows;
}
