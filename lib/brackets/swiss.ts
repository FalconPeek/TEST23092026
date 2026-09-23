import { newMatch } from "./propagation";
import { standings } from "./standings";
import { sortMatches } from "./util";
import { BracketError, InvalidMatchStateError } from "./errors";
import type { Rng } from "./rng";
import type { TournamentSettings } from "@/lib/settings/tournament";
import { BYE, type Entry, type Group, type Match, type Stage, type TournamentState } from "./types";

export function defaultSwissRounds(n: number): number {
  if (n <= 1) return 0;
  return Math.ceil(Math.log2(n));
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function collectPlayedPairs(matches: Match[]): Set<string> {
  const set = new Set<string>();
  for (const m of matches) {
    if (typeof m.entry1Id === "string" && m.entry1Id !== BYE && typeof m.entry2Id === "string" && m.entry2Id !== BYE) {
      set.add(pairKey(m.entry1Id, m.entry2Id));
    }
  }
  return set;
}

/**
 * Backtracking pairing: always pair the current top of the pool, preferring
 * the partner nearest the "opposite half" of the *remaining* pool (Dutch
 * system top-half-vs-bottom-half), falling back outward and backtracking on
 * dead ends to guarantee a rematch-free pairing whenever one exists.
 */
function pairPool(pool: string[], played: Set<string>): Array<[string, string]> | null {
  if (pool.length === 0) return [];
  const [first, ...rest] = pool;
  const half = Math.floor(rest.length / 2);
  const order = [...rest.keys()].sort((a, b) => Math.abs(a - half) - Math.abs(b - half));
  for (const idx of order) {
    const opponent = rest[idx];
    if (played.has(pairKey(first, opponent))) continue;
    const remaining = rest.filter((_, i) => i !== idx);
    const result = pairPool(remaining, played);
    if (result) return [[first, opponent], ...result];
  }
  return null;
}

function pickBye(rankedDesc: string[], hadBye: Set<string>): string | null {
  if (rankedDesc.length % 2 === 0) return null;
  for (let i = rankedDesc.length - 1; i >= 0; i--) {
    if (!hadBye.has(rankedDesc[i])) return rankedDesc[i];
  }
  return rankedDesc[rankedDesc.length - 1]; // everyone has had one already; fall back
}

function buildRoundMatches(
  stageId: string,
  round: number,
  pairs: Array<[string, string]>,
  byeEntry: string | null,
): Match[] {
  const matches: Match[] = [];
  let number = 0;
  for (const [a, b] of pairs) {
    number += 1;
    matches.push(
      newMatch({
        id: `s1-sw-r${round}-m${number}`,
        stageId,
        bracket: "swiss",
        round,
        number,
        entry1Id: a,
        entry2Id: b,
      }),
    );
  }
  if (byeEntry) {
    number += 1;
    const m = newMatch({
      id: `s1-sw-r${round}-m${number}`,
      stageId,
      bracket: "swiss",
      round,
      number,
      entry1Id: byeEntry,
      entry2Id: BYE,
    });
    m.status = "completed";
    m.decidedBy = "bye";
    m.winnerEntryId = byeEntry;
    matches.push(m);
  }
  return matches;
}

export function generateSwiss(entries: Entry[], settings: TournamentSettings): TournamentState {
  const stage: Stage = { id: "s1", kind: "swiss", order: 1 };
  const seedOrder = [...entries].sort((a, b) => a.seed - b.seed).map((e) => e.id);
  const byeEntry = pickBye(seedOrder, new Set());
  const pool = byeEntry ? seedOrder.filter((id) => id !== byeEntry) : seedOrder;
  const half = pool.length / 2;
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < half; i++) pairs.push([pool[i], pool[i + half]]);

  const matches = buildRoundMatches(stage.id, 1, pairs, byeEntry).sort(sortMatches);
  const groups: Group[] = [];
  return {
    format: "swiss",
    settings,
    entries,
    stages: [stage],
    groups,
    matches,
    swissRoundsGenerated: 1,
  };
}

/** Generates the next swiss round; throws if the current round isn't complete or the event is over. */
export function nextSwissRound(state: TournamentState, rng: Rng): TournamentState {
  if (state.format !== "swiss") throw new BracketError("nextSwissRound is only valid for swiss tournaments");
  const stage = state.stages[0];
  const currentRound = state.swissRoundsGenerated ?? 0;
  const totalRounds = state.settings.swiss.rounds ?? defaultSwissRounds(state.entries.length);
  if (currentRound >= totalRounds) {
    throw new BracketError("swiss tournament already has all its rounds generated");
  }
  const swissMatches = state.matches.filter((m) => m.stageId === stage.id);
  const lastRoundMatches = swissMatches.filter((m) => m.round === currentRound);
  if (!lastRoundMatches.every((m) => m.status === "completed")) {
    throw new InvalidMatchStateError(`round ${currentRound} is not complete yet`);
  }

  const table = standings(swissMatches, state.settings, rng, state.settings.swiss.tiebreakers);
  const rankedDesc = table.map((r) => r.entryId); // best to worst

  const hadBye = new Set(
    swissMatches.filter((m) => m.decidedBy === "bye" && m.entry2Id === BYE).map((m) => m.entry1Id as string),
  );
  const byeEntry = pickBye(rankedDesc, hadBye);
  const pool = byeEntry ? rankedDesc.filter((id) => id !== byeEntry) : rankedDesc;
  const played = collectPlayedPairs(swissMatches);
  const pairs = pairPool(pool, played);
  if (!pairs) {
    throw new BracketError(`could not find a rematch-free pairing for swiss round ${currentRound + 1}`);
  }

  const round = currentRound + 1;
  const newMatches = buildRoundMatches(stage.id, round, pairs, byeEntry);
  const matches = [...state.matches, ...newMatches].sort(sortMatches);
  return { ...state, matches, swissRoundsGenerated: round };
}
