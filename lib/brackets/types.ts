import type { TournamentFormat, TournamentSettings } from "@/lib/settings/tournament";

/** A competitor in the tournament: a team entry or an individual, seeded 1 = best. */
export interface Entry {
  id: string;
  name: string;
  seed: number;
}

export const BYE = "__bye__" as const;
export type ByeMarker = typeof BYE;

/**
 * A match slot is either a resolved entry id, the BYE marker (the slot is
 * permanently empty), or null (still waiting on an earlier match / group
 * stage to resolve it).
 */
export type EntrySlot = string | ByeMarker | null;

export const brackets = ["winners", "losers", "final", "third", "group", "swiss"] as const;
export type Bracket = (typeof brackets)[number];

/**
 * locked   = neither slot resolved yet.
 * waiting  = one slot resolved, the other still pending an earlier match.
 * ready    = both slots resolved (real entries), playable, no result yet.
 * in_progress = set by the app layer once the real-world match starts; the
 *               engine accepts it as a valid pre-result state but never sets
 *               it itself.
 * completed = result recorded.
 * archived  = will never be played (e.g. an unneeded grand-final reset).
 */
export const matchStatuses = ["locked", "waiting", "ready", "in_progress", "completed", "archived"] as const;
export type MatchStatus = (typeof matchStatuses)[number];

export const decidedByValues = ["regular", "pens", "walkover", "bye", "manual"] as const;
export type DecidedBy = (typeof decidedByValues)[number];

/** Where a group-stage qualifier will slot into the knockout stage, before groups finish. */
export interface QualifierRef {
  fromGroup: string;
  rank: number;
}

export interface Match {
  id: string;
  stageId: string;
  groupId: string | null;
  bracket: Bracket;
  /** 1-based, scoped to (stageId, bracket) — e.g. losers round numbering restarts at 1. */
  round: number;
  /** 1-based, scoped to (stageId, bracket, round), stable ordering within a round. */
  number: number;
  entry1Id: EntrySlot;
  entry2Id: EntrySlot;
  /** Present on knockout matches generated ahead of a group stage resolving. */
  entry1From: QualifierRef | null;
  entry2From: QualifierRef | null;
  status: MatchStatus;
  winnerEntryId: string | null;
  loserEntryId: string | null;
  score1: number | null;
  score2: number | null;
  pens1: number | null;
  pens2: number | null;
  decidedBy: DecidedBy | null;
  nextMatchId: string | null;
  nextSlot: 1 | 2 | null;
  nextLoserMatchId: string | null;
  nextLoserSlot: 1 | 2 | null;
}

export type StageKind = "league" | "single_elim" | "double_elim" | "group" | "knockout" | "swiss";

export interface Stage {
  id: string;
  kind: StageKind;
  order: number;
}

export interface Group {
  id: string;
  stageId: string;
  number: number;
  label: string;
}

export interface TournamentState {
  format: TournamentFormat;
  settings: TournamentSettings;
  entries: Entry[];
  stages: Stage[];
  groups: Group[];
  matches: Match[];
  /** Swiss only: rounds already generated (round-at-a-time pairing). */
  swissRoundsGenerated?: number;
}

export interface MatchResultInput {
  score1: number;
  score2: number;
  pens1?: number;
  pens2?: number;
  decidedBy?: DecidedBy;
  /** Required for decidedBy 'manual' or 'walkover' when scores are tied. */
  winnerEntryId?: string;
}

export interface StandingsRow {
  entryId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  buchholz: number;
  sonnebornBerger: number;
  /** Filled only when 'lots' tiebreaker was needed to separate a group. */
  lot: number | null;
  rank: number;
}
