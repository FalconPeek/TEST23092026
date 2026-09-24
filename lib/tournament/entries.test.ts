import { describe, expect, it } from "vitest";
import {
  addEntry,
  assignPlayer,
  averageOvr,
  removeEntry,
  renameEntry,
  setSeed,
  unassignedPlayerIds,
  unassignPlayer,
  validateEntries,
  type DraftEntry,
} from "./entries";

describe("addEntry / removeEntry / renameEntry / setSeed", () => {
  it("adds an entry with an empty roster and null seed", () => {
    const entries = addEntry([], "e1", "Los Pibes");
    expect(entries).toEqual([{ id: "e1", name: "Los Pibes", seed: null, playerIds: [] }]);
  });

  it("removes only the matching entry", () => {
    const entries: DraftEntry[] = [
      { id: "e1", name: "A", seed: null, playerIds: [] },
      { id: "e2", name: "B", seed: null, playerIds: [] },
    ];
    expect(removeEntry(entries, "e1")).toEqual([{ id: "e2", name: "B", seed: null, playerIds: [] }]);
  });

  it("renames only the matching entry", () => {
    const entries: DraftEntry[] = [{ id: "e1", name: "A", seed: null, playerIds: [] }];
    expect(renameEntry(entries, "e1", "Renombrado")[0]!.name).toBe("Renombrado");
  });

  it("sets the seed on the matching entry", () => {
    const entries: DraftEntry[] = [{ id: "e1", name: "A", seed: null, playerIds: [] }];
    expect(setSeed(entries, "e1", 3)[0]!.seed).toBe(3);
  });
});

describe("assignPlayer / unassignPlayer", () => {
  const base: DraftEntry[] = [
    { id: "e1", name: "A", seed: null, playerIds: ["p1"] },
    { id: "e2", name: "B", seed: null, playerIds: [] },
  ];

  it("adds a player to the target entry", () => {
    const next = assignPlayer([{ id: "e1", name: "A", seed: null, playerIds: [] }], "e1", "p1");
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

describe("unassignedPlayerIds", () => {
  it("returns players who aren't on any entry", () => {
    const entries: DraftEntry[] = [{ id: "e1", name: "A", seed: null, playerIds: ["p1"] }];
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
    expect(validateEntries([{ id: "e1", name: "A", seed: null, playerIds: [] }])).toBe("too_few");
  });

  it("rejects an entry with a blank name", () => {
    const entries: DraftEntry[] = [
      { id: "e1", name: "  ", seed: null, playerIds: [] },
      { id: "e2", name: "B", seed: null, playerIds: [] },
    ];
    expect(validateEntries(entries)).toBe("empty_name");
  });

  it("rejects duplicate non-null seeds", () => {
    const entries: DraftEntry[] = [
      { id: "e1", name: "A", seed: 1, playerIds: [] },
      { id: "e2", name: "B", seed: 1, playerIds: [] },
    ];
    expect(validateEntries(entries)).toBe("duplicate_seed");
  });

  it("allows every entry to have a null seed", () => {
    const entries: DraftEntry[] = [
      { id: "e1", name: "A", seed: null, playerIds: [] },
      { id: "e2", name: "B", seed: null, playerIds: [] },
    ];
    expect(validateEntries(entries)).toBeNull();
  });

  it("accepts a valid set of entries", () => {
    const entries: DraftEntry[] = [
      { id: "e1", name: "A", seed: 1, playerIds: ["p1"] },
      { id: "e2", name: "B", seed: 2, playerIds: ["p2"] },
    ];
    expect(validateEntries(entries)).toBeNull();
  });
});
