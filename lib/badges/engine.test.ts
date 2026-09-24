import { describe, expect, it } from "vitest";
import {
  type BadgeCode,
  type MatchBadgeHistoryEntry,
  evaluateCardBadges,
  evaluateMatchBadges,
  evaluateTournamentBadges,
  isBadgeCode,
} from "./engine";

const NO_BADGES: ReadonlySet<BadgeCode> = new Set();

function entry(overrides: Partial<MatchBadgeHistoryEntry> & { matchId: string }): MatchBadgeHistoryEntry {
  return { goals: 0, assists: 0, cleanSheet: false, isMvp: false, result: "win", ...overrides };
}

describe("isBadgeCode", () => {
  it("accepts every catalog code and rejects unknown strings", () => {
    expect(isBadgeCode("first_match")).toBe(true);
    expect(isBadgeCode("gold_card")).toBe(true);
    expect(isBadgeCode("not_a_badge")).toBe(false);
  });
});

describe("evaluateMatchBadges", () => {
  it("returns nothing when badges_enabled is false", () => {
    const history = [entry({ matchId: "m1", goals: 5 })];
    expect(evaluateMatchBadges({ badgesEnabled: false, history, existingBadges: NO_BADGES })).toEqual([]);
  });

  it("returns nothing for an empty history (0 matches)", () => {
    expect(evaluateMatchBadges({ badgesEnabled: true, history: [], existingBadges: NO_BADGES })).toEqual([]);
  });

  it("awards first_match on exactly the 1st finalized match", () => {
    const history = [entry({ matchId: "m1" })];
    const awards = evaluateMatchBadges({ badgesEnabled: true, history, existingBadges: NO_BADGES });
    expect(awards).toContainEqual({ code: "first_match", matchId: "m1", increment: false });
  });

  it("does not re-award first_match on the 2nd match", () => {
    const history = [entry({ matchId: "m1" }), entry({ matchId: "m2" })];
    const awards = evaluateMatchBadges({ badgesEnabled: true, history, existingBadges: NO_BADGES });
    expect(awards.some((a) => a.code === "first_match")).toBe(false);
  });

  it("awards matches_10 and matches_50 exactly at those counts", () => {
    const at = (n: number) => Array.from({ length: n }, (_, i) => entry({ matchId: `m${i + 1}` }));
    expect(evaluateMatchBadges({ badgesEnabled: true, history: at(10), existingBadges: NO_BADGES })).toContainEqual({
      code: "matches_10",
      matchId: "m10",
      increment: false,
    });
    expect(evaluateMatchBadges({ badgesEnabled: true, history: at(9), existingBadges: NO_BADGES }).some((a) => a.code === "matches_10")).toBe(
      false,
    );
    expect(evaluateMatchBadges({ badgesEnabled: true, history: at(50), existingBadges: NO_BADGES })).toContainEqual({
      code: "matches_50",
      matchId: "m50",
      increment: false,
    });
  });

  it("awards first_goal only on the match where career goals go from 0 to >0", () => {
    const history = [entry({ matchId: "m1", goals: 0 }), entry({ matchId: "m2", goals: 1 })];
    const awards = evaluateMatchBadges({ badgesEnabled: true, history, existingBadges: NO_BADGES });
    expect(awards).toContainEqual({ code: "first_goal", matchId: "m2", increment: false });
    // Re-evaluating at m1 alone (goalless) must not award it.
    expect(evaluateMatchBadges({ badgesEnabled: true, history: [history[0]!], existingBadges: NO_BADGES }).some((a) => a.code === "first_goal")).toBe(
      false,
    );
  });

  it("awards goals_25 exactly on the crossing match and not again", () => {
    const before = entry({ matchId: "m1", goals: 24 });
    const crossing = entry({ matchId: "m2", goals: 1 });
    const awards = evaluateMatchBadges({ badgesEnabled: true, history: [before, crossing], existingBadges: NO_BADGES });
    expect(awards).toContainEqual({ code: "goals_25", matchId: "m2", increment: false });
    // Already holding it: guarded even if somehow re-evaluated at the same crossing.
    const guarded = evaluateMatchBadges({
      badgesEnabled: true,
      history: [before, crossing],
      existingBadges: new Set(["goals_25"]),
    });
    expect(guarded.some((a) => a.code === "goals_25")).toBe(false);
  });

  it("awards hat_trick every time (repeatable) a match has >= 3 goals", () => {
    const history = [entry({ matchId: "m1", goals: 3 })];
    expect(evaluateMatchBadges({ badgesEnabled: true, history, existingBadges: NO_BADGES })).toContainEqual({
      code: "hat_trick",
      matchId: "m1",
      increment: true,
    });
    const secondHatTrick = [...history, entry({ matchId: "m2", goals: 4 })];
    expect(evaluateMatchBadges({ badgesEnabled: true, history: secondHatTrick, existingBadges: NO_BADGES })).toContainEqual({
      code: "hat_trick",
      matchId: "m2",
      increment: true,
    });
  });

  it("does not award hat_trick on a 2-goal match", () => {
    const history = [entry({ matchId: "m1", goals: 2 })];
    expect(evaluateMatchBadges({ badgesEnabled: true, history, existingBadges: NO_BADGES }).some((a) => a.code === "hat_trick")).toBe(false);
  });

  it("awards assist_king (repeatable) on every match with >= 3 assists", () => {
    const history = [entry({ matchId: "m1", assists: 3 }), entry({ matchId: "m2", assists: 4 })];
    expect(evaluateMatchBadges({ badgesEnabled: true, history, existingBadges: new Set(["assist_king"]) })).toContainEqual({
      code: "assist_king",
      matchId: "m2",
      increment: true,
    });
  });

  it("does not award assist_king on a 2-assist match, whatever the career total", () => {
    const history = [entry({ matchId: "m1", assists: 20 }), entry({ matchId: "m2", assists: 2 })];
    expect(evaluateMatchBadges({ badgesEnabled: true, history, existingBadges: NO_BADGES }).some((a) => a.code === "assist_king")).toBe(false);
  });

  it("awards mvp every time (repeatable) and mvp_5 once at the 5th MVP", () => {
    const mvpMatches = (n: number) => Array.from({ length: n }, (_, i) => entry({ matchId: `m${i + 1}`, isMvp: true }));
    const awards1 = evaluateMatchBadges({ badgesEnabled: true, history: mvpMatches(1), existingBadges: NO_BADGES });
    expect(awards1).toContainEqual({ code: "mvp", matchId: "m1", increment: true });
    expect(awards1.some((a) => a.code === "mvp_5")).toBe(false);

    const awards5 = evaluateMatchBadges({ badgesEnabled: true, history: mvpMatches(5), existingBadges: NO_BADGES });
    expect(awards5).toContainEqual({ code: "mvp", matchId: "m5", increment: true });
    expect(awards5).toContainEqual({ code: "mvp_5", matchId: "m5", increment: false });
  });

  it("awards clean_sheet every time and clean_sheets_10 once at the 10th", () => {
    const csMatches = (n: number) => Array.from({ length: n }, (_, i) => entry({ matchId: `m${i + 1}`, cleanSheet: true }));
    const awards10 = evaluateMatchBadges({ badgesEnabled: true, history: csMatches(10), existingBadges: NO_BADGES });
    expect(awards10).toContainEqual({ code: "clean_sheet", matchId: "m10", increment: true });
    expect(awards10).toContainEqual({ code: "clean_sheets_10", matchId: "m10", increment: false });
  });

  it("awards streak_3_wins on the 3rd consecutive win and again on the 6th (repeatable)", () => {
    const wins = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => entry({ matchId: `m${offset + i + 1}` }));
    const threeWins = wins(3);
    expect(evaluateMatchBadges({ badgesEnabled: true, history: threeWins, existingBadges: NO_BADGES })).toContainEqual({
      code: "streak_3_wins",
      matchId: "m3",
      increment: true,
    });
    // 4th and 5th wins: not a fresh multiple of 3, no re-award.
    const fourWins = [...threeWins, entry({ matchId: "m4" })];
    expect(evaluateMatchBadges({ badgesEnabled: true, history: fourWins, existingBadges: NO_BADGES }).some((a) => a.code === "streak_3_wins")).toBe(
      false,
    );
    // 6th win: fresh multiple of 3 -> awarded again.
    const sixWins = wins(6);
    expect(evaluateMatchBadges({ badgesEnabled: true, history: sixWins, existingBadges: NO_BADGES })).toContainEqual({
      code: "streak_3_wins",
      matchId: "m6",
      increment: true,
    });
  });

  it("a draw breaks the win streak", () => {
    const history = [
      entry({ matchId: "m1" }),
      entry({ matchId: "m2" }),
      entry({ matchId: "m3", result: "draw" }),
      entry({ matchId: "m4" }),
      entry({ matchId: "m5" }),
    ];
    // Only 2 consecutive wins since the draw (m4, m5) -- no streak badge yet.
    expect(evaluateMatchBadges({ badgesEnabled: true, history, existingBadges: NO_BADGES }).some((a) => a.code === "streak_3_wins")).toBe(false);
  });

  it("a loss breaks the win streak", () => {
    const history = [
      entry({ matchId: "m1" }),
      entry({ matchId: "m2" }),
      entry({ matchId: "m3", result: "loss" }),
    ];
    expect(evaluateMatchBadges({ badgesEnabled: true, history, existingBadges: NO_BADGES }).some((a) => a.code === "streak_3_wins")).toBe(false);
  });

  it("handles a single-match history with every stat triggered at once", () => {
    const history = [entry({ matchId: "m1", goals: 3, assists: 1, cleanSheet: true, isMvp: true })];
    const awards = evaluateMatchBadges({ badgesEnabled: true, history, existingBadges: NO_BADGES });
    const codes = awards.map((a) => a.code).sort();
    expect(codes).toEqual(["clean_sheet", "first_goal", "first_match", "hat_trick", "mvp"].sort());
  });
});

describe("evaluateTournamentBadges", () => {
  it("returns nothing when badges_enabled is false", () => {
    expect(
      evaluateTournamentBadges({ badgesEnabled: false, tournamentId: "t1", championPlayerIds: ["p1", "p2"] }),
    ).toEqual([]);
  });

  it("awards tournament_champion (repeatable) to every player on the winning entry", () => {
    const awards = evaluateTournamentBadges({ badgesEnabled: true, tournamentId: "t1", championPlayerIds: ["p1", "p2"] });
    expect(awards).toEqual([
      { playerId: "p1", award: { code: "tournament_champion", tournamentId: "t1", increment: true } },
      { playerId: "p2", award: { code: "tournament_champion", tournamentId: "t1", increment: true } },
    ]);
  });

  it("returns nothing for an empty champion roster", () => {
    expect(evaluateTournamentBadges({ badgesEnabled: true, tournamentId: "t1", championPlayerIds: [] })).toEqual([]);
  });
});

describe("evaluateCardBadges", () => {
  it("returns nothing when badges_enabled is false", () => {
    expect(
      evaluateCardBadges({ badgesEnabled: false, tier: "gold", isProvisional: false, scoutingTargetCount: 10, existingBadges: NO_BADGES }),
    ).toEqual([]);
  });

  it("awards gold_card for a non-provisional gold or special card", () => {
    expect(
      evaluateCardBadges({ badgesEnabled: true, tier: "gold", isProvisional: false, scoutingTargetCount: 0, existingBadges: NO_BADGES }),
    ).toContainEqual({ code: "gold_card", increment: false });
    expect(
      evaluateCardBadges({ badgesEnabled: true, tier: "special", isProvisional: false, scoutingTargetCount: 0, existingBadges: NO_BADGES }),
    ).toContainEqual({ code: "gold_card", increment: false });
  });

  it("does not award gold_card while the card is provisional, even at gold OVR", () => {
    const awards = evaluateCardBadges({
      badgesEnabled: true,
      tier: "gold",
      isProvisional: true,
      scoutingTargetCount: 0,
      existingBadges: NO_BADGES,
    });
    expect(awards.some((a) => a.code === "gold_card")).toBe(false);
  });

  it("does not re-award gold_card once already held", () => {
    const awards = evaluateCardBadges({
      badgesEnabled: true,
      tier: "gold",
      isProvisional: false,
      scoutingTargetCount: 0,
      existingBadges: new Set(["gold_card"]),
    });
    expect(awards.some((a) => a.code === "gold_card")).toBe(false);
  });

  it("does not award gold_card for bronze/silver tiers", () => {
    const awards = evaluateCardBadges({
      badgesEnabled: true,
      tier: "silver",
      isProvisional: false,
      scoutingTargetCount: 0,
      existingBadges: NO_BADGES,
    });
    expect(awards.some((a) => a.code === "gold_card")).toBe(false);
  });

  it("awards scout_10 once at 10 distinct scouted targets", () => {
    const nine = evaluateCardBadges({
      badgesEnabled: true,
      tier: "bronze",
      isProvisional: true,
      scoutingTargetCount: 9,
      existingBadges: NO_BADGES,
    });
    expect(nine.some((a) => a.code === "scout_10")).toBe(false);

    const ten = evaluateCardBadges({
      badgesEnabled: true,
      tier: "bronze",
      isProvisional: true,
      scoutingTargetCount: 10,
      existingBadges: NO_BADGES,
    });
    expect(ten).toContainEqual({ code: "scout_10", increment: false });
  });

  it("can award both gold_card and scout_10 in the same call", () => {
    const awards = evaluateCardBadges({
      badgesEnabled: true,
      tier: "special",
      isProvisional: false,
      scoutingTargetCount: 12,
      existingBadges: NO_BADGES,
    });
    expect(awards.map((a) => a.code).sort()).toEqual(["gold_card", "scout_10"]);
  });
});
