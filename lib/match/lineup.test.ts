import { describe, expect, it } from "vitest";
import { applyBalance, countByAssignment, cyclePlayer, nextAssignment, teamStrength, type LineupPlayer } from "./lineup";
import { seededRng } from "@/lib/brackets";

function player(overrides: Partial<LineupPlayer> = {}): LineupPlayer {
  return {
    id: "p1",
    mu: 25,
    ovr: 60,
    isGk: false,
    isSpectatorRole: false,
    assignment: "unassigned",
    position: null,
    ...overrides,
  };
}

describe("nextAssignment", () => {
  it("cycles unassigned -> team1 -> team2 -> spectator -> unassigned for a regular player", () => {
    expect(nextAssignment(player({ assignment: "unassigned" }))).toBe("team1");
    expect(nextAssignment(player({ assignment: "team1" }))).toBe("team2");
    expect(nextAssignment(player({ assignment: "team2" }))).toBe("spectator");
    expect(nextAssignment(player({ assignment: "spectator" }))).toBe("unassigned");
  });

  it("only cycles unassigned <-> spectator for a spectator-role member", () => {
    expect(nextAssignment(player({ assignment: "unassigned", isSpectatorRole: true }))).toBe("spectator");
    expect(nextAssignment(player({ assignment: "spectator", isSpectatorRole: true }))).toBe("unassigned");
    // even if somehow already on a team, cycling still routes to spectator, never team2
    expect(nextAssignment(player({ assignment: "team1", isSpectatorRole: true }))).toBe("spectator");
  });
});

describe("cyclePlayer", () => {
  it("keeps position (and every other field) unchanged when only the assignment cycles", () => {
    const players = [player({ id: "p1", position: "DC", assignment: "unassigned" })];
    const next = cyclePlayer(players, "p1");

    expect(next[0]).toEqual({ ...players[0], assignment: "team1" });
  });

  it("only touches the targeted player", () => {
    const players = [player({ id: "p1" }), player({ id: "p2" })];
    const next = cyclePlayer(players, "p1");

    expect(next[0]?.assignment).toBe("team1");
    expect(next[1]?.assignment).toBe("unassigned");
  });
});

describe("applyBalance", () => {
  it("splits only the non-spectator players and leaves spectators untouched", () => {
    const players: LineupPlayer[] = [
      player({ id: "p1", mu: 30, assignment: "unassigned" }),
      player({ id: "p2", mu: 28, assignment: "unassigned" }),
      player({ id: "p3", mu: 26, assignment: "unassigned" }),
      player({ id: "p4", mu: 24, assignment: "unassigned" }),
      player({ id: "spec", mu: 99, assignment: "spectator", isSpectatorRole: true }),
    ];

    const next = applyBalance(players, seededRng(1));

    const spec = next.find((p) => p.id === "spec");
    expect(spec?.assignment).toBe("spectator");

    const assigned = next.filter((p) => p.id !== "spec");
    expect(assigned.every((p) => p.assignment === "team1" || p.assignment === "team2")).toBe(true);
    expect(assigned.filter((p) => p.assignment === "team1")).toHaveLength(2);
    expect(assigned.filter((p) => p.assignment === "team2")).toHaveLength(2);
  });

  it("keeps position unchanged for balanced players", () => {
    const players: LineupPlayer[] = [
      player({ id: "p1", position: "POR", assignment: "unassigned" }),
      player({ id: "p2", position: "DC", assignment: "unassigned" }),
    ];

    const next = applyBalance(players, seededRng(1));

    expect(next.find((p) => p.id === "p1")?.position).toBe("POR");
    expect(next.find((p) => p.id === "p2")?.position).toBe("DC");
  });

  it("is deterministic for the same seed", () => {
    const players: LineupPlayer[] = [
      player({ id: "p1", mu: 30 }),
      player({ id: "p2", mu: 28 }),
      player({ id: "p3", mu: 26 }),
      player({ id: "p4", mu: 24 }),
    ];

    const a = applyBalance(players, seededRng(7)).map((p) => [p.id, p.assignment]);
    const b = applyBalance(players, seededRng(7)).map((p) => [p.id, p.assignment]);
    expect(a).toEqual(b);
  });
});

describe("countByAssignment", () => {
  it("tallies each assignment bucket", () => {
    const players: LineupPlayer[] = [
      player({ id: "p1", assignment: "team1" }),
      player({ id: "p2", assignment: "team1" }),
      player({ id: "p3", assignment: "team2" }),
      player({ id: "p4", assignment: "spectator" }),
      player({ id: "p5", assignment: "unassigned" }),
    ];

    expect(countByAssignment(players)).toEqual({ team1: 2, team2: 1, spectator: 1, unassigned: 1 });
  });
});

describe("teamStrength", () => {
  it("sums mu and averages ovr for the requested team only", () => {
    const players: LineupPlayer[] = [
      player({ id: "p1", mu: 30, ovr: 70, assignment: "team1" }),
      player({ id: "p2", mu: 20, ovr: 50, assignment: "team1" }),
      player({ id: "p3", mu: 25, ovr: 60, assignment: "team2" }),
    ];

    expect(teamStrength(players, "team1")).toEqual({ sumMu: 50, avgOvr: 60, count: 2 });
  });

  it("returns zeros for an empty team", () => {
    expect(teamStrength([], "team1")).toEqual({ sumMu: 0, avgOvr: 0, count: 0 });
  });
});
