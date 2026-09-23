import { describe, expect, it } from "vitest";
import { aggregateAttribute } from "@/lib/rating";
import type { AttributeKey, CollusionPair, RaterStat } from "@/lib/rating";
import { defaultGroupSettings, type GroupSettings } from "@/lib/settings/group";
import { drainRecomputeQueue, recomputeGroupRaterStats, recomputePlayer } from "./recompute";
import type {
  GroupScoutingVote,
  PlayerInfo,
  PlayerRatingContext,
  QueueEntry,
  RatingRepo,
  SavePlayerCardInput,
  TargetVotes,
} from "./rating-repo";

const GROUP_ID = "group-1";
const EMPTY_TARGET_VOTES: TargetVotes = { scouting: [], playstyle: [], weakFootVotes: [], skillMovesVotes: [] };
const EMPTY_CONTEXT: PlayerRatingContext = { previousAttributes: {}, history30d: [] };

/** In-memory RatingRepo double. Seed the maps directly per test; savePlayerCard/saveRaterStats
 * feed back into the maps so a second recompute call in the same test sees "previous" state,
 * mirroring how the real Postgres-backed repo behaves across calls. */
class FakeRepo implements RatingRepo {
  settings = new Map<string, GroupSettings>();
  players = new Map<string, PlayerInfo>();
  targetVotes = new Map<string, TargetVotes>();
  groupScoutingVotes = new Map<string, GroupScoutingVote[]>();
  groupAttributeRatings = new Map<string, Map<string, Partial<Record<AttributeKey, number>>>>();
  raterStatsByGroup = new Map<string, Map<string, RaterStat>>();
  collusionByGroup = new Map<string, Set<string>>();
  contexts = new Map<string, PlayerRatingContext>();
  mvp = new Set<string>();
  queue: QueueEntry[] = [];
  failLoadPlayerFor = new Set<string>();

  savedCards = new Map<string, SavePlayerCardInput>();
  dequeuedCalls: string[][] = [];

  async loadGroupSettings(groupId: string) {
    return this.settings.get(groupId) ?? defaultGroupSettings;
  }

  async loadPlayer(playerId: string) {
    if (this.failLoadPlayerFor.has(playerId)) throw new Error(`boom: ${playerId}`);
    return this.players.get(playerId) ?? null;
  }

  async loadTargetVotes(_groupId: string, targetId: string) {
    return this.targetVotes.get(targetId) ?? EMPTY_TARGET_VOTES;
  }

  async loadGroupScoutingVotes(groupId: string) {
    return this.groupScoutingVotes.get(groupId) ?? [];
  }

  async loadGroupAttributeRatings(groupId: string) {
    return this.groupAttributeRatings.get(groupId) ?? new Map();
  }

  async loadRaterStats(groupId: string) {
    return this.raterStatsByGroup.get(groupId) ?? new Map();
  }

  async loadCollusionFlags(groupId: string) {
    return this.collusionByGroup.get(groupId) ?? new Set();
  }

  async loadPlayerRatingContext(playerId: string) {
    return this.contexts.get(playerId) ?? EMPTY_CONTEXT;
  }

  async wasMvpLastMatch(playerId: string) {
    return this.mvp.has(playerId);
  }

  async saveRaterStats(groupId: string, stats: RaterStat[]) {
    const map = new Map<string, RaterStat>();
    for (const s of stats) map.set(s.raterId, s);
    this.raterStatsByGroup.set(groupId, map);
  }

  async replaceCollusionFlags(groupId: string, pairs: CollusionPair[]) {
    this.collusionByGroup.set(groupId, new Set(pairs.map((p) => `${p.raterId}|${p.targetId}`)));
  }

  async savePlayerCard(input: SavePlayerCardInput) {
    this.savedCards.set(input.playerId, input);

    const previousAttributes: Partial<Record<AttributeKey, number>> = {};
    for (const row of input.attributes) previousAttributes[row.attribute] = row.value;
    this.contexts.set(input.playerId, {
      previousAttributes,
      previousOvr: input.card.ovr,
      history30d: this.contexts.get(input.playerId)?.history30d ?? [],
    });

    this.queue = this.queue.filter((q) => q.playerId !== input.playerId);
  }

  async loadQueueBatch(limit: number) {
    return this.queue.slice(0, limit);
  }

  async deleteFromQueue(playerIds: string[]) {
    this.dequeuedCalls.push(playerIds);
    this.queue = this.queue.filter((q) => !playerIds.includes(q.playerId));
  }
}

function makePlayer(id: string, overrides: Partial<PlayerInfo> = {}): PlayerInfo {
  return { id, groupId: GROUP_ID, primaryPosition: "MC", ...overrides };
}

describe("recomputePlayer", () => {
  it("stays provisional below min_raters and uses the group default mean with zero votes", async () => {
    const repo = new FakeRepo();
    repo.players.set("p1", makePlayer("p1"));
    // Two distinct raters, below the default min_raters (3).
    repo.targetVotes.set("p1", {
      scouting: [
        { raterId: "r1", attribute: "finishing", mode: "detailed", value: 8, createdAt: new Date(), raterRole: "player" },
        { raterId: "r2", attribute: "finishing", mode: "detailed", value: 7, createdAt: new Date(), raterRole: "player" },
      ],
      playstyle: [],
      weakFootVotes: [],
      skillMovesVotes: [],
    });

    await recomputePlayer(repo, "p1", new Date());

    const saved = repo.savedCards.get("p1");
    expect(saved).toBeDefined();
    expect(saved!.card.isProvisional).toBe(true);
    expect(saved!.nDistinctRaters).toBe(2);
    // Sub-attributes nobody voted on fall back fully to the group default mean (60), so OVR
    // (a weighted average of values that are all 60) is exactly 60.
    expect(saved!.card.ovr).toBe(60);
  });

  it("expands a quick face-stat vote to every one of its sub-attributes", async () => {
    const repo = new FakeRepo();
    repo.players.set("p1", makePlayer("p1"));
    repo.targetVotes.set("p1", {
      scouting: [{ raterId: "r1", attribute: "pas", mode: "quick", value: 8, createdAt: new Date(), raterRole: "player" }],
      playstyle: [],
      weakFootVotes: [],
      skillMovesVotes: [],
    });

    await recomputePlayer(repo, "p1", new Date());

    const saved = repo.savedCards.get("p1")!;
    const pasSubAttributes: AttributeKey[] = ["short_passing", "vision", "crossing", "long_passing", "curve", "free_kick"];
    for (const attr of pasSubAttributes) {
      const row = saved.attributes.find((a) => a.attribute === attr);
      expect(row, `expected a saved row for ${attr}`).toBeDefined();
      expect(row!.nVotes).toBe(1);
    }
    // Untouched sub-attributes got no votes.
    const untouched = saved.attributes.find((a) => a.attribute === "sliding_tackle");
    expect(untouched!.nVotes).toBe(0);
  });

  it("caps a large jump against the previous snapshot at rate_limit.per_match", async () => {
    const repo = new FakeRepo();
    repo.players.set("p1", makePlayer("p1"));
    repo.contexts.set("p1", { previousAttributes: { finishing: 50 }, history30d: [] });
    repo.targetVotes.set("p1", {
      scouting: Array.from({ length: 20 }, (_, i) => ({
        raterId: `r${i}`,
        attribute: "finishing" as const,
        mode: "detailed" as const,
        value: 10,
        createdAt: new Date(),
        raterRole: "player" as const,
      })),
      playstyle: [],
      weakFootVotes: [],
      skillMovesVotes: [],
    });

    await recomputePlayer(repo, "p1", new Date());

    const saved = repo.savedCards.get("p1")!;
    const finishing = saved.attributes.find((a) => a.attribute === "finishing")!;
    // Unclamped base would be far above 50 + 2; rate_limit.per_match (default 2) caps it.
    expect(finishing.value).toBe(52);
  });

  it("does not rate-limit the very first card (no previous snapshot to limit against)", async () => {
    const repo = new FakeRepo();
    repo.players.set("p1", makePlayer("p1"));
    // No repo.contexts entry for "p1" -> previousAttributes/previousOvr are both absent.
    repo.targetVotes.set("p1", {
      scouting: Array.from({ length: 20 }, (_, i) => ({
        raterId: `r${i}`,
        attribute: "finishing" as const,
        mode: "detailed" as const,
        value: 10,
        createdAt: new Date(),
        raterRole: "player" as const,
      })),
      playstyle: [],
      weakFootVotes: [],
      skillMovesVotes: [],
    });

    await recomputePlayer(repo, "p1", new Date());

    const saved = repo.savedCards.get("p1")!;
    const finishing = saved.attributes.find((a) => a.attribute === "finishing")!;
    // Same votes as the rate-limit test above, but with no previous snapshot the per_match cap
    // (which would otherwise stop this at 52) must not apply: round(90.43...) = 90.
    expect(finishing.value).toBe(90);
    expect(saved.changed).toBe(true); // first-ever snapshot always counts as a change
  });

  it("only writes attribute_history (changed=true) when something actually moved", async () => {
    const repo = new FakeRepo();
    repo.players.set("p1", makePlayer("p1"));
    repo.targetVotes.set("p1", {
      scouting: [{ raterId: "r1", attribute: "finishing", mode: "detailed", value: 8, createdAt: new Date(), raterRole: "player" }],
      playstyle: [],
      weakFootVotes: [],
      skillMovesVotes: [],
    });

    const now = new Date();
    await recomputePlayer(repo, "p1", now);
    expect(repo.savedCards.get("p1")!.changed).toBe(true); // first-ever snapshot

    // Re-run with identical inputs; FakeRepo.savePlayerCard already folded the result back into
    // contexts, so the second pass should compute the exact same values -> no change.
    await recomputePlayer(repo, "p1", now);
    expect(repo.savedCards.get("p1")!.changed).toBe(false);
  });

  it("gives a GK target GK face stats and only GK attribute rows", async () => {
    const repo = new FakeRepo();
    repo.players.set("gk1", makePlayer("gk1", { primaryPosition: "POR" }));
    repo.targetVotes.set("gk1", {
      scouting: [
        { raterId: "r1", attribute: "gk_reflexes", mode: "detailed", value: 9, createdAt: new Date(), raterRole: "player" },
        { raterId: "r2", attribute: "gk_reflexes", mode: "detailed", value: 8, createdAt: new Date(), raterRole: "player" },
      ],
      playstyle: [],
      weakFootVotes: [],
      skillMovesVotes: [],
    });

    await recomputePlayer(repo, "gk1", new Date());

    const saved = repo.savedCards.get("gk1")!;
    expect(saved.card.faceStats).toEqual(expect.objectContaining({ div: expect.any(Number), ref: expect.any(Number), spd: expect.any(Number) }));
    expect(Object.keys(saved.card.faceStats).sort()).toEqual(["div", "han", "kic", "pos", "ref", "spd"]);
    expect(saved.attributes.map((a) => a.attribute).sort()).toEqual(
      ["gk_diving", "gk_handling", "gk_kicking", "gk_positioning", "gk_reflexes"].sort(),
    );
  });
});

describe("recomputeGroupRaterStats (regression: bug where fresh groups got phantom bias)", () => {
  it("does not manufacture bias for 3 agreeing raters in a brand-new group", async () => {
    const now = new Date();
    const repo = new FakeRepo();
    repo.players.set("p1", makePlayer("p1", { primaryPosition: "DC" }));

    // 3 raters, 3 raw quick-mode ballots each (pac/sho/def) -> 9 raw ballots total, well below
    // bias_min_votes (10) for any single rater, even though each ballot expands into several
    // sub-attribute residuals.
    const raw: GroupScoutingVote[] = [
      { raterId: "r1", targetId: "p1", attribute: "pac", mode: "quick", value: 8, createdAt: now, raterRole: "player" },
      { raterId: "r2", targetId: "p1", attribute: "pac", mode: "quick", value: 8, createdAt: now, raterRole: "player" },
      { raterId: "r3", targetId: "p1", attribute: "pac", mode: "quick", value: 9, createdAt: now, raterRole: "player" },
      { raterId: "r1", targetId: "p1", attribute: "sho", mode: "quick", value: 9, createdAt: now, raterRole: "player" },
      { raterId: "r2", targetId: "p1", attribute: "sho", mode: "quick", value: 9, createdAt: now, raterRole: "player" },
      { raterId: "r3", targetId: "p1", attribute: "sho", mode: "quick", value: 10, createdAt: now, raterRole: "player" },
      { raterId: "r1", targetId: "p1", attribute: "def", mode: "quick", value: 3, createdAt: now, raterRole: "player" },
      { raterId: "r2", targetId: "p1", attribute: "def", mode: "quick", value: 3, createdAt: now, raterRole: "player" },
      { raterId: "r3", targetId: "p1", attribute: "def", mode: "quick", value: 4, createdAt: now, raterRole: "player" },
    ];
    repo.groupScoutingVotes.set(GROUP_ID, raw);
    repo.targetVotes.set("p1", {
      scouting: raw.map(({ raterId, attribute, mode, value, createdAt, raterRole }) => ({ raterId, attribute, mode, value, createdAt, raterRole })),
      playstyle: [],
      weakFootVotes: [],
      skillMovesVotes: [],
    });

    await recomputeGroupRaterStats(repo, GROUP_ID, now);
    for (const stat of repo.raterStatsByGroup.get(GROUP_ID)!.values()) {
      expect(stat.bias).toBe(0);
      expect(stat.reliability).toBe(1);
    }

    await recomputePlayer(repo, "p1", now);
    const saved = repo.savedCards.get("p1")!;

    // Expected = plain shrinkage of the raw votes with no bias/reliability adjustment (same
    // pure aggregateAttribute the pipeline itself calls), i.e. what a correct fresh-group
    // computation should produce. pac/sho/def each fan out to sub-attributes that all receive
    // the exact same votes, so the face stat (a weighted average of identical numbers) equals
    // that single finalized value exactly.
    const expected = (value8: number, value9: number) =>
      Math.round(
        aggregateAttribute(
          [
            { raterId: "r1", value: value8, createdAt: now, raterRole: "player" as const },
            { raterId: "r2", value: value8, createdAt: now, raterRole: "player" as const },
            { raterId: "r3", value: value9, createdAt: now, raterRole: "player" as const },
          ],
          { now, settings: defaultGroupSettings.rating, targetId: "p1", groupMean: defaultGroupSettings.rating.default_mean },
        ).value,
      );

    // Floating-point weighted sums of identical sub-attribute values (0.55x+0.45x etc.) can be
    // off by a ULP or two from the plain integer, so compare numerically rather than by identity.
    expect(saved.card.faceStats.pac).toBeCloseTo(expected(8, 9), 9);
    expect(saved.card.faceStats.sho).toBeCloseTo(expected(9, 10), 9);
    expect(saved.card.faceStats.def).toBeCloseTo(expected(3, 4), 9);
  });

  it("gives a consistently +2-above-peers rater a positive bias once they clear bias_min_votes, and it gets subtracted", async () => {
    const now = new Date();
    const repo = new FakeRepo();

    // 10 different targets, 3 raters voting "finishing" (detailed) on each: r1 always votes 2
    // points above r2/r3 (who agree with each other) -> r1 accrues 10 raw ballots, one per
    // target, clearing bias_min_votes.
    const raw: GroupScoutingVote[] = [];
    for (let i = 0; i < 10; i += 1) {
      const targetId = `t${i}`;
      raw.push({ raterId: "r1", targetId, attribute: "finishing", mode: "detailed", value: 8, createdAt: now, raterRole: "player" });
      raw.push({ raterId: "r2", targetId, attribute: "finishing", mode: "detailed", value: 6, createdAt: now, raterRole: "player" });
      raw.push({ raterId: "r3", targetId, attribute: "finishing", mode: "detailed", value: 6, createdAt: now, raterRole: "player" });
    }
    repo.groupScoutingVotes.set(GROUP_ID, raw);

    await recomputeGroupRaterStats(repo, GROUP_ID, now);
    const stats = repo.raterStatsByGroup.get(GROUP_ID)!;

    // Leave-one-out residual for r1 on every pair = scaled(8) - mean(scaled(6), scaled(6)) =
    // 82 - 69 = 13, constant across all 10 targets -> bias = 13 exactly.
    expect(stats.get("r1")!.nVotes).toBe(10);
    expect(stats.get("r1")!.bias).toBeCloseTo(13, 9);
    expect(stats.get("r1")!.bias).toBeGreaterThan(0);

    // The bias must actually get subtracted. Re-using the exact 3-rater clique it was derived
    // from to check this is a trap: leave-one-out residuals within a fixed trio always sum to
    // zero, so correcting all three at once leaves their pooled mean unchanged (an expected
    // property, not a bug — see the comment on computeLeaveOneOutResiduals). To see the actual
    // effect, pair the now-known-biased r1 with a brand-new rater on a fresh target: r1's
    // inflated vote should get pulled down towards the new rater's, not averaged at face value.
    const votes = [
      { raterId: "r1", value: 8, createdAt: now, raterRole: "player" as const }, // known bias +13
      { raterId: "r_new", value: 6, createdAt: now, raterRole: "player" as const }, // no history, bias 0
    ];
    const withoutBiasCorrection = aggregateAttribute(votes, {
      now,
      settings: defaultGroupSettings.rating,
      targetId: "t_new",
      groupMean: defaultGroupSettings.rating.default_mean,
    });
    const raterBias = new Map([["r1", stats.get("r1")!.bias]]); // r_new has no rater_stats row yet
    const withBiasCorrection = aggregateAttribute(votes, {
      now,
      settings: defaultGroupSettings.rating,
      targetId: "t_new",
      raterBias,
      groupMean: defaultGroupSettings.rating.default_mean,
    });
    expect(withBiasCorrection.value).toBeLessThan(withoutBiasCorrection.value);
  });
});

describe("drainRecomputeQueue", () => {
  it("processes queued players grouped by group and dequeues successes", async () => {
    const repo = new FakeRepo();
    repo.players.set("a1", makePlayer("a1", { groupId: "g-a" }));
    repo.players.set("a2", makePlayer("a2", { groupId: "g-a" }));
    repo.players.set("b1", makePlayer("b1", { groupId: "g-b" }));
    repo.queue = [
      { playerId: "a1", groupId: "g-a", reason: "vote" },
      { playerId: "a2", groupId: "g-a", reason: "vote" },
      { playerId: "b1", groupId: "g-b", reason: "vote" },
    ];

    const result = await drainRecomputeQueue(repo, { limit: 10, now: new Date() });

    expect(result.groupsProcessed).toBe(2);
    expect(result.playersProcessed).toBe(3);
    expect(result.playersSucceeded).toBe(3);
    expect(result.playersFailed).toBe(0);
    expect(repo.queue).toHaveLength(0);
    expect(repo.savedCards.has("a1")).toBe(true);
    expect(repo.savedCards.has("a2")).toBe(true);
    expect(repo.savedCards.has("b1")).toBe(true);
  });

  it("collects one player's failure without blocking the rest of the batch", async () => {
    const repo = new FakeRepo();
    repo.players.set("ok1", makePlayer("ok1"));
    repo.players.set("ok2", makePlayer("ok2"));
    repo.failLoadPlayerFor.add("bad1"); // loadPlayer throws for this one
    repo.queue = [
      { playerId: "ok1", groupId: GROUP_ID, reason: "vote" },
      { playerId: "bad1", groupId: GROUP_ID, reason: "vote" },
      { playerId: "ok2", groupId: GROUP_ID, reason: "vote" },
    ];

    const result = await drainRecomputeQueue(repo, { limit: 10, now: new Date() });

    expect(result.playersSucceeded).toBe(2);
    expect(result.playersFailed).toBe(1);
    expect(result.failures).toEqual([{ playerId: "bad1", error: "boom: bad1" }]);
    expect(repo.savedCards.has("ok1")).toBe(true);
    expect(repo.savedCards.has("ok2")).toBe(true);
    // The failed player stays queued for the next drain.
    expect(repo.queue.map((q) => q.playerId)).toEqual(["bad1"]);
  });

  it("does nothing with an empty queue", async () => {
    const repo = new FakeRepo();
    const result = await drainRecomputeQueue(repo, { limit: 10, now: new Date() });
    expect(result).toEqual({ groupsProcessed: 0, playersProcessed: 0, playersSucceeded: 0, playersFailed: 0, failures: [] });
  });
});
