import { describe, expect, it } from "vitest";
import { defaultGroupSettings } from "@/lib/settings/group";
import { buildPlayerCard, computePlayStyles, computeStarRating, finalizeAttributeValue } from "./card";
import { computeOvr } from "./positions";

const settings = defaultGroupSettings;

describe("finalizeAttributeValue", () => {
  it("rounds and clamps base+form with no previous value (first snapshot, no rate limit)", () => {
    expect(finalizeAttributeValue({ base: 60.4, form: 2.4 }, settings.rating)).toBe(63); // round(62.8) = 63
    expect(finalizeAttributeValue({ base: 98, form: 5 }, settings.rating)).toBe(99);
    expect(finalizeAttributeValue({ base: 2, form: -5 }, settings.rating)).toBe(1);
  });

  it("rate-limits against a previous snapshot", () => {
    // raw = round(75) = 75, previous 60 -> delta 15 capped to per_match (2).
    expect(finalizeAttributeValue({ base: 75, previousValue: 60 }, settings.rating)).toBe(62);
  });
});

describe("computeStarRating", () => {
  it("defaults to 3 with no votes", () => {
    expect(computeStarRating([])).toBe(3);
  });

  it("rounds the median and clamps to 1-5", () => {
    expect(computeStarRating([4, 4, 5])).toBe(4);
    expect(computeStarRating([1, 1])).toBe(1);
  });
});

describe("computePlayStyles", () => {
  const ps = settings.playstyles; // show_ratio .4, plus_ratio .7, plus_min_raters 5, max_on_card 3

  it("returns nothing with 0 raters or 0 votes", () => {
    expect(computePlayStyles([], 10, ps)).toEqual([]);
    expect(computePlayStyles([{ code: "x", raterId: "r1" }], 0, ps)).toEqual([]);
  });

  it("shows a code once it reaches show_ratio, without plus below plus_ratio", () => {
    // 4/10 = 0.4 = show_ratio exactly
    const votes = Array.from({ length: 4 }, (_, i) => ({ code: "sniper", raterId: `r${i}` }));
    expect(computePlayStyles(votes, 10, ps)).toEqual([{ code: "sniper", plus: false }]);
  });

  it("does not show a code below show_ratio", () => {
    const votes = Array.from({ length: 3 }, (_, i) => ({ code: "sniper", raterId: `r${i}` }));
    expect(computePlayStyles(votes, 10, ps)).toEqual([]);
  });

  it("requires both plus_ratio and plus_min_raters for the '+' badge", () => {
    // 4/5 = 0.8 ratio (>= plus_ratio) but only 4 distinct raters (< plus_min_raters 5) -> no plus.
    const votes = Array.from({ length: 4 }, (_, i) => ({ code: "sniper", raterId: `r${i}` }));
    expect(computePlayStyles(votes, 5, ps)).toEqual([{ code: "sniper", plus: false }]);
  });

  it("grants plus once ratio and rater count both qualify", () => {
    const votes = Array.from({ length: 7 }, (_, i) => ({ code: "sniper", raterId: `r${i}` }));
    expect(computePlayStyles(votes, 9, ps)).toEqual([{ code: "sniper", plus: true }]); // 7/9 = .778
  });

  it("counts a rater once even with duplicate votes for the same code", () => {
    const votes = [
      { code: "sniper", raterId: "r1" },
      { code: "sniper", raterId: "r1" },
      { code: "sniper", raterId: "r2" },
    ];
    // 2 distinct raters / 4 total = 0.5, above show_ratio.
    expect(computePlayStyles(votes, 4, ps)).toEqual([{ code: "sniper", plus: false }]);
  });

  it("sorts by ratio desc, ties by code asc, and caps at max_on_card", () => {
    const votes = [
      ...Array.from({ length: 5 }, (_, i) => ({ code: "b", raterId: `b${i}` })),
      ...Array.from({ length: 5 }, (_, i) => ({ code: "a", raterId: `a${i}` })),
      ...Array.from({ length: 8 }, (_, i) => ({ code: "c", raterId: `c${i}` })),
      ...Array.from({ length: 4 }, (_, i) => ({ code: "d", raterId: `d${i}` })), // ratio .4, would qualify but gets capped out
    ];
    const result = computePlayStyles(votes, 10, ps);
    expect(result).toHaveLength(3); // capped at max_on_card even though 4 codes qualify
    expect(result.map((r) => r.code)).toEqual(["c", "a", "b"]); // c highest ratio, then a/b tied -> code asc, d drops off
  });
});

describe("buildPlayerCard", () => {
  it("builds a provisional outfield card with correct OVR, tier and face stats", () => {
    const attributes = { finishing: 90 };
    const card = buildPlayerCard(
      {
        attributes,
        primaryPosition: "DC",
        nDistinctRaters: 2, // < min_raters (3)
        weakFootVotes: [4, 4],
        skillMovesVotes: [],
        playStyleVotes: [],
        totalPlaystyleRaters: 0,
      },
      settings,
    );

    expect(card.isProvisional).toBe(true);
    expect(card.isGk).toBe(false);
    expect(card.ovr).toBe(computeOvr("DC", attributes, settings.rating.default_mean));
    expect(card.faceStats).toHaveProperty("sho");
    expect(card.weakFoot).toBe(4);
    expect(card.skillMoves).toBe(3); // no votes -> default
    expect(card.playStyles).toEqual([]);
  });

  it("builds a GK card with DIV/HAN/KIC/REF/POS/SPD face stats", () => {
    const card = buildPlayerCard(
      {
        attributes: { gk_reflexes: 80 },
        primaryPosition: "POR",
        nDistinctRaters: 5,
        weakFootVotes: [],
        skillMovesVotes: [],
        playStyleVotes: [],
        totalPlaystyleRaters: 0,
      },
      settings,
    );
    expect(card.isGk).toBe(true);
    expect(Object.keys(card.faceStats).sort()).toEqual(["div", "han", "kic", "pos", "ref", "spd"]);
    expect(card.faceStats).toHaveProperty("ref", 80);
    expect(card.isProvisional).toBe(false);
  });

  it("classifies special tier from OVR threshold or last-match MVP", () => {
    const highOvrAttrs = Object.fromEntries(
      ["finishing", "positioning", "shot_power", "heading", "strength", "composure", "reactions", "volleys", "penalties"].map((a) => [
        a,
        99,
      ]),
    );
    const eliteCard = buildPlayerCard(
      { attributes: highOvrAttrs, primaryPosition: "DC", nDistinctRaters: 5, weakFootVotes: [], skillMovesVotes: [], playStyleVotes: [], totalPlaystyleRaters: 0 },
      settings,
    );
    expect(eliteCard.ovr).toBeGreaterThanOrEqual(settings.tiers.special_min);
    expect(eliteCard.tier).toBe("special");

    const mvpCard = buildPlayerCard(
      { attributes: {}, primaryPosition: "DC", nDistinctRaters: 5, weakFootVotes: [], skillMovesVotes: [], playStyleVotes: [], totalPlaystyleRaters: 0, wasMvpLastMatch: true },
      settings,
    );
    expect(mvpCard.tier).toBe("special");
  });

  it("exposes ovrByPosition for every one of the 15 positions", () => {
    const card = buildPlayerCard(
      { attributes: {}, primaryPosition: "MC", nDistinctRaters: 5, weakFootVotes: [], skillMovesVotes: [], playStyleVotes: [], totalPlaystyleRaters: 0 },
      settings,
    );
    expect(Object.keys(card.ovrByPosition)).toHaveLength(15);
    expect(card.ovrByPosition.MC).toBe(card.ovr);
  });
});
