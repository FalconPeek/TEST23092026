import { BYE, type EntrySlot, type Match } from "./types";

export type MatchMap = Map<string, Match>;

export function toMatchMap(matches: Match[]): MatchMap {
  return new Map(matches.map((m) => [m.id, m]));
}

export function newMatch(base: {
  id: string;
  stageId: string;
  groupId?: string | null;
  bracket: Match["bracket"];
  round: number;
  number: number;
  entry1Id?: EntrySlot;
  entry2Id?: EntrySlot;
  entry1From?: Match["entry1From"];
  entry2From?: Match["entry2From"];
  nextMatchId?: string | null;
  nextSlot?: 1 | 2 | null;
  nextLoserMatchId?: string | null;
  nextLoserSlot?: 1 | 2 | null;
}): Match {
  const entry1Id = base.entry1Id ?? null;
  const entry2Id = base.entry2Id ?? null;
  return {
    id: base.id,
    stageId: base.stageId,
    groupId: base.groupId ?? null,
    bracket: base.bracket,
    round: base.round,
    number: base.number,
    entry1Id,
    entry2Id,
    entry1From: base.entry1From ?? null,
    entry2From: base.entry2From ?? null,
    status: deriveWaitingStatus(entry1Id, entry2Id),
    winnerEntryId: null,
    loserEntryId: null,
    score1: null,
    score2: null,
    pens1: null,
    pens2: null,
    decidedBy: null,
    nextMatchId: base.nextMatchId ?? null,
    nextSlot: base.nextSlot ?? null,
    nextLoserMatchId: base.nextLoserMatchId ?? null,
    nextLoserSlot: base.nextLoserSlot ?? null,
  };
}

function deriveWaitingStatus(a: EntrySlot, b: EntrySlot): "locked" | "waiting" | "ready" {
  const resolvedA = a !== null;
  const resolvedB = b !== null;
  if (resolvedA && resolvedB) return "ready";
  if (resolvedA || resolvedB) return "waiting";
  return "locked";
}

/**
 * Sets one slot of a match and, if the match isn't decided by a human result,
 * auto-resolves BYEs and cascades the outcome forward (winners bracket and,
 * for double elim, the losers bracket too — including BYE-vs-BYE chains).
 */
export function setSlot(matches: MatchMap, matchId: string | null, slot: 1 | 2 | null, value: EntrySlot): void {
  if (matchId === null || slot === null) return;
  const match = matches.get(matchId);
  if (!match) return;
  if (slot === 1) match.entry1Id = value;
  else match.entry2Id = value;

  if (match.status === "completed" || match.status === "archived") return;
  match.status = deriveWaitingStatus(match.entry1Id, match.entry2Id);
  if (match.status === "ready") tryAutoResolveBye(matches, matchId);
}

/** Resolves a match automatically when at least one side is a permanent BYE. */
export function tryAutoResolveBye(matches: MatchMap, matchId: string): void {
  const match = matches.get(matchId);
  if (!match || match.status !== "ready") return;
  const a = match.entry1Id;
  const b = match.entry2Id;
  const aIsBye = a === BYE;
  const bIsBye = b === BYE;
  if (!aIsBye && !bIsBye) return; // both real: needs a human result

  match.status = "completed";
  match.decidedBy = "bye";
  match.score1 = null;
  match.score2 = null;
  match.pens1 = null;
  match.pens2 = null;

  if (aIsBye && bIsBye) {
    // Double bye: nobody to advance; cascade BYE onward in both directions.
    match.winnerEntryId = null;
    match.loserEntryId = null;
    propagateResult(matches, match, BYE, BYE);
    return;
  }
  const winner = aIsBye ? b : a;
  const winnerId = winner === BYE ? null : winner;
  match.winnerEntryId = winnerId;
  match.loserEntryId = null;
  // The bye side produced no real loser; a BYE flows into the loser destination.
  propagateResult(matches, match, winner, BYE);
}

/** Pushes a match's winner/loser into whatever it feeds, recursing through further byes. */
export function propagateResult(matches: MatchMap, match: Match, winner: EntrySlot, loser: EntrySlot): void {
  setSlot(matches, match.nextMatchId, match.nextSlot, winner);
  setSlot(matches, match.nextLoserMatchId, match.nextLoserSlot, loser);
}
