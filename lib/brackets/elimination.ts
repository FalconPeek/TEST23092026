import { newMatch, toMatchMap, tryAutoResolveBye, type MatchMap } from "./propagation";
import { buildBracketSlots, nextPow2 } from "./seeding";
import type { Bracket, Entry, EntrySlot, Match } from "./types";

/**
 * Builds a single-elimination bracket skeleton (byes auto-resolved and
 * cascaded) shared by `single_elim` and the winners bracket of `double_elim`.
 * Round numbering is 1-based within `bracket`; match numbering is 1-based
 * within a round, left-to-right by initial seed position.
 */
export function buildEliminationBracket(
  entries: Entry[],
  opts: { stageId: string; bracket: Bracket; idPrefix: string; lastRoundBracket?: Bracket },
): { matches: MatchMap; roundMatches: Match[][] } {
  const slots = buildBracketSlots(entries);
  const pow2 = slots.length;
  const rounds = Math.log2(pow2);
  const matches: MatchMap = new Map();
  const roundMatches: Match[][] = [];

  // Round 1: entries known up front from seeding.
  const round1: Match[] = [];
  for (let i = 0; i < pow2 / 2; i++) {
    const m = newMatch({
      id: `${opts.idPrefix}-r1-m${i + 1}`,
      stageId: opts.stageId,
      bracket: rounds === 1 ? (opts.lastRoundBracket ?? opts.bracket) : opts.bracket,
      round: 1,
      number: i + 1,
      entry1Id: slots[2 * i],
      entry2Id: slots[2 * i + 1],
    });
    matches.set(m.id, m);
    round1.push(m);
  }
  roundMatches.push(round1);

  // Later rounds: entries resolved later via propagation.
  for (let r = 2; r <= rounds; r++) {
    const count = pow2 / 2 ** r;
    const bracket = r === rounds ? (opts.lastRoundBracket ?? opts.bracket) : opts.bracket;
    const round: Match[] = [];
    for (let i = 0; i < count; i++) {
      const m = newMatch({
        id: `${opts.idPrefix}-r${r}-m${i + 1}`,
        stageId: opts.stageId,
        bracket,
        round: r,
        number: i + 1,
      });
      matches.set(m.id, m);
      round.push(m);
    }
    // Link previous round into this one.
    const prev = roundMatches[r - 2];
    for (let i = 0; i < prev.length; i++) {
      prev[i].nextMatchId = round[Math.floor(i / 2)].id;
      prev[i].nextSlot = ((i % 2) + 1) as 1 | 2;
    }
    roundMatches.push(round);
  }

  // Propagate round-1 byes forward (may cascade through several rounds).
  for (const m of round1) {
    tryAutoResolveBye(matches, m.id);
  }

  return { matches, roundMatches };
}

/** Convenience: entry currently occupying a slot, or null while still unresolved. */
export function slotValue(v: EntrySlot): string | null {
  return v === null || v === "__bye__" ? null : v;
}

export { nextPow2, toMatchMap };
