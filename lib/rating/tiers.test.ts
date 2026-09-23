import { describe, expect, it } from "vitest";
import { defaultGroupSettings } from "@/lib/settings/group";
import { computeTier, isProvisional } from "./tiers";

const tiers = defaultGroupSettings.tiers; // silver 65, gold 75, special 85, special_on_mvp true

describe("computeTier", () => {
  it("classifies bronze/silver/gold/special by threshold", () => {
    expect(computeTier({ ovr: 64 }, tiers)).toBe("bronze");
    expect(computeTier({ ovr: 65 }, tiers)).toBe("silver");
    expect(computeTier({ ovr: 74 }, tiers)).toBe("silver");
    expect(computeTier({ ovr: 75 }, tiers)).toBe("gold");
    expect(computeTier({ ovr: 84 }, tiers)).toBe("gold");
    expect(computeTier({ ovr: 85 }, tiers)).toBe("special");
    expect(computeTier({ ovr: 99 }, tiers)).toBe("special");
    expect(computeTier({ ovr: 1 }, tiers)).toBe("bronze");
  });

  it("MVP of the last match promotes to special even below the OVR threshold", () => {
    expect(computeTier({ ovr: 70, wasMvpLastMatch: true }, tiers)).toBe("special");
    expect(computeTier({ ovr: 70, wasMvpLastMatch: false }, tiers)).toBe("silver"); // 70 is silver (65-74) without the MVP bump
  });

  it("respects special_on_last_match_mvp = false", () => {
    const noMvpOverride = { ...tiers, special_on_last_match_mvp: false };
    expect(computeTier({ ovr: 70, wasMvpLastMatch: true }, noMvpOverride)).toBe("silver");
  });
});

describe("isProvisional", () => {
  it("is provisional below min_raters, not at or above it", () => {
    expect(isProvisional(0, 3)).toBe(true);
    expect(isProvisional(2, 3)).toBe(true);
    expect(isProvisional(3, 3)).toBe(false);
    expect(isProvisional(10, 3)).toBe(false);
  });
});
