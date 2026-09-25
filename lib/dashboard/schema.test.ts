import { describe, expect, it } from "vitest";
import { parseDashboard } from "./schema";

const VALID_PAYLOAD = {
  player_id: "11111111-1111-4111-8111-111111111111",
  ovr_history: [{ snapshot_at: "2026-01-01T00:00:00Z", ovr: 65 }],
  recent_matches: [
    {
      match_id: "22222222-2222-4222-8222-222222222222",
      played_at: "2026-01-01T20:00:00Z",
      goals: 1,
      assists: 2,
      own_goals: 0,
      saves: 0,
      clean_sheet: true,
      is_mvp: false,
      median_rating: 7.5,
    },
  ],
  totals: { matches_played: 1, goals: 1, assists: 2, own_goals: 0, saves: 0, clean_sheets: 1, mvps: 0 },
  impacto: 70,
  card: { ovr: 65, position: "DC", tier: "silver", is_provisional: false, face: {}, playstyles: [], weak_foot: 3, skill_moves: 3 },
  badges: [{ badge_code: "first_match", awarded_at: "2026-01-01T00:00:00Z", count: 1 }],
};

describe("parseDashboard", () => {
  it("parses a fully valid payload", () => {
    const result = parseDashboard(VALID_PAYLOAD);
    expect(result).not.toBeNull();
    expect(result!.player_id).toBe(VALID_PAYLOAD.player_id);
    expect(result!.ovr_history).toHaveLength(1);
    expect(result!.recent_matches).toHaveLength(1);
    expect(result!.totals.goals).toBe(1);
    expect(result!.impacto).toBe(70);
    expect(result!.badges).toHaveLength(1);
  });

  it("returns null when player_id is missing (an unusable response)", () => {
    const rest: Record<string, unknown> = { ...VALID_PAYLOAD };
    delete rest.player_id;
    expect(parseDashboard(rest)).toBeNull();
  });

  it("returns null when player_id is not a valid uuid", () => {
    expect(parseDashboard({ ...VALID_PAYLOAD, player_id: "not-a-uuid" })).toBeNull();
  });

  it("defaults every collection to an empty array when missing", () => {
    const result = parseDashboard({
      player_id: VALID_PAYLOAD.player_id,
      totals: VALID_PAYLOAD.totals,
      impacto: null,
      card: null,
    });
    expect(result).not.toBeNull();
    expect(result!.ovr_history).toEqual([]);
    expect(result!.recent_matches).toEqual([]);
    expect(result!.badges).toEqual([]);
  });

  it("defaults totals to all-zero when malformed", () => {
    const result = parseDashboard({ ...VALID_PAYLOAD, totals: "not an object" });
    expect(result!.totals).toEqual({
      matches_played: 0,
      goals: 0,
      assists: 0,
      own_goals: 0,
      saves: 0,
      clean_sheets: 0,
      mvps: 0,
    });
  });

  it("defaults impacto to null when it's the wrong type", () => {
    const result = parseDashboard({ ...VALID_PAYLOAD, impacto: "seventy" });
    expect(result!.impacto).toBeNull();
  });

  it("never throws on a completely malformed payload", () => {
    expect(() => parseDashboard("not an object at all")).not.toThrow();
    expect(parseDashboard("not an object at all")).toBeNull();
    expect(() => parseDashboard(null)).not.toThrow();
    expect(parseDashboard(null)).toBeNull();
  });
});
