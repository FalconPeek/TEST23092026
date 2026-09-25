import { describe, expect, it } from "vitest";
import {
  addEntry,
  assignPlayer,
  averageOvr,
  removeEntry,
  renameEntry,
  setEntryClub,
  setSeed,
  unassignedPlayerIds,
  unassignPlayer,
  validateEntries,
  type DraftEntry,
} from "./entries";

describe("addEntry / removeEntry / renameEntry / setSeed", () => {
  it("adds an entry with an empty roster and null seed", () => {
    const entries = addEntry([], "e1", "Los Pibes");
    expect(entries).toEqual([{ id: "e1", name: "Los Pibes", seed: null, playerIds: [], clubId: null }]);
  });

  it("removes only the matching entry", () => {
    const entries: DraftEntry[] = [
      { id: "e1", name: "A", seed: null, playerIds: [], clubId: null },
      { id: "e2", name: "B", seed: null, playerIds: [], clubId: null },
    ];
    expect(removeEntry(entries, "e1")).toEqual([{ id: "e2", name: "B", seed: null, playerIds: [], clubId: null }]);
  });

  it("renames only the matching entry", () => {
    const entries: DraftEntry[] = [{ id: "e1", name: "A", seed: null, playerIds: [], clubId: null }];
    expect(renameEntry(entries, "e1", "Renombrado")[0]!.name).toBe("Renombrado");
  });

  it("sets the seed on the matching entry", () => {
    const entries: DraftEntry[] = [{ id: "e1", name: "A", seed: null, playerIds: [], clubId: null }];
    expect(setSeed(entries, "e1", 3)[0]!.seed).toBe(3);
  });
});

describe("assignPlayer / unassignPlayer", () => {
  const base: DraftEntry[] = [
    { id: "e1", name: "A", seed: null, playerIds: ["p1"], clubId: null },
    { id: "e2", name: "B", seed: null, playerIds: [], clubId: null },
  ];

  it("adds a player to the target entry", () => {
    const next = assignPlayer([{ id: "e1", name: "A", seed: null, playerIds: [], clubId: null }], "e1", "p1");
    expect(next[0]!.playerIds).toEqual(["p1"]);
  });

  it("moves a player from one entry to another, keeping them on at most one team", () => {
    const next = assignPlayer(base, "e2", "p1");
    expect(next.find((e) => e.id === "e1")!.playerIds).toEqual([]);
    expect(next.find((e) => e.id === "e2")!.playerIds).toEqual(["p1"]);
  });

  it("is a no-op when the player is already on that entry", () => {
    const next = assignPlayer(base, "e1", "p1");
    expect(next).toEqual(base);
  });

  it("removes a player from whichever entry they were on", () => {
    const next = unassignPlayer(base, "p1");
    expect(next.find((e) => e.id === "e1")!.playerIds).toEqual([]);
  });

  it("unassignPlayer is a no-op for an already-unassigned player", () => {
    expect(unassignPlayer(base, "nobody")).toEqual(base);
  });
});

describe("setEntryClub", () => {
  it("sets the club, renames the entry and prefills the club's roster", () => {
    const entries: DraftEntry[] = [{ id: "e1", name: "A", seed: null, playerIds: [], clubId: null }];
    const next = setEntryClub(entries, "e1", { id: "c1", name: "River", playerIds: ["p1", "p2"] });
    expect(next[0]).toEqual({ id: "e1", name: "River", seed: null, playerIds: ["p1", "p2"], clubId: "c1" });
  });

  it("skips roster players already assigned to another entry", () => {
    const entries: DraftEntry[] = [
      { id: "e1", name: "A", seed: null, playerIds: [], clubId: null },
      { id: "e2", name: "B", seed: null, playerIds: ["p1"], clubId: null },
    ];
    const next = setEntryClub(entries, "e1", { id: "c1", name: "River", playerIds: ["p1", "p2"] });
    expect(next.find((e) => e.id === "e1")!.playerIds).toEqual(["p2"]);
    expect(next.find((e) => e.id === "e2")!.playerIds).toEqual(["p1"]);
  });

  it("replaces the entry's current roster with the club's roster", () => {
    const entries: DraftEntry[] = [{ id: "e1", name: "A", seed: null, playerIds: ["old"], clubId: null }];
    const next = setEntryClub(entries, "e1", { id: "c1", name: "River", playerIds: ["p1"] });
    expect(next[0]!.playerIds).toEqual(["p1"]);
  });

  it("clearing the club keeps the current name and players", () => {
    const entries: DraftEntry[] = [{ id: "e1", name: "River", seed: null, playerIds: ["p1"], clubId: "c1" }];
    const next = setEntryClub(entries, "e1", null);
    expect(next[0]).toEqual({ id: "e1", name: "River", seed: null, playerIds: ["p1"], clubId: null });
  });
});

describe("unassignedPlayerIds", () => {
  it("returns players who aren't on any entry", () => {
    const entries: DraftEntry[] = [{ id: "e1", name: "A", seed: null, playerIds: ["p1"], clubId: null }];
    expect(unassignedPlayerIds(entries, ["p1", "p2", "p3"])).toEqual(["p2", "p3"]);
  });
});

describe("averageOvr", () => {
  it("defaults to 60 for an empty roster", () => {
    expect(averageOvr([], new Map())).toBe(60);
  });

  it("defaults missing players to the default OVR", () => {
    expect(averageOvr(["p1"], new Map())).toBe(60);
  });

  it("averages known OVRs", () => {
    const ovrByPlayer = new Map([
      ["p1", 70],
      ["p2", 80],
    ]);
    expect(averageOvr(["p1", "p2"], ovrByPlayer)).toBe(75);
  });

  it("uses a custom default when given one", () => {
    expect(averageOvr(["unknown"], new Map(), 50)).toBe(50);
  });
});

describe("validateEntries", () => {
  it("rejects fewer than 2 entries", () => {
    expect(validateEntries([{ id: "e1", name: "A", seed: null, playerIds: [], clubId: null }])).toBe("too_few");
  });

  it("rejects an entry with a blank name", () => {
    const entries: DraftEntry[] = [
      { id: "e1", name: "  ", seed: null, playerIds: [], clubId: null },
      { id: "e2", name: "B", seed: null, playerIds: [], clubId: null },
    ];
    expect(validateEntries(entries)).toBe("empty_name");
  });

  it("rejects duplicate non-null seeds", () => {
    const entries: DraftEntry[] = [
      { id: "e1", name: "A", seed: 1, playerIds: [], clubId: null },
      { id: "e2", name: "B", seed: 1, playerIds: [], clubId: null },
    ];
    expect(validateEntries(entries)).toBe("duplicate_seed");
  });

  it("allows every entry to have a null seed", () => {
    const entries: DraftEntry[] = [
      { id: "e1", name: "A", seed: null, playerIds: [], clubId: null },
      { id: "e2", name: "B", seed: null, playerIds: [], clubId: null },
    ];
    expect(validateEntries(entries)).toBeNull();
  });

  it("accepts a valid set of entries", () => {
    const entries: DraftEntry[] = [
      { id: "e1", name: "A", seed: 1, playerIds: ["p1"], clubId: null },
      { id: "e2", name: "B", seed: 2, playerIds: ["p2"], clubId: null },
    ];
    expect(validateEntries(entries)).toBeNull();
  });
});
