import { describe, expect, it } from "vitest";
import { GK_PLAYSTYLES, isPlayStyleCode, PLAYSTYLES } from "./playstyles";

describe("PLAYSTYLES", () => {
  it("has exactly 30 unique codes", () => {
    expect(PLAYSTYLES).toHaveLength(30);
    expect(new Set(PLAYSTYLES).size).toBe(30);
  });

  it("contains the GK-only subset", () => {
    for (const code of GK_PLAYSTYLES) {
      expect(PLAYSTYLES).toContain(code);
    }
  });
});

describe("isPlayStyleCode", () => {
  it("accepts known codes and rejects unknown strings", () => {
    expect(isPlayStyleCode("rapid")).toBe(true);
    expect(isPlayStyleCode("deflector")).toBe(true);
    expect(isPlayStyleCode("not_a_playstyle")).toBe(false);
  });
});
