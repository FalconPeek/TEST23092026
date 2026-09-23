import { buildEliminationBracket } from "./elimination";
import { newMatch, setSlot } from "./propagation";
import { sortMatches } from "./util";
import type { TournamentSettings } from "@/lib/settings/tournament";
import { BYE, type Entry, type Group, type Match, type Stage, type TournamentState } from "./types";
import type { MatchMap } from "./propagation";

/**
 * Double elimination. Winners bracket is a standard single-elim skeleton
 * (byes handled the same way). Losers bracket has 2(k-1) rounds for a
 * k-round winners bracket:
 *   LB round 1        = WB round-1 losers paired by adjacent WB matches
 *                        (loser(m2i) v loser(m2i+1) — the same two matches
 *                        that feed one WB2 match), so an LB1 match's two
 *                        entrants share no WB2 "lineage" to rematch against.
 *   LB round 2i   (i>=1) = LB round (2i-1) survivors merged with WB round
 *                          (i+1) losers, "reverse"-ing the incoming WB
 *                          losers array before zipping so a survivor never
 *                          faces the WB opponent from its own lineage.
 *   LB round 2i+1 (i>=1) = LB round 2i survivors paired among themselves
 *                          ("half shift": position j meets position j+half)
 *                          to avoid re-pairing neighbours from the previous
 *                          round.
 * This eliminates every *avoidable* early rematch; the one rematch pattern
 * no seeding can avoid is the WB runner-up (who only drops into the very
 * last LB round) potentially meeting, in that same last round or in the
 * grand final, someone they already beat earlier in the winners bracket.
 * With a 2-entry bracket (k=1) there is no losers bracket at all: the single
 * WB match's loser goes straight to the grand final as the (trivial) LB
 * champion.
 */
export function generateDoubleElim(entries: Entry[], settings: TournamentSettings): TournamentState {
  const stage: Stage = { id: "s1", kind: "double_elim", order: 1 };
  const { matches, roundMatches: wb } = buildEliminationBracket(entries, {
    stageId: stage.id,
    bracket: "winners",
    idPrefix: "s1-wb",
  });
  const k = wb.length;

  // survivors[r] = LB round r's match list, in left-to-right bracket order.
  const lb: Match[][] = [];

  if (k >= 2) {
    for (let i = 1; i <= k - 1; i++) {
      // Odd round 2i-1: "drop" (i=1, from WB1) or "survivors only" (i>1).
      const oddRound = 2 * i - 1;
      const oddMatches: Match[] = [];
      if (i === 1) {
        const losers = wb[0];
        const m = losers.length;
        for (let j = 0; j < m / 2; j++) {
          const match = newMatch({
            id: `s1-lb-r${oddRound}-m${j + 1}`,
            stageId: stage.id,
            bracket: "losers",
            round: oddRound,
            number: j + 1,
          });
          matches.set(match.id, match);
          oddMatches.push(match);
          // Pair losers from the two adjacent WB1 matches that feed the same
          // WB2 match (consecutive, not reversed) — this keeps each LB1
          // match's "lineage" distinct from the WB2 match it will later meet
          // in LB2, which is what the merge round's reversal relies on to
          // avoid an immediate rematch.
          const a = losers[2 * j];
          const b = losers[2 * j + 1];
          a.nextLoserMatchId = match.id;
          a.nextLoserSlot = 1;
          b.nextLoserMatchId = match.id;
          b.nextLoserSlot = 2;
        }
      } else {
        const prev = lb[oddRound - 2]; // previous (merge) round's matches
        const m = prev.length;
        const half = m / 2;
        for (let j = 0; j < half; j++) {
          const match = newMatch({
            id: `s1-lb-r${oddRound}-m${j + 1}`,
            stageId: stage.id,
            bracket: "losers",
            round: oddRound,
            number: j + 1,
          });
          matches.set(match.id, match);
          oddMatches.push(match);
          prev[j].nextMatchId = match.id;
          prev[j].nextSlot = 1;
          prev[j + half].nextMatchId = match.id;
          prev[j + half].nextSlot = 2;
        }
      }
      lb[oddRound - 1] = oddMatches;

      // Even round 2i: merge odd-round survivors with WB round (i+1) losers.
      const evenRound = 2 * i;
      const wbLosers = [...wb[i]].reverse();
      const evenMatches: Match[] = [];
      for (let j = 0; j < oddMatches.length; j++) {
        const match = newMatch({
          id: `s1-lb-r${evenRound}-m${j + 1}`,
          stageId: stage.id,
          bracket: "losers",
          round: evenRound,
          number: j + 1,
        });
        matches.set(match.id, match);
        evenMatches.push(match);
        oddMatches[j].nextMatchId = match.id;
        oddMatches[j].nextSlot = 1;
        const wbLoserMatch = wbLosers[j];
        wbLoserMatch.nextLoserMatchId = match.id;
        wbLoserMatch.nextLoserSlot = 2;
      }
      lb[evenRound - 1] = evenMatches;
    }
  }

  // Grand final(s).
  const gf1 = newMatch({ id: "s1-gf-r1-m1", stageId: stage.id, bracket: "final", round: 1, number: 1 });
  matches.set(gf1.id, gf1);
  const wbFinal = wb[k - 1][0];
  wbFinal.nextMatchId = gf1.id;
  wbFinal.nextSlot = 1;
  if (k >= 2) {
    const lbFinal = lb[lb.length - 1][0];
    lbFinal.nextMatchId = gf1.id;
    lbFinal.nextSlot = 2;
  } else {
    // Degenerate 2-entry case: WB1's loser is the LB champion outright.
    wbFinal.nextLoserMatchId = gf1.id;
    wbFinal.nextLoserSlot = 2;
  }

  if (settings.double_elim.grand_final_reset) {
    const gf2 = newMatch({ id: "s1-gf-r2-m1", stageId: stage.id, bracket: "final", round: 2, number: 1 });
    // Only played if the LB-path entrant wins GF1; archived otherwise. The
    // engine (applyResult) fills entries / flips status when GF1 completes.
    gf2.status = "locked";
    matches.set(gf2.id, gf2);
  }

  // buildEliminationBracket cascaded WB byes through nextMatchId already, but
  // nextLoserMatchId links didn't exist yet at that point (they're wired
  // above), so BYE losers never reached the losers bracket. Push them now;
  // this can itself cascade through BYE-vs-BYE losers-bracket matches.
  rebroadcastByes(matches, wb);

  const allMatches: Match[] = [...matches.values()].sort(sortMatches);
  const groups: Group[] = [];
  return { format: "double_elim", settings, entries, stages: [stage], groups, matches: allMatches };
}

/**
 * buildEliminationBracket already cascaded WB byes through nextMatchId, but
 * the WB matches' nextLoserMatchId links didn't exist yet at that point, so
 * BYE losers never reached the losers bracket. Push them through now.
 */
function rebroadcastByes(matches: MatchMap, wb: Match[][]): void {
  for (const round of wb) {
    for (const m of round) {
      if (m.status === "completed" && m.decidedBy === "bye") {
        // A bye match never produces a real loser (either side was empty).
        setSlot(matches, m.nextLoserMatchId, m.nextLoserSlot, BYE);
      }
    }
  }
}
