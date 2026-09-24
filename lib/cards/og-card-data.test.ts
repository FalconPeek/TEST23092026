import { describe, expect, it } from "vitest";
import { buildOgCardData, ogCardParamsSchema } from "./og-card-data";
import type { CardRow } from "./to-card-props";

const PLAYER = { displayName: "Juan Pérez", avatarUrl: null };

function baseCardRow(overrides: Partial<CardRow> = {}): CardRow {
  return {
    ovr: 78,
    position: "DC",
    tier: "gold",
    is_provisional: false,
    face: { pac: 80, sho: 65, pas: 70, dri: 75, def: 50, phy: 68 },
    playstyles: [],
    weak_foot: 4,
    skill_moves: 3,
    ...overrides,
  };
}

describe("ogCardParamsSchema", () => {
  it("accepts a well-formed uuid", () => {
    expect(ogCardParamsSchema.safeParse({ playerId: "123e4567-e89b-12d3-a456-426614174000" }).success).toBe(true);
  });

  it("rejects anything that isn't a uuid", () => {
    expect(ogCardParamsSchema.safeParse({ playerId: "not-a-uuid" }).success).toBe(false);
    expect(ogCardParamsSchema.safeParse({ playerId: "" }).success).toBe(false);
    expect(ogCardParamsSchema.safeParse({}).success).toBe(false);
  });
});

describe("buildOgCardData", () => {
  it("returns null when there is no card row (no votes yet)", () => {
    expect(buildOgCardData(PLAYER, null)).toBeNull();
  });

  it("shapes a finalized gold card with its tier colors and Spanish labels", () => {
    const result = buildOgCardData(PLAYER, baseCardRow());

    expect(result).not.toBeNull();
    expect(result?.card.ovr).toBe(78);
    expect(result?.positionLabel).toBe("Delantero centro");
    expect(result?.tierLabel).toBe("Oro");
    expect(result?.colors).toEqual({ from: "#fdce4e", to: "#d48300", fg: "#241100", accent: "#efa810" });
  });

  it("falls back to the grey provisional tier/label/colors when is_provisional is true, regardless of the stored tier", () => {
    const result = buildOgCardData(PLAYER, baseCardRow({ is_provisional: true, tier: "gold" }));

    expect(result?.card.isProvisional).toBe(true);
    expect(result?.tierLabel).toBe("Provisoria");
    expect(result?.colors).toEqual({ from: "#595e63", to: "#2f3338", fg: "#dedede", accent: "#6d7277" });
  });

  it("shapes a GK card (different face stat keys, no position-weighted DC label)", () => {
    const result = buildOgCardData(
      PLAYER,
      baseCardRow({ position: "POR", face: { div: 72, han: 68, kic: 55, ref: 74, spd: 60, pos: 70 } }),
    );

    expect(result?.card.face).toEqual({ kind: "gk", stats: { div: 72, han: 68, kic: 55, ref: 74, spd: 60, pos: 70 } });
    expect(result?.positionLabel).toBe("Portero");
  });
});
