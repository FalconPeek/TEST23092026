import { describe, expect, it } from "vitest";
import { defaultGroupSettings } from "@/lib/settings/group";
import type { PositionCode } from "@/lib/rating/positions";
import { FORMATIONS, TEAM_SIZES, defaultFormation, findFormation, formationsFor } from "./formations";
import {
  DEFAULT_SLOT_OVR,
  type SquadPlayer,
  pairKey,
  slotOvr,
  squadChemistry,
  teamRating,
  validateAssignment,
} from "./rating";

const settings = defaultGroupSettings.squads;

function player(id: string, overrides: Partial<SquadPlayer> = {}): SquadPlayer {
  return { playerId: id, primaryPosition: null, altPositions: [], ovrByPosition: {}, ovr: null, clubIds: [], ...overrides };
}

describe("formations", () => {
  it("every formation has exactly teamSize slots, one goalkeeper, sequential slot ids and on-pitch coordinates", () => {
    for (const f of FORMATIONS) {
      expect(f.slots).toHaveLength(f.teamSize);
      expect(f.slots.filter((s) => s.position === "POR")).toHaveLength(1);
      expect(f.slots.map((s) => s.slot)).toEqual([...Array(f.teamSize).keys()]);
      for (const s of f.slots) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(100);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeLessThanOrEqual(100);
      }
    }
  });

  it("offers at least two formations per team size and unique codes within a size", () => {
    for (const size of TEAM_SIZES) {
      const codes = formationsFor(size).map((f) => f.code);
      expect(codes.length).toBeGreaterThanOrEqual(2);
      expect(new Set(codes).size).toBe(codes.length);
      expect(defaultFormation(size).teamSize).toBe(size);
    }
    expect(findFormation(11, "4-3-3")?.slots).toHaveLength(11);
    expect(findFormation(5, "4-3-3")).toBeUndefined();
  });
});

describe("teamRating", () => {
  const f = findFormation(5, "2-2")!; // POR, DFC, DFC, DC, DC

  it("uses the OVR at the slot's position, falling back to the card OVR, then to the default", () => {
    expect(slotOvr(player("a", { ovrByPosition: { DC: 80 }, ovr: 70 }), "DC")).toBe(80);
    expect(slotOvr(player("a", { ovr: 70 }), "DC")).toBe(70);
    expect(slotOvr(player("a"), "DC")).toBe(DEFAULT_SLOT_OVR);
  });

  it("returns 0 for an empty squad", () => {
    expect(teamRating(f, new Map())).toEqual({ rating: 0, filled: 0, complete: false });
  });

  it("equals the plain OVR when every player is rated the same", () => {
    const assignment = new Map(f.slots.map((s) => [s.slot, player(`p${s.slot}`, { ovr: 70 })]));
    expect(teamRating(f, assignment)).toEqual({ rating: 70, filled: 5, complete: true });
  });

  it("lifts above the mean when there are stars (FUT surplus rule)", () => {
    const ovrs = [60, 60, 60, 60, 90]; // mean 66, surplus 24 → (330 + 24) / 5 = 70.8
    const assignment = new Map(f.slots.map((s) => [s.slot, player(`p${s.slot}`, { ovr: ovrs[s.slot]! })]));
    expect(teamRating(f, assignment).rating).toBe(71);
  });

  it("rates a partial squad over its filled slots and flags it incomplete", () => {
    const assignment = new Map([[0, player("gk", { ovrByPosition: { POR: 75 } })]]);
    expect(teamRating(f, assignment)).toEqual({ rating: 75, filled: 1, complete: false });
  });
});

describe("squadChemistry", () => {
  const f = findFormation(5, "1-2-1")!; // 0 POR, 1 DFC, 2 MI, 3 MD, 4 DC
  const pos = (primary: PositionCode, alt: PositionCode[] = []) => ({ primaryPosition: primary, altPositions: alt });

  it("gives primary-position, alternate-position and out-of-position points", () => {
    const assignment = new Map([
      [0, player("gk", pos("POR"))],
      [1, player("cb", pos("MC", ["DFC"]))],
      [4, player("st", pos("MC"))],
    ]);
    const chem = squadChemistry(f, assignment, new Map(), settings);
    const byId = Object.fromEntries(chem.players.map((p) => [p.playerId, p]));
    expect(byId.gk!.position).toBe(settings.chem_primary_position);
    expect(byId.cb!.position).toBe(settings.chem_alt_position);
    expect(byId.st!.position).toBe(0);
    expect(chem.max).toBe(settings.chem_max_per_player * 5);
  });

  it("adds a link point for players with enough shared matches with a squad mate", () => {
    const assignment = new Map([
      [2, player("a", pos("MI"))],
      [3, player("b", pos("MD"))],
      [4, player("c", pos("DC"))],
    ]);
    const shared = new Map([[pairKey("a", "b"), settings.link_min_matches]]);
    const chem = squadChemistry(f, assignment, shared, settings);
    const links = Object.fromEntries(chem.players.map((p) => [p.playerId, p.link]));
    expect(links).toEqual({ a: settings.chem_link, b: settings.chem_link, c: 0 });
  });

  it("does not link below the minimum shared matches", () => {
    const assignment = new Map([
      [2, player("a", pos("MI"))],
      [3, player("b", pos("MD"))],
    ]);
    const shared = new Map([[pairKey("b", "a"), settings.link_min_matches - 1]]);
    expect(squadChemistry(f, assignment, shared, settings).players.every((p) => p.link === 0)).toBe(true);
  });

  it("adds a club point only when enough squad members share the club", () => {
    const club = (id: string, clubIds: string[]) => player(id, { ...pos("DC"), clubIds });
    const few = new Map([
      [1, club("a", ["river"])],
      [2, club("b", ["river"])],
    ]);
    expect(squadChemistry(f, few, new Map(), settings).players.every((p) => p.club === 0)).toBe(true);

    const enough = new Map([
      [1, club("a", ["river"])],
      [2, club("b", ["river"])],
      [3, club("c", ["river", "boca"])],
      [4, club("d", ["boca"])],
    ]);
    const clubs = Object.fromEntries(squadChemistry(f, enough, new Map(), settings).players.map((p) => [p.playerId, p.club]));
    expect(clubs).toEqual({ a: 1, b: 1, c: 1, d: 0 });
  });

  it("caps each player's chemistry and sums the team total", () => {
    const capped = { ...settings, chem_max_per_player: 3 };
    const assignment = new Map([
      [4, player("a", { ...pos("DC"), clubIds: ["x"] })],
      [2, player("b", { ...pos("MI"), clubIds: ["x"] })],
      [3, player("c", { ...pos("MD"), clubIds: ["x"] })],
    ]);
    const shared = new Map([
      [pairKey("a", "b"), 10],
      [pairKey("b", "c"), 10],
    ]);
    const chem = squadChemistry(f, assignment, shared, capped);
    expect(chem.players.every((p) => p.total === 3)).toBe(true); // 2 + 1 + 1 capped at 3
    expect(chem.total).toBe(9);
  });
});

describe("validateAssignment", () => {
  const f = findFormation(5, "2-2")!;

  it("accepts a valid partial squad", () => {
    expect(validateAssignment(f, new Map([[0, player("a")], [3, player("b")]]))).toBeNull();
  });

  it("rejects unknown slots and repeated players", () => {
    expect(validateAssignment(f, new Map([[7, player("a")]]))).toBe("unknown_slot");
    expect(validateAssignment(f, new Map([[0, player("a")], [1, player("a")]]))).toBe("duplicate_player");
  });
});
