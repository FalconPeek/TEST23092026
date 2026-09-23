import { describe, expect, it } from "vitest";
import { toCardProps, type CardRow } from "./to-card-props";

const PLAYER = { displayName: "Juan Pérez", avatarUrl: null };
const LABELS = { rapid: "Rápido", flair: "Talento" };

const outfieldFace = { pac: 80, sho: 65, pas: 70, dri: 75, def: 50, phy: 68 };
const gkFace = { div: 72, han: 68, kic: 55, ref: 74, spd: 60, pos: 70 };

function baseCardRow(overrides: Partial<CardRow> = {}): CardRow {
  return {
    ovr: 78,
    position: "DC",
    tier: "gold",
    is_provisional: false,
    face: outfieldFace,
    playstyles: [{ code: "rapid", plus: true }],
    weak_foot: 4,
    skill_moves: 3,
    ...overrides,
  };
}

describe("toCardProps", () => {
  it("returns null when there is no card row", () => {
    expect(toCardProps(PLAYER, null, LABELS)).toBeNull();
  });

  it("maps an outfield card row", () => {
    const result = toCardProps(PLAYER, baseCardRow(), LABELS);

    expect(result).not.toBeNull();
    expect(result?.face).toEqual({ kind: "outfield", stats: outfieldFace });
    expect(result?.position).toBe("DC");
    expect(result?.tier).toBe("gold");
    expect(result?.ovr).toBe(78);
    expect(result?.playStyles).toEqual([{ code: "rapid", label: "Rápido", plus: true }]);
  });

  it("maps a GK card row", () => {
    const result = toCardProps(PLAYER, baseCardRow({ position: "POR", face: gkFace }), LABELS);

    expect(result).not.toBeNull();
    expect(result?.face).toEqual({ kind: "gk", stats: gkFace });
    expect(result?.position).toBe("POR");
  });

  it("returns null for malformed face jsonb", () => {
    const result = toCardProps(PLAYER, baseCardRow({ face: { foo: "bar" } }), LABELS);
    expect(result).toBeNull();
  });

  it("returns null for an invalid position", () => {
    const result = toCardProps(PLAYER, baseCardRow({ position: "GOALKEEPER" }), LABELS);
    expect(result).toBeNull();
  });

  it("returns null for an invalid tier", () => {
    const result = toCardProps(PLAYER, baseCardRow({ tier: "diamond" }), LABELS);
    expect(result).toBeNull();
  });

  it("defaults null star votes to 3 and clamps out-of-range values", () => {
    const result = toCardProps(PLAYER, baseCardRow({ weak_foot: null, skill_moves: 7 }), LABELS);

    expect(result?.weakFoot).toBe(3);
    expect(result?.skillMoves).toBe(5);
  });

  it("drops playstyle codes that aren't recognized and falls back to the raw code as label", () => {
    const result = toCardProps(
      PLAYER,
      baseCardRow({ playstyles: [{ code: "rapid", plus: false }, { code: "not_a_real_code", plus: true }] }),
      LABELS,
    );

    expect(result?.playStyles).toEqual([{ code: "rapid", label: "Rápido", plus: false }]);
  });

  it("falls back to the raw code when no label is provided for a known playstyle", () => {
    const result = toCardProps(
      PLAYER,
      baseCardRow({ playstyles: [{ code: "technical", plus: false }] }),
      LABELS,
    );

    expect(result?.playStyles).toEqual([{ code: "technical", label: "technical", plus: false }]);
  });
});
