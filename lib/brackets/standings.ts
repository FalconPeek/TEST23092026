import type { TournamentSettings, Tiebreaker } from "@/lib/settings/tournament";
import type { Rng } from "./rng";
import { BYE, type Match, type StandingsRow } from "./types";
import { BracketError } from "./errors";

interface BaseStats {
  entryId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

function emptyStats(entryId: string): BaseStats {
  return { entryId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
}

/** Only "played" matches feed standings: completed, non-bye, both sides real. */
function isCountable(m: Match): boolean {
  return (
    m.status === "completed" &&
    typeof m.entry1Id === "string" &&
    m.entry1Id !== BYE &&
    typeof m.entry2Id === "string" &&
    m.entry2Id !== BYE
  );
}

function applyMatch(stats: Map<string, BaseStats>, m: Match, settings: TournamentSettings): void {
  const e1 = m.entry1Id as string;
  const e2 = m.entry2Id as string;
  const s1 = stats.get(e1) ?? emptyStats(e1);
  const s2 = stats.get(e2) ?? emptyStats(e2);
  stats.set(e1, s1);
  stats.set(e2, s2);
  s1.played++;
  s2.played++;
  const g1 = m.score1 ?? 0;
  const g2 = m.score2 ?? 0;
  s1.goalsFor += g1;
  s1.goalsAgainst += g2;
  s2.goalsFor += g2;
  s2.goalsAgainst += g1;
  // Penalty shootouts settle a knockout draw but never count as goals.
  if (m.winnerEntryId === e1) {
    s1.wins++;
    s2.losses++;
    s1.points += settings.points.win;
    s2.points += settings.points.loss;
  } else if (m.winnerEntryId === e2) {
    s2.wins++;
    s1.losses++;
    s2.points += settings.points.win;
    s1.points += settings.points.loss;
  } else {
    s1.draws++;
    s2.draws++;
    s1.points += settings.points.draw;
    s2.points += settings.points.draw;
  }
}

function applyBye(stats: Map<string, BaseStats>, m: Match, settings: TournamentSettings): void {
  if (!settings.points.bye_counts_as_win) return;
  const winnerId = m.winnerEntryId;
  if (!winnerId) return; // double-bye: nobody to credit
  const s = stats.get(winnerId) ?? emptyStats(winnerId);
  stats.set(winnerId, s);
  s.played++;
  s.wins++;
  s.points += settings.points.win;
}

function collectEntryIds(matches: Match[]): string[] {
  const ids = new Set<string>();
  for (const m of matches) {
    if (typeof m.entry1Id === "string" && m.entry1Id !== BYE) ids.add(m.entry1Id);
    if (typeof m.entry2Id === "string" && m.entry2Id !== BYE) ids.add(m.entry2Id);
  }
  return [...ids];
}

function buchholz(entryId: string, matches: Match[], points: Map<string, number>): number {
  let sum = 0;
  for (const m of matches) {
    if (!isCountable(m)) continue;
    if (m.entry1Id === entryId) sum += points.get(m.entry2Id as string) ?? 0;
    else if (m.entry2Id === entryId) sum += points.get(m.entry1Id as string) ?? 0;
  }
  return sum;
}

function sonnebornBerger(entryId: string, matches: Match[], points: Map<string, number>): number {
  let sum = 0;
  for (const m of matches) {
    if (!isCountable(m)) continue;
    let opponent: string | null = null;
    let result: "win" | "loss" | "draw" | null = null;
    if (m.entry1Id === entryId) {
      opponent = m.entry2Id as string;
      result = m.winnerEntryId === entryId ? "win" : m.winnerEntryId === opponent ? "loss" : "draw";
    } else if (m.entry2Id === entryId) {
      opponent = m.entry1Id as string;
      result = m.winnerEntryId === entryId ? "win" : m.winnerEntryId === opponent ? "loss" : "draw";
    }
    if (!opponent || !result) continue;
    const opponentPoints = points.get(opponent) ?? 0;
    if (result === "win") sum += opponentPoints;
    else if (result === "draw") sum += opponentPoints / 2;
  }
  return sum;
}

function headToHeadPoints(entryId: string, subset: string[], matches: Match[], settings: TournamentSettings): number {
  const subsetSet = new Set(subset);
  let pts = 0;
  for (const m of matches) {
    if (!isCountable(m)) continue;
    const e1 = m.entry1Id as string;
    const e2 = m.entry2Id as string;
    if (!subsetSet.has(e1) || !subsetSet.has(e2)) continue;
    if (e1 !== entryId && e2 !== entryId) continue;
    const isE1 = e1 === entryId;
    if (m.winnerEntryId === entryId) pts += settings.points.win;
    else if (m.winnerEntryId === (isE1 ? e2 : e1)) pts += settings.points.loss;
    else pts += settings.points.draw;
  }
  return pts;
}

/**
 * Computes the standings table for `matches` (typically one stage or group).
 * `tiebreakers` defaults to settings.tiebreakers; swiss stages should pass
 * settings.swiss.tiebreakers explicitly. `rng` is required only if the
 * tiebreaker chain bottoms out at 'lots'.
 */
export function standings(
  matches: Match[],
  settings: TournamentSettings,
  rng?: Rng,
  tiebreakers: Tiebreaker[] = settings.tiebreakers,
): StandingsRow[] {
  const entryIds = collectEntryIds(matches);
  const base = new Map<string, BaseStats>();
  for (const id of entryIds) base.set(id, emptyStats(id));
  for (const m of matches) {
    if (m.decidedBy === "bye" && m.status === "completed") applyBye(base, m, settings);
    else if (isCountable(m)) applyMatch(base, m, settings);
  }

  const pointsMap = new Map<string, number>();
  for (const [id, s] of base) pointsMap.set(id, s.points);

  const derived = new Map<
    string,
    BaseStats & { goalDiff: number; buchholz: number; sonnebornBerger: number; lot: number | null }
  >();
  for (const [id, s] of base) {
    derived.set(id, {
      ...s,
      goalDiff: s.goalsFor - s.goalsAgainst,
      buchholz: buchholz(id, matches, pointsMap),
      sonnebornBerger: sonnebornBerger(id, matches, pointsMap),
      lot: null,
    });
  }

  const comparatorValue = (tb: Tiebreaker, id: string, group: string[]): number => {
    const d = derived.get(id);
    if (!d) return 0;
    switch (tb) {
      case "points":
        return d.points;
      case "goal_diff":
        return d.goalDiff;
      case "goals_for":
        return d.goalsFor;
      case "goals_against":
        return -d.goalsAgainst;
      case "wins":
        return d.wins;
      case "buchholz":
        return d.buchholz;
      case "sonneborn_berger":
        return d.sonnebornBerger;
      case "head_to_head":
        return headToHeadPoints(id, group, matches, settings);
      case "lots":
        throw new BracketError("lots handled separately");
    }
  };

  let groups: string[][] = [[...entryIds].sort()];
  for (const tb of tiebreakers) {
    const next: string[][] = [];
    for (const group of groups) {
      if (group.length <= 1) {
        next.push(group);
        continue;
      }
      if (tb === "lots") {
        if (!rng) throw new BracketError("standings: rng is required to break ties with 'lots'");
        const withLots = group.map((id) => ({ id, lot: rng() }));
        withLots.sort((a, b) => b.lot - a.lot);
        for (const { id, lot } of withLots) {
          const d = derived.get(id);
          if (d) d.lot = lot;
        }
        next.push(withLots.map((w) => w.id));
        continue;
      }
      const values = new Map(group.map((id) => [id, comparatorValue(tb, id, group)]));
      const sortedGroup = [...group].sort((a, b) => (values.get(b) as number) - (values.get(a) as number));
      let i = 0;
      while (i < sortedGroup.length) {
        let j = i + 1;
        while (j < sortedGroup.length && values.get(sortedGroup[j]) === values.get(sortedGroup[i])) j++;
        next.push(sortedGroup.slice(i, j));
        i = j;
      }
    }
    groups = next;
  }

  const ordered = groups.flat();
  return ordered.map((id, idx) => {
    const d = derived.get(id) as (typeof derived extends Map<string, infer V> ? V : never);
    return {
      entryId: id,
      played: d.played,
      wins: d.wins,
      draws: d.draws,
      losses: d.losses,
      goalsFor: d.goalsFor,
      goalsAgainst: d.goalsAgainst,
      goalDiff: d.goalDiff,
      points: d.points,
      buchholz: d.buchholz,
      sonnebornBerger: d.sonnebornBerger,
      lot: d.lot,
      rank: idx + 1,
    };
  });
}
