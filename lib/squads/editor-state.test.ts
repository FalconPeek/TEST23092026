import { describe, expect, it } from "vitest";
import { candidatesForSlot, changeFormation, clearSlot, setSlot, type EditorAssignment } from "./editor-state";
import { findFormation } from "./formations";
import type { SquadContext } from "./view";

type ContextPlayer = SquadContext["players"] extends Map<string, infer V> ? V : never;

function player(id: string, overrides: Partial<ContextPlayer> = {}): ContextPlayer {
  return {
    playerId: id,
    name: id,
    avatarUrl: null,
    primaryPosition: "DC",
    altPositions: [],
    ovrByPosition: {},
    ovr: 60,
    clubIds: [],
    tier: "silver",
    provisional: false,
    ...overrides,
  };
}

describe("setSlot", () => {
  it("places a player in a slot", () => {
    const next = setSlot(new Map(), 3, "p1");
    expect(next.get(3)).toBe("p1");
  });

  it("moves a player already placed elsewhere instead of duplicating them", () => {
    const initial: EditorAssignment = new Map([[1, "p1"]]);
    const next = setSlot(initial, 3, "p1");
    expect(next.get(1)).toBeUndefined();
    expect(next.get(3)).toBe("p1");
    expect([...next.values()]).toEqual(["p1"]);
  });

  it("replaces whoever was already in the target slot", () => {
    const initial: EditorAssignment = new Map([[3, "p1"]]);
    const next = setSlot(initial, 3, "p2");
    expect(next.get(3)).toBe("p2");
  });
});

describe("clearSlot", () => {
  it("removes the player from a slot", () => {
    const next = clearSlot(new Map([[3, "p1"]]), 3);
    expect(next.has(3)).toBe(false);
  });

  it("returns the same reference when the slot was already empty", () => {
    const initial: EditorAssignment = new Map();
    expect(clearSlot(initial, 3)).toBe(initial);
  });
});

describe("changeFormation", () => {
  it("drops players whose slot index no longer exists in the new formation", () => {
    const formation5 = findFormation(5, "2-2")!;
    const formation6 = findFormation(6, "3-2")!;
    const initial: EditorAssignment = new Map(formation5.slots.map((s) => [s.slot, `p${s.slot}`]));

    const next = changeFormation(initial, formation6);

    const validSlots = new Set(formation6.slots.map((s) => s.slot));
    for (const slot of next.keys()) expect(validSlots.has(slot)).toBe(true);
  });

  it("keeps players whose slot index still exists", () => {
    const formation = findFormation(5, "2-2")!;
    const sameSizeOther = findFormation(5, "1-2-1")!;
    const initial: EditorAssignment = new Map([[0, "gk"]]);

    const next = changeFormation(initial, sameSizeOther);

    expect(next.get(0)).toBe("gk");
    expect(formation.slots.some((s) => s.slot === 0)).toBe(true);
  });
});

describe("candidatesForSlot", () => {
  it("excludes players already placed in any slot", () => {
    const players: SquadContext["players"] = new Map([
      ["p1", player("p1")],
      ["p2", player("p2")],
    ]);
    const assignment: EditorAssignment = new Map([[0, "p1"]]);

    const candidates = candidatesForSlot(players, assignment, "DC");

    expect(candidates.map((c) => c.playerId)).toEqual(["p2"]);
  });

  it("sorts by OVR at the requested position, best first", () => {
    const players: SquadContext["players"] = new Map([
      ["low", player("low", { ovr: 55 })],
      ["high", player("high", { ovr: 80 })],
      ["mid", player("mid", { ovr: 65 })],
    ]);

    const candidates = candidatesForSlot(players, new Map(), "DC");

    expect(candidates.map((c) => c.playerId)).toEqual(["high", "mid", "low"]);
  });

  it("tags primary, alt and other position fit", () => {
    const players: SquadContext["players"] = new Map([
      ["prim", player("prim", { primaryPosition: "DC" })],
      ["alt", player("alt", { primaryPosition: "MC", altPositions: ["DC"] })],
      ["other", player("other", { primaryPosition: "MC", altPositions: [] })],
    ]);

    const candidates = candidatesForSlot(players, new Map(), "DC");
    const fitByPlayer = new Map(candidates.map((c) => [c.playerId, c.fit]));

    expect(fitByPlayer.get("prim")).toBe("primary");
    expect(fitByPlayer.get("alt")).toBe("alt");
    expect(fitByPlayer.get("other")).toBe("other");
  });
});
