import type { Match } from "./types";

const bracketOrder: Record<Match["bracket"], number> = {
  group: 0,
  swiss: 0,
  winners: 1,
  losers: 2,
  final: 3,
  third: 4,
};

/** Stable, deterministic display/storage order: stage, group, bracket, round, number. */
export function sortMatches(a: Match, b: Match): number {
  if (a.stageId !== b.stageId) return a.stageId < b.stageId ? -1 : 1;
  const ag = a.groupId ?? "";
  const bg = b.groupId ?? "";
  if (ag !== bg) return ag < bg ? -1 : 1;
  if (bracketOrder[a.bracket] !== bracketOrder[b.bracket]) return bracketOrder[a.bracket] - bracketOrder[b.bracket];
  if (a.round !== b.round) return a.round - b.round;
  return a.number - b.number;
}
