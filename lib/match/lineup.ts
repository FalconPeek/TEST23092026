// Pure state transitions for the lineup editor: cycling a player's assignment and mapping
// balanceTeams' output back onto the roster. No I/O; components/match/lineup-editor.tsx owns
// the actual state and calls into this.

import { balanceTeams, type BalancePlayer } from "@/lib/rating/balance";
import type { Rng } from "@/lib/brackets";
import type { PositionCode } from "@/lib/rating/positions";

export type Assignment = "unassigned" | "team1" | "team2" | "spectator";

export interface LineupPlayer {
  id: string;
  mu: number;
  ovr: number;
  isGk: boolean;
  /** A group_members.role = 'spectator' member: can never be placed on a team. */
  isSpectatorRole: boolean;
  assignment: Assignment;
  position: PositionCode | null;
}

/**
 * Tap-to-cycle order: unassigned -> team1 -> team2 -> spectator -> unassigned. A
 * spectator-role member can never join a team, so their cycle is unassigned <-> spectator.
 */
export function nextAssignment(player: Pick<LineupPlayer, "assignment" | "isSpectatorRole">): Assignment {
  if (player.isSpectatorRole) {
    return player.assignment === "spectator" ? "unassigned" : "spectator";
  }
  switch (player.assignment) {
    case "unassigned":
      return "team1";
    case "team1":
      return "team2";
    case "team2":
      return "spectator";
    case "spectator":
      return "unassigned";
  }
}

/** Cycles a single player's assignment, leaving every other field (incl. position) untouched. */
export function cyclePlayer<T extends LineupPlayer>(players: T[], playerId: string): T[] {
  return players.map((p) => (p.id === playerId ? { ...p, assignment: nextAssignment(p) } : p));
}

/**
 * Splits every player NOT currently marked `spectator` across team1/team2 via balanceTeams.
 * Spectators are left exactly as they are; nobody is added to or removed from the eligible
 * pool, and `position` is never touched.
 */
export function applyBalance<T extends LineupPlayer>(players: T[], rng: Rng): T[] {
  const eligible = players.filter((p) => p.assignment !== "spectator");
  const balanceInput: BalancePlayer[] = eligible.map((p) => ({ id: p.id, mu: p.mu, ovr: p.ovr, isGk: p.isGk }));
  const [team1, team2] = balanceTeams(balanceInput, 2, rng);
  const team1Ids = new Set(team1?.playerIds ?? []);
  const team2Ids = new Set(team2?.playerIds ?? []);

  return players.map((p) => {
    if (p.assignment === "spectator") return p;
    if (team1Ids.has(p.id)) return { ...p, assignment: "team1" as const };
    if (team2Ids.has(p.id)) return { ...p, assignment: "team2" as const };
    return p;
  });
}

export function countByAssignment(players: LineupPlayer[]): Record<Assignment, number> {
  const counts: Record<Assignment, number> = { unassigned: 0, team1: 0, team2: 0, spectator: 0 };
  for (const p of players) counts[p.assignment] += 1;
  return counts;
}

export function teamStrength(
  players: LineupPlayer[],
  assignment: "team1" | "team2",
): { sumMu: number; avgOvr: number; count: number } {
  const team = players.filter((p) => p.assignment === assignment);
  const sumMu = team.reduce((sum, p) => sum + p.mu, 0);
  const avgOvr = team.length > 0 ? team.reduce((sum, p) => sum + p.ovr, 0) / team.length : 0;
  return { sumMu, avgOvr, count: team.length };
}
