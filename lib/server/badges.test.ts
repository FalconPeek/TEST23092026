import { describe, expect, it } from "vitest";
import type { BadgeAward, BadgeCode, MatchBadgeHistoryEntry } from "@/lib/badges/engine";
import { awardAmendmentBadges, awardCardBadges, awardMatchBadges, awardMatchBadgesForPlayer, awardTournamentBadges } from "./badges";
import type { BadgesRepo } from "./badges-repo";

class FakeBadgesRepo implements BadgesRepo {
  history = new Map<string, MatchBadgeHistoryEntry[]>();
  existing = new Map<string, Set<BadgeCode>>();
  scoutingTargetCounts = new Map<string, number>();
  saved: { playerId: string; awards: BadgeAward[] }[] = [];

  async loadPlayerMatchHistory(playerId: string) {
    return this.history.get(playerId) ?? [];
  }
  async loadExistingBadgeCodes(playerId: string) {
    return this.existing.get(playerId) ?? new Set<BadgeCode>();
  }
  async loadScoutingTargetCount(playerId: string) {
    return this.scoutingTargetCounts.get(playerId) ?? 0;
  }
  async saveAwards(playerId: string, awards: BadgeAward[]) {
    this.saved.push({ playerId, awards });
    const set = this.existing.get(playerId) ?? new Set<BadgeCode>();
    for (const a of awards) if (!a.increment) set.add(a.code);
    this.existing.set(playerId, set);
  }
}

function entry(overrides: Partial<MatchBadgeHistoryEntry> & { matchId: string }): MatchBadgeHistoryEntry {
  return { goals: 0, assists: 0, cleanSheet: false, isMvp: false, result: "win", ...overrides };
}

describe("awardMatchBadgesForPlayer", () => {
  it("returns nothing when badges_enabled is false, without touching the repo's history", async () => {
    const repo = new FakeBadgesRepo();
    repo.history.set("p1", [entry({ matchId: "m1" })]);
    const awards = await awardMatchBadgesForPlayer(repo, "p1", false);
    expect(awards).toEqual([]);
    expect(repo.saved).toEqual([]);
  });

  it("returns nothing for a player with no match history (0 matches)", async () => {
    const repo = new FakeBadgesRepo();
    const awards = await awardMatchBadgesForPlayer(repo, "p1", true);
    expect(awards).toEqual([]);
    expect(repo.saved).toEqual([]);
  });

  it("awards and persists first_match on a player's 1st finalized match", async () => {
    const repo = new FakeBadgesRepo();
    repo.history.set("p1", [entry({ matchId: "m1" })]);
    const awards = await awardMatchBadgesForPlayer(repo, "p1", true);
    expect(awards).toEqual([{ playerId: "p1", code: "first_match", matchId: "m1", tournamentId: undefined }]);
    expect(repo.saved).toEqual([{ playerId: "p1", awards: [{ code: "first_match", matchId: "m1", increment: false }] }]);
  });

  it("does not persist anything when no threshold is crossed", async () => {
    const repo = new FakeBadgesRepo();
    repo.history.set("p1", [entry({ matchId: "m1" }), entry({ matchId: "m2" })]);
    const awards = await awardMatchBadgesForPlayer(repo, "p1", true);
    expect(awards).toEqual([]);
    expect(repo.saved).toEqual([]);
  });
});

describe("awardMatchBadges (roster fan-out)", () => {
  it("evaluates every player independently", async () => {
    const repo = new FakeBadgesRepo();
    repo.history.set("p1", [entry({ matchId: "m1", goals: 3 })]);
    repo.history.set("p2", [entry({ matchId: "m1", cleanSheet: true })]);
    const awards = await awardMatchBadges(repo, ["p1", "p2"], true);
    const codesByPlayer = new Map(["p1", "p2"].map((id) => [id, awards.filter((a) => a.playerId === id).map((a) => a.code).sort()]));
    expect(codesByPlayer.get("p1")).toEqual(["first_goal", "first_match", "hat_trick"]);
    expect(codesByPlayer.get("p2")).toEqual(["clean_sheet", "first_match"]);
  });

  it("returns nothing for an empty roster", async () => {
    const repo = new FakeBadgesRepo();
    expect(await awardMatchBadges(repo, [], true)).toEqual([]);
  });
});

describe("awardTournamentBadges", () => {
  it("awards tournament_champion to every player on the winning entry", async () => {
    const repo = new FakeBadgesRepo();
    const awards = await awardTournamentBadges(repo, ["p1", "p2"], "t1", true);
    expect(awards).toEqual([
      { playerId: "p1", code: "tournament_champion", tournamentId: "t1" },
      { playerId: "p2", code: "tournament_champion", tournamentId: "t1" },
    ]);
    expect(repo.saved).toEqual([
      { playerId: "p1", awards: [{ code: "tournament_champion", tournamentId: "t1", increment: true }] },
      { playerId: "p2", awards: [{ code: "tournament_champion", tournamentId: "t1", increment: true }] },
    ]);
  });

  it("respects badges_enabled = false", async () => {
    const repo = new FakeBadgesRepo();
    expect(await awardTournamentBadges(repo, ["p1"], "t1", false)).toEqual([]);
    expect(repo.saved).toEqual([]);
  });
});

describe("awardCardBadges", () => {
  it("awards gold_card for a non-provisional gold card", async () => {
    const repo = new FakeBadgesRepo();
    const awards = await awardCardBadges(repo, "p1", "gold", false, true);
    expect(awards).toEqual([{ playerId: "p1", code: "gold_card" }]);
  });

  it("awards scout_10 once the repo reports 10 distinct scouted targets", async () => {
    const repo = new FakeBadgesRepo();
    repo.scoutingTargetCounts.set("p1", 10);
    const awards = await awardCardBadges(repo, "p1", "bronze", true, true);
    expect(awards).toEqual([{ playerId: "p1", code: "scout_10" }]);
  });

  it("does not re-award a badge the player already holds", async () => {
    const repo = new FakeBadgesRepo();
    repo.existing.set("p1", new Set(["gold_card"]));
    const awards = await awardCardBadges(repo, "p1", "gold", false, true);
    expect(awards).toEqual([]);
    expect(repo.saved).toEqual([]);
  });

  it("respects badges_enabled = false", async () => {
    const repo = new FakeBadgesRepo();
    expect(await awardCardBadges(repo, "p1", "gold", false, false)).toEqual([]);
  });
});

describe("awardAmendmentBadges", () => {
  it("awards and persists badges earned through an amendment, per amended player", async () => {
    const repo = new FakeBadgesRepo();
    repo.history.set("p1", [entry({ matchId: "m1", goals: 3 })]);
    repo.history.set("p2", [entry({ matchId: "m1", goals: 0 })]);
    const awards = await awardAmendmentBadges(
      repo,
      "m1",
      [
        { playerId: "p1", before: { goals: 0, assists: 0 } },
        { playerId: "p2", before: { goals: 0, assists: 0 } },
      ],
      true,
    );
    expect(awards.map((a) => `${a.playerId}:${a.code}`).sort()).toEqual(["p1:first_goal", "p1:hat_trick"]);
    expect(repo.saved.map((s) => s.playerId)).toEqual(["p1"]);
  });

  it("does nothing when badges are disabled", async () => {
    const repo = new FakeBadgesRepo();
    repo.history.set("p1", [entry({ matchId: "m1", goals: 3 })]);
    expect(await awardAmendmentBadges(repo, "m1", [{ playerId: "p1", before: { goals: 0, assists: 0 } }], false)).toEqual([]);
    expect(repo.saved).toEqual([]);
  });
});
