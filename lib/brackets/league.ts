import { buildRoundRobinMatches } from "./round-robin";
import { sortMatches } from "./util";
import type { TournamentSettings } from "@/lib/settings/tournament";
import type { Entry, Group, Stage, TournamentState } from "./types";

/** League: single or double round robin (Berger circle method). */
export function generateLeague(entries: Entry[], settings: TournamentSettings): TournamentState {
  const stage: Stage = { id: "s1", kind: "league", order: 1 };
  const matches = buildRoundRobinMatches(entries, {
    stageId: stage.id,
    groupId: null,
    bracket: "group",
    idPrefix: "s1-rr",
    doubleRound: settings.league.double_round_robin,
  }).sort(sortMatches);
  const groups: Group[] = [];
  return { format: "league", settings, entries, stages: [stage], groups, matches };
}
