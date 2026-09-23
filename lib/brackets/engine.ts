import { generateDoubleElim } from "./double-elim";
import { generateGroupsKo, resolveGroupQualifiers } from "./groups-ko";
import { generateLeague } from "./league";
import { setSlot, toMatchMap } from "./propagation";
import { shuffle, type Rng } from "./rng";
import { generateSingleElim } from "./single-elim";
import { nextSwissRound as nextSwissRoundImpl, generateSwiss } from "./swiss";
import { sortMatches } from "./util";
import {
  InvalidMatchStateError,
  InvalidResultError,
  KoDrawRequiresDecisionError,
  MatchNotEditableError,
  MatchNotFoundError,
} from "./errors";
import { BYE, type DecidedBy, type Entry, type Match, type MatchResultInput, type TournamentState } from "./types";
import type { TournamentFormat, TournamentSettings } from "@/lib/settings/tournament";

const koBrackets = new Set<Match["bracket"]>(["winners", "losers", "final", "third"]);

function isKoMatch(m: Match): boolean {
  return koBrackets.has(m.bracket);
}

function applySeedingMode(entries: Entry[], settings: TournamentSettings, rng: Rng): Entry[] {
  if (settings.seeding !== "random") return entries;
  return shuffle(entries, rng).map((e, i) => ({ ...e, seed: i + 1 }));
}

/** Pure dispatch: builds the initial stages/groups/matches for a format. */
export function generate(
  format: TournamentFormat,
  entries: Entry[],
  settings: TournamentSettings,
  rng: Rng,
): TournamentState {
  const seeded = applySeedingMode(entries, settings, rng);
  switch (format) {
    case "single_elim":
      return generateSingleElim(seeded, settings);
    case "double_elim":
      return generateDoubleElim(seeded, settings);
    case "league":
      return generateLeague(seeded, settings);
    case "groups_ko":
      return generateGroupsKo(seeded, settings);
    case "swiss":
      return generateSwiss(seeded, settings);
  }
}

function assertNonNegativeInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidResultError(`${label} must be a non-negative integer, got ${value}`);
  }
}

interface Resolved {
  winnerId: string | null;
  loserId: string | null;
  decidedBy: DecidedBy;
}

function resolveWinner(matchId: string, e1: string, e2: string, isKo: boolean, result: MatchResultInput): Resolved {
  assertNonNegativeInt(result.score1, "score1");
  assertNonNegativeInt(result.score2, "score2");
  const tied = result.score1 === result.score2;

  if (!tied) {
    const winnerId = result.score1 > result.score2 ? e1 : e2;
    return { winnerId, loserId: winnerId === e1 ? e2 : e1, decidedBy: result.decidedBy ?? "regular" };
  }

  if (!isKo) {
    return { winnerId: null, loserId: null, decidedBy: result.decidedBy ?? "regular" };
  }

  if (result.decidedBy === "manual" || result.decidedBy === "walkover") {
    if (result.winnerEntryId !== e1 && result.winnerEntryId !== e2) {
      throw new InvalidResultError(
        `decidedBy '${result.decidedBy}' on a tied knockout match requires winnerEntryId to be one of the two entries`,
      );
    }
    const winnerId = result.winnerEntryId;
    return { winnerId, loserId: winnerId === e1 ? e2 : e1, decidedBy: result.decidedBy };
  }

  if (result.pens1 !== undefined && result.pens2 !== undefined) {
    assertNonNegativeInt(result.pens1, "pens1");
    assertNonNegativeInt(result.pens2, "pens2");
    if (result.pens1 === result.pens2) {
      throw new InvalidResultError("pens1 and pens2 cannot be equal; a penalty shootout must have a winner");
    }
    const winnerId = result.pens1 > result.pens2 ? e1 : e2;
    return { winnerId, loserId: winnerId === e1 ? e2 : e1, decidedBy: "pens" };
  }

  throw new KoDrawRequiresDecisionError(matchId);
}

/** Applies a human-entered result to a `ready`/`in_progress` match and propagates advancement. */
export function applyResult(state: TournamentState, matchId: string, result: MatchResultInput): TournamentState {
  const original = state.matches.find((m) => m.id === matchId);
  if (!original) throw new MatchNotFoundError(matchId);
  if (original.status === "completed" || original.status === "archived") {
    throw new InvalidMatchStateError(`Match ${matchId} is ${original.status}; use editResult to change its result`);
  }
  if (original.status === "locked" || original.status === "waiting") {
    throw new InvalidMatchStateError(`Match ${matchId} isn't ready: both entries must be resolved first`);
  }
  const e1 = original.entry1Id;
  const e2 = original.entry2Id;
  if (typeof e1 !== "string" || e1 === BYE || typeof e2 !== "string" || e2 === BYE) {
    throw new InvalidMatchStateError(`Match ${matchId} involves a BYE and resolves automatically`);
  }

  const { winnerId, loserId, decidedBy } = resolveWinner(matchId, e1, e2, isKoMatch(original), result);

  const matches = state.matches.map((m) => ({ ...m }));
  const map = toMatchMap(matches);
  const match = map.get(matchId) as Match;
  match.score1 = result.score1;
  match.score2 = result.score2;
  match.pens1 = result.pens1 ?? null;
  match.pens2 = result.pens2 ?? null;
  match.decidedBy = decidedBy;
  match.winnerEntryId = winnerId;
  match.loserEntryId = loserId;
  match.status = "completed";

  if (winnerId) setSlot(map, match.nextMatchId, match.nextSlot, winnerId);
  if (loserId) setSlot(map, match.nextLoserMatchId, match.nextLoserSlot, loserId);

  const next: TournamentState = { ...state, matches: [...map.values()].sort(sortMatches) };
  return handleGrandFinalTransition(next, match);
}

/**
 * Double-elim only: when GF1 (bracket 'final', round 1) completes, either
 * activate the reset match (LB-path entrant — slot 2 by construction — won)
 * or archive it (WB-path entrant already champion).
 */
function handleGrandFinalTransition(state: TournamentState, completed: Match): TournamentState {
  if (state.format !== "double_elim" || completed.bracket !== "final" || completed.round !== 1) return state;
  const gf2 = state.matches.find(
    (m) => m.stageId === completed.stageId && m.bracket === "final" && m.round === 2,
  );
  if (!gf2) return state; // grand_final_reset disabled: GF1 is final regardless of who wins

  const lbPathWon = completed.winnerEntryId !== null && completed.winnerEntryId === completed.entry2Id;
  const matches = state.matches.map((m) => {
    if (m.id !== gf2.id) return m;
    if (lbPathWon) {
      return { ...m, entry1Id: completed.entry1Id, entry2Id: completed.entry2Id, status: "ready" as const };
    }
    return { ...m, status: "archived" as const };
  });
  return { ...state, matches: matches.sort(sortMatches) };
}

/** False if the match isn't completed, or any match it feeds (directly, or the GF reset) has started. */
export function canEditResult(state: TournamentState, matchId: string): boolean {
  const match = state.matches.find((m) => m.id === matchId);
  if (!match || match.status !== "completed") return false;

  const byId = new Map(state.matches.map((m) => [m.id, m]));
  const started = (id: string | null): boolean => {
    if (!id) return false;
    const m = byId.get(id);
    return m !== undefined && (m.status === "in_progress" || m.status === "completed");
  };
  if (started(match.nextMatchId) || started(match.nextLoserMatchId)) return false;

  if (state.format === "double_elim" && match.bracket === "final" && match.round === 1) {
    const gf2 = state.matches.find((m) => m.stageId === match.stageId && m.bracket === "final" && m.round === 2);
    if (gf2 && (gf2.status === "completed" || gf2.status === "in_progress")) return false;
  }
  return true;
}

/** Resets a completed match (and the single downstream slot it fed) and re-applies a new result. */
export function editResult(state: TournamentState, matchId: string, result: MatchResultInput): TournamentState {
  if (!canEditResult(state, matchId)) throw new MatchNotEditableError(matchId);
  const matches = state.matches.map((m) => ({ ...m }));
  const map = toMatchMap(matches);
  const target = map.get(matchId) as Match;

  target.score1 = null;
  target.score2 = null;
  target.pens1 = null;
  target.pens2 = null;
  target.decidedBy = null;
  target.winnerEntryId = null;
  target.loserEntryId = null;
  target.status = "ready";

  setSlot(map, target.nextMatchId, target.nextSlot, null);
  setSlot(map, target.nextLoserMatchId, target.nextLoserSlot, null);

  if (state.format === "double_elim" && target.bracket === "final" && target.round === 1) {
    const gf2 = [...map.values()].find(
      (m) => m.stageId === target.stageId && m.bracket === "final" && m.round === 2,
    );
    if (gf2) {
      gf2.entry1Id = null;
      gf2.entry2Id = null;
      gf2.status = "locked";
      gf2.score1 = null;
      gf2.score2 = null;
      gf2.pens1 = null;
      gf2.pens2 = null;
      gf2.decidedBy = null;
      gf2.winnerEntryId = null;
      gf2.loserEntryId = null;
    }
  }

  const resetState: TournamentState = { ...state, matches: [...map.values()].sort(sortMatches) };
  return applyResult(resetState, matchId, result);
}

export { resolveGroupQualifiers, nextSwissRoundImpl as nextSwissRound };
