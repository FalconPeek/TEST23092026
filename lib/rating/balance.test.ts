import { describe, expect, it } from "vitest";
import { balanceTeams, type BalancePlayer } from "./balance";

// Deterministic PRNG (mulberry32) so property tests are reproducible.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fixedRng = () => 0.5; // no genuine ties in most tests below, so this is fully deterministic

describe("balanceTeams", () => {
  it("returns teamCount empty teams for 0 players", () => {
    const result = balanceTeams([], 2, fixedRng);
    expect(result).toEqual([
      { playerIds: [], sumMu: 0, sumOvr: 0 },
      { playerIds: [], sumMu: 0, sumOvr: 0 },
    ]);
  });

  it("puts a single player alone on one team", () => {
    const result = balanceTeams([{ id: "p1", mu: 25, ovr: 60 }], 2, fixedRng);
    const withPlayer = result.filter((t) => t.playerIds.length > 0);
    expect(withPlayer).toHaveLength(1);
    expect(withPlayer[0].playerIds).toEqual(["p1"]);
  });

  it("snake-drafts 4 players into 2 perfectly balanced teams (hand-checked)", () => {
    const players: BalancePlayer[] = [
      { id: "p10", mu: 10, ovr: 10 },
      { id: "p8", mu: 8, ovr: 8 },
      { id: "p6", mu: 6, ovr: 6 },
      { id: "p4", mu: 4, ovr: 4 },
    ];
    // Snake order team0,team1,team1,team0 -> team0 = [10,4]=14, team1 = [8,6]=14.
    const [teamA, teamB] = balanceTeams(players, 2, fixedRng);
    expect(teamA.sumMu).toBe(14);
    expect(teamB.sumMu).toBe(14);
    expect([...teamA.playerIds, ...teamB.playerIds].sort()).toEqual(["p10", "p4", "p6", "p8"]);
  });

  it("keeps at most one GK per team when possible", () => {
    const players: BalancePlayer[] = [
      { id: "gk1", mu: 20, ovr: 20, isGk: true },
      { id: "gk2", mu: 20, ovr: 20, isGk: true },
      { id: "o1", mu: 15, ovr: 15 },
      { id: "o2", mu: 12, ovr: 12 },
      { id: "o3", mu: 9, ovr: 9 },
      { id: "o4", mu: 6, ovr: 6 },
    ];
    const teams = balanceTeams(players, 2, fixedRng);
    for (const team of teams) {
      const gkCount = team.playerIds.filter((id) => id.startsWith("gk")).length;
      expect(gkCount).toBe(1);
    }
    // Hand-checked: gk teams [gk1]/[gk2] (20 each) + outfield snake [15,6]/[12,9] -> 41/41.
    expect(teams[0].sumMu).toBe(41);
    expect(teams[1].sumMu).toBe(41);
  });

  it("does not crash with more GKs than teams; best-effort distributes them", () => {
    const players: BalancePlayer[] = [
      { id: "gk1", mu: 20, ovr: 20, isGk: true },
      { id: "gk2", mu: 18, ovr: 18, isGk: true },
      { id: "gk3", mu: 16, ovr: 16, isGk: true },
      { id: "o1", mu: 10, ovr: 10 },
      { id: "o2", mu: 8, ovr: 8 },
    ];
    const teams = balanceTeams(players, 2, fixedRng);
    const allIds = teams.flatMap((t) => t.playerIds);
    expect(allIds.sort()).toEqual(["gk1", "gk2", "gk3", "o1", "o2"].sort());
    const gkCounts = teams.map((t) => t.playerIds.filter((id) => id.startsWith("gk")).length);
    expect(gkCounts.reduce((a, b) => a + b, 0)).toBe(3); // all 3 GKs placed somewhere
  });

  it("is deterministic for a given rng seed", () => {
    const players: BalancePlayer[] = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, mu: 10 + i, ovr: 50 + i }));
    const a = balanceTeams(players, 2, mulberry32(7));
    const b = balanceTeams(players, 2, mulberry32(7));
    expect(a).toEqual(b);
  });

  it("supports splitting into more than 2 teams", () => {
    const players: BalancePlayer[] = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, mu: i, ovr: i }));
    const teams = balanceTeams(players, 3, fixedRng);
    expect(teams).toHaveLength(3);
    expect(teams.every((t) => t.playerIds.length === 3)).toBe(true);
  });

  it.each([2, 3, 4, 5, 7, 8, 11, 16, 20, 33])("conserves every player exactly once for n=%i", (n) => {
    const rng = mulberry32(n * 1000 + 1);
    const players: BalancePlayer[] = Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      mu: 15 + rng() * 20,
      ovr: 40 + rng() * 50,
      isGk: i === 0, // exactly one GK, always placeable without violating the constraint
    }));
    const teams = balanceTeams(players, 2, rng);
    const allIds = teams.flatMap((t) => t.playerIds).sort();
    expect(allIds).toEqual(players.map((p) => p.id).sort());
    for (const team of teams) {
      expect(team.playerIds.filter((id) => id === "p0").length).toBeLessThanOrEqual(1);
    }
  });
});
