import { buildEliminationBracket } from "./elimination";
import { newMatch, setSlot } from "./propagation";
import { sortMatches } from "./util";
import type { TournamentSettings } from "@/lib/settings/tournament";
import type { Entry, Group, Match, Stage, TournamentState } from "./types";

/**
 * Single elimination: recursive standard seed order, byes to top seeds,
 * optional third-place match fed by both semifinal losers.
 */
export function generateSingleElim(entries: Entry[], settings: TournamentSettings): TournamentState {
  const stage: Stage = { id: "s1", kind: "single_elim", order: 1 };
  const { matches, roundMatches } = buildEliminationBracket(entries, {
    stageId: stage.id,
    bracket: "winners",
    idPrefix: "s1-wb",
    lastRoundBracket: "final",
  });

  if (settings.single_elim.third_place && roundMatches.length >= 2) {
    const semis = roundMatches[roundMatches.length - 2];
    if (semis.length === 2) {
      const third = newMatch({
        id: "s1-tp-r1-m1",
        stageId: stage.id,
        bracket: "third",
        round: 1,
        number: 1,
      });
      matches.set(third.id, third);
      semis[0].nextLoserMatchId = third.id;
      semis[0].nextLoserSlot = 1;
      semis[1].nextLoserMatchId = third.id;
      semis[1].nextLoserSlot = 2;
      // Semifinals may already be decided (byes cascading all the way to the
      // final in tiny brackets); push their losers into the 3rd-place match.
      for (const semi of semis) {
        if (semi.status === "completed" && semi.loserEntryId !== null) {
          setSlot(matches, third.id, semi.nextLoserSlot, semi.loserEntryId);
        }
      }
    }
  }

  const allMatches: Match[] = [...matches.values()].sort(sortMatches);
  const groups: Group[] = [];
  return { format: "single_elim", settings, entries, stages: [stage], groups, matches: allMatches };
}

