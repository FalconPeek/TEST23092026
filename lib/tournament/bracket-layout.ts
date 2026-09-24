// Pure presentation layer over `tournament_matches` rows: turns them into display-ready bracket
// columns (round labels, resolved entry names, bye/tbd/qualifier placeholders, the champion).
// No I/O; unlike lib/brackets (the engine, which never resolves to UI strings), this module's
// whole job is producing final Spanish copy from messages/es.ts, the same way
// lib/notifications/templates.ts and lib/cards/og-card-data.ts do.
import { BYE, type Bracket, type DecidedBy, type Match, type MatchStatus } from "@/lib/brackets";
import { es } from "@/messages/es";

export type BracketMatchInput = Pick<
  Match,
  | "id"
  | "bracket"
  | "round"
  | "number"
  | "entry1Id"
  | "entry2Id"
  | "entry1From"
  | "entry2From"
  | "status"
  | "winnerEntryId"
  | "score1"
  | "score2"
  | "pens1"
  | "pens2"
  | "decidedBy"
> & {
  /** The linked real `matches.id`, once `startTournamentMatch` has run; null otherwise. */
  matchId: string | null;
};

export interface BracketEntryInfo {
  id: string;
  name: string;
}

export type BracketSlotKind = "entry" | "bye" | "tbd" | "qualifier";

export interface BracketSlotDisplay {
  kind: BracketSlotKind;
  entryId: string | null;
  label: string;
  isWinner: boolean;
}

export interface BracketMatchDisplay {
  id: string;
  round: number;
  number: number;
  roundLabel: string;
  slot1: BracketSlotDisplay;
  slot2: BracketSlotDisplay;
  score1: number | null;
  score2: number | null;
  pens1: number | null;
  pens2: number | null;
  status: MatchStatus;
  decidedBy: DecidedBy | null;
  matchId: string | null;
}

export interface BracketRound {
  round: number;
  label: string;
  matches: BracketMatchDisplay[];
}

export interface BracketSection {
  bracket: Bracket;
  label: string;
  rounds: BracketRound[];
}

export interface BracketLayout {
  sections: BracketSection[];
  championEntryId: string | null;
}

const SECTION_LABEL: Record<"winners" | "losers" | "final" | "third", string> = {
  winners: es.bracket.winners,
  losers: es.bracket.losers,
  final: es.bracket.final,
  third: es.bracket.third,
};

function resolveSlot(
  slot: Match["entry1Id"],
  from: Match["entry1From"],
  winnerEntryId: string | null,
  entryById: Map<string, BracketEntryInfo>,
): BracketSlotDisplay {
  if (slot === BYE) {
    return { kind: "bye", entryId: null, label: es.bracket.bye, isWinner: false };
  }
  if (slot === null) {
    if (from) {
      return { kind: "qualifier", entryId: null, label: es.bracket.fromGroup(from.fromGroup, from.rank), isWinner: false };
    }
    return { kind: "tbd", entryId: null, label: es.bracket.tbd, isWinner: false };
  }
  const entry = entryById.get(slot);
  return {
    kind: "entry",
    entryId: slot,
    label: entry?.name ?? es.bracket.tbd,
    isWinner: winnerEntryId !== null && winnerEntryId === slot,
  };
}

function toDisplay(m: BracketMatchInput, roundLabel: string, entryById: Map<string, BracketEntryInfo>): BracketMatchDisplay {
  return {
    id: m.id,
    round: m.round,
    number: m.number,
    roundLabel,
    slot1: resolveSlot(m.entry1Id, m.entry1From, m.winnerEntryId, entryById),
    slot2: resolveSlot(m.entry2Id, m.entry2From, m.winnerEntryId, entryById),
    score1: m.score1,
    score2: m.score2,
    pens1: m.pens1,
    pens2: m.pens2,
    status: m.status,
    decidedBy: m.decidedBy,
    matchId: m.matchId,
  };
}

function byRoundThenNumber(a: BracketMatchInput, b: BracketMatchInput): number {
  return a.round - b.round || a.number - b.number;
}

function groupByRound(matches: BracketMatchInput[]): Map<number, BracketMatchInput[]> {
  const byRound = new Map<number, BracketMatchInput[]>();
  for (const m of [...matches].sort(byRoundThenNumber)) {
    const list = byRound.get(m.round) ?? [];
    list.push(m);
    byRound.set(m.round, list);
  }
  return byRound;
}

/**
 * The champion is only decided once every `final`-bracket match is resolved. Single_elim /
 * groups_ko have exactly one: its `winnerEntryId` once `completed`. Double_elim can have two
 * (GF1, GF2 the reset): if GF2 exists and is still pending (`locked`/`waiting`/`ready`/
 * `in_progress`), the losers-bracket team won GF1 but the reset hasn't been played yet, so
 * there's no champion regardless of GF1's own result -- only once GF2 is `completed` (LB path
 * won the reset) or `archived` (the winners-bracket team won GF1 outright, so no reset was
 * needed and GF1 stands) does a winner exist.
 */
function resolveChampion(finalMatches: BracketMatchInput[]): string | null {
  const sorted = [...finalMatches].sort((a, b) => a.round - b.round);
  const last = sorted[sorted.length - 1];
  if (!last) return null;
  if (last.status === "completed") return last.winnerEntryId;
  if (last.status === "archived") {
    const previous = sorted[sorted.length - 2];
    return previous?.status === "completed" ? previous.winnerEntryId : null;
  }
  return null;
}

/**
 * Builds the display layout for a tournament's elimination bracket(s) (single_elim,
 * double_elim, or a groups_ko's KO stage -- `matches` should already be filtered to exclude
 * `group`/`swiss`-bracket rows, which the standings table handles instead). Entry display,
 * round labels and the champion are all resolved here so no UI component ever computes a
 * winner or a round name itself.
 */
export function buildBracketLayout(matches: BracketMatchInput[], entries: BracketEntryInfo[]): BracketLayout {
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const relevant = matches.filter((m) => m.bracket !== "group" && m.bracket !== "swiss");

  const winners = relevant.filter((m) => m.bracket === "winners");
  const losers = relevant.filter((m) => m.bracket === "losers");
  const final = relevant.filter((m) => m.bracket === "final");
  const third = relevant.filter((m) => m.bracket === "third");

  const winnersRounds = winners.map((m) => m.round);
  const finalRounds = final.map((m) => m.round);
  const winnersMax = winnersRounds.length > 0 ? Math.max(...winnersRounds) : 0;
  const finalMin = finalRounds.length > 0 ? Math.min(...finalRounds) : null;
  // single_elim / groups_ko relabel the ladder's very last round as `final`, continuing the
  // `winners` bracket's own numbering (final's round = winnersMax + 1); double_elim's grand
  // final restarts its own numbering at 1, independent of the winners bracket's round count.
  // Only the contiguous case folds into one continuous ladder for round-label purposes.
  const finalContinuesWinners = finalMin !== null && finalMin === winnersMax + 1;
  const winnersTotal = finalContinuesWinners ? Math.max(winnersMax, ...finalRounds) : winnersMax;

  const sections: BracketSection[] = [];

  if (winners.length > 0) {
    const rounds: BracketRound[] = [...groupByRound(winners).entries()].map(([round, ms]) => {
      const label = es.bracket.round(round, winnersTotal);
      return { round, label, matches: ms.map((m) => toDisplay(m, label, entryById)) };
    });
    sections.push({ bracket: "winners", label: SECTION_LABEL.winners, rounds });
  }

  if (losers.length > 0) {
    const losersTotal = Math.max(...losers.map((m) => m.round));
    const rounds: BracketRound[] = [...groupByRound(losers).entries()].map(([round, ms]) => {
      const label = es.bracket.round(round, losersTotal);
      return { round, label, matches: ms.map((m) => toDisplay(m, label, entryById)) };
    });
    sections.push({ bracket: "losers", label: SECTION_LABEL.losers, rounds });
  }

  if (final.length > 0) {
    const rounds: BracketRound[] = [...groupByRound(final).entries()].map(([round, ms]) => {
      const label = finalContinuesWinners ? es.bracket.final : round === 1 ? es.bracket.grandFinal : es.bracket.reset;
      return { round, label, matches: ms.map((m) => toDisplay(m, label, entryById)) };
    });
    sections.push({ bracket: "final", label: SECTION_LABEL.final, rounds });
  }

  if (third.length > 0) {
    const rounds: BracketRound[] = [...groupByRound(third).entries()].map(([round, ms]) => ({
      round,
      label: es.bracket.third,
      matches: ms.map((m) => toDisplay(m, es.bracket.third, entryById)),
    }));
    sections.push({ bracket: "third", label: SECTION_LABEL.third, rounds });
  }

  const championEntryId = resolveChampion(final);

  return { sections, championEntryId };
}
