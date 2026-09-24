import { describe, expect, it } from "vitest";
import { defaultGroupSettings } from "@/lib/settings/group";
import { buildSquadContext, buildSquadView } from "./view";

const settings = defaultGroupSettings.squads;

const players = [
  { id: "gk", display_name: "Fede", avatar_url: null, primary_position: "POR", alt_positions: [] },
  { id: "st", display_name: "Lucho", avatar_url: null, primary_position: "DC", alt_positions: ["EI"] },
  { id: "new", display_name: "Nuevo", avatar_url: null, primary_position: "weird", alt_positions: null },
];
const cards = [
  { player_id: "gk", ovr: 70, ovr_by_position: { POR: 72, DC: 40, bogus: 99 }, tier: "silver", is_provisional: false },
  { player_id: "st", ovr: 80, ovr_by_position: { DC: 82 }, tier: "gold", is_provisional: false },
];

describe("buildSquadContext", () => {
  it("normalizes positions, per-position OVRs, clubs and shared appearances", () => {
    const ctx = buildSquadContext(players, cards, [{ club_id: "c1", player_id: "st" }], [{ player_a: "st", player_b: "gk", matches: 4 }]);
    expect(ctx.players.get("gk")!.ovrByPosition).toEqual({ POR: 72, DC: 40 });
    expect(ctx.players.get("new")!.primaryPosition).toBeNull();
    expect(ctx.players.get("new")!.provisional).toBe(true);
    expect(ctx.players.get("st")!.clubIds).toEqual(["c1"]);
    expect(ctx.shared.get("gk|st")).toBe(4);
  });
});

describe("buildSquadView", () => {
  const ctx = buildSquadContext(players, cards, [], [{ player_a: "gk", player_b: "st", matches: 5 }]);

  it("lays the squad on its formation with slot OVRs, rating and chemistry", () => {
    const view = buildSquadView(
      { team_size: 5, formation: "2-2", slots: [{ slot: 0, player_id: "gk" }, { slot: 3, player_id: "st" }] },
      ctx,
      settings,
    )!;
    expect(view.slots).toHaveLength(5);
    expect(view.slots[0]!.player).toMatchObject({ id: "gk", ovr: 72, chemistry: 3 }); // position 2 + link 1
    expect(view.slots[3]!.player).toMatchObject({ id: "st", ovr: 82, chemistry: 3 });
    expect(view.slots[1]!.player).toBeNull();
    expect(view.rating).toEqual({ rating: 80, filled: 2, complete: false }); // mean 77, surplus 5 → (154 + 5) / 2 = 79.5
  });

  it("returns null for an unknown formation and drops unknown players", () => {
    expect(buildSquadView({ team_size: 5, formation: "9-9", slots: [] }, ctx, settings)).toBeNull();
    const view = buildSquadView({ team_size: 5, formation: "2-2", slots: [{ slot: 1, player_id: "ghost" }] }, ctx, settings)!;
    expect(view.slots.every((s) => s.player === null)).toBe(true);
  });
});
