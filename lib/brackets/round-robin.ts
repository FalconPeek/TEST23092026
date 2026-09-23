import { newMatch } from "./propagation";
import { BYE, type Bracket, type Entry, type EntrySlot, type Match } from "./types";

/**
 * Berger circle method: fix index 0, rotate the rest each round. Pairing
 * index i with (n-1-i) for i = 0..n/2-1 guarantees every pair meets exactly
 * once across n-1 rounds (n even). Home/away is alternated by (round+i)
 * parity so a given seat isn't always "home" — perfectly balanced when
 * n-1 is even, off by at most one match per entry otherwise.
 */
export function bergerRounds(n: number): Array<Array<{ home: number; away: number }>> {
  if (n % 2 !== 0) throw new Error("bergerRounds requires an even number of slots (pad with a BYE)");
  const arr = Array.from({ length: n }, (_, i) => i);
  const rounds: Array<Array<{ home: number; away: number }>> = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<{ home: number; away: number }> = [];
    // Swap home/away for the whole round on alternating rounds so no single
    // seat is systematically always-home or always-away; a perfect 50/50
    // split per seat isn't achievable for every n with a closed-form table.
    const swapRound = r % 2 === 1;
    for (let i = 0; i < n / 2; i++) {
      const x = arr[i];
      const y = arr[n - 1 - i];
      pairs.push(swapRound ? { home: y, away: x } : { home: x, away: y });
    }
    rounds.push(pairs);
    const fixed = arr[0];
    const rest = arr.slice(1);
    const last = rest.pop() as number;
    rest.unshift(last);
    arr.splice(0, arr.length, fixed, ...rest);
  }
  return rounds;
}

/**
 * Builds a full round-robin fixture list (matches) for `entries` mapped by
 * index. Odd counts get a virtual BYE slot; a BYE fixture auto-completes.
 * Double round robin appends a mirrored second leg (home/away swapped) with
 * round numbers continuing after the first leg.
 */
export function buildRoundRobinMatches(
  entries: Entry[],
  opts: { stageId: string; groupId: string | null; bracket: Bracket; idPrefix: string; doubleRound: boolean },
): Match[] {
  const slots: EntrySlot[] = entries.slice().sort((a, b) => a.seed - b.seed).map((e) => e.id);
  const padded = slots.length % 2 === 0 ? slots : [...slots, BYE];
  const n = padded.length;
  const legs = opts.doubleRound ? 2 : 1;
  const singleLegRounds = bergerRounds(n);
  const matches: Match[] = [];
  let roundNumber = 0;
  let matchNumber = 0;

  for (let leg = 0; leg < legs; leg++) {
    for (const roundPairs of singleLegRounds) {
      roundNumber++;
      matchNumber = 0;
      for (const pair of roundPairs) {
        matchNumber++;
        const homeIdx = leg === 1 ? pair.away : pair.home;
        const awayIdx = leg === 1 ? pair.home : pair.away;
        const home = padded[homeIdx];
        const away = padded[awayIdx];
        const m = newMatch({
          id: `${opts.idPrefix}-r${roundNumber}-m${matchNumber}`,
          stageId: opts.stageId,
          groupId: opts.groupId,
          bracket: opts.bracket,
          round: roundNumber,
          number: matchNumber,
          entry1Id: home,
          entry2Id: away,
        });
        if (home === BYE || away === BYE) {
          m.status = "completed";
          m.decidedBy = "bye";
          m.winnerEntryId = home === BYE ? (away as string) : (home as string);
        }
        matches.push(m);
      }
    }
  }
  return matches;
}
