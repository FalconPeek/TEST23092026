import { describe, expect, it } from "vitest";
import type { DisputeReason, PlayerMatchStats } from "@/lib/reconcile";
import type { MatchFormInput } from "@/lib/rating";
import { defaultGroupSettings, type GroupSettings } from "@/lib/settings/group";
import { finalizeMatch, processPendingFinalize } from "./finalize";
import type {
  DisputeResolution,
  FinalizeRepo,
  MatchGraph,
  MatchResultSave,
  MatchRosterEntry,
  OpenskillSnapshot,
  OpenskillUpdate,
} from "./finalize-repo";

const GROUP_ID = "group-1";

interface RecomputeCall {
  playerId: string;
  now: Date;
  formMatches: MatchFormInput[];
}

/** In-memory FinalizeRepo double, mirroring the FakeRepo pattern in recompute.test.ts. Seed
 * `graphs`/`openskill` directly per test; the save* methods record what would have been written
 * so tests can assert on it without a real database. */
class FakeFinalizeRepo implements FinalizeRepo {
  graphs = new Map<string, MatchGraph>();
  settings = new Map<string, GroupSettings>();
  openskill = new Map<string, OpenskillSnapshot>();
  recentRatingsByPlayer = new Map<string, MatchFormInput[]>();

  savedResults = new Map<string, MatchResultSave>();
  savedStats = new Map<string, { stats: PlayerMatchStats[]; nRatingsByPlayer: Map<string, number> }>();
  savedOpenskill: OpenskillUpdate[] = [];
  disputedMatchIds: string[] = [];
  finalizedMatchIds: { matchId: string; finalizedAt: Date }[] = [];
  auditLogs: { matchId: string; action: string; payload: unknown }[] = [];
  recomputeCalls: RecomputeCall[] = [];
  confirmedTournamentMatches: { tournamentMatchId: string; score1: number; score2: number }[] = [];
  advancedTournaments: string[] = [];
  /** Set to make confirmTournamentMatchResult reject, e.g. to simulate PICADO_KO_DRAW. */
  tournamentConfirmError: string | null = null;

  awardMatchBadgesCalls: { matchId: string; groupId: string; playerIds: string[] }[] = [];
  notifyFinalizedCalls: { matchId: string; groupId: string; roster: MatchRosterEntry[]; score: { team1Goals: number; team2Goals: number } }[] = [];
  notifyDisputedCalls: { matchId: string; groupId: string; reasons: DisputeReason[] }[] = [];
  /** Set to make one of the 3 best-effort hooks above reject, asserting it never fails finalizeMatch. */
  awardMatchBadgesError: string | null = null;
  notifyFinalizedError: string | null = null;
  notifyDisputedError: string | null = null;

  async loadPendingFinalizeMatchIds(now: Date) {
    return [...this.graphs.values()]
      .filter((g) => g.status === "pending_finalize" && (!g.ratingDeadline || g.ratingDeadline <= now))
      .map((g) => g.id);
  }

  async loadMatchGraph(matchId: string) {
    return this.graphs.get(matchId) ?? null;
  }

  async loadGroupSettings(groupId: string) {
    return this.settings.get(groupId) ?? defaultGroupSettings;
  }

  async loadOpenskillRatings(playerIds: string[]) {
    const result = new Map<string, OpenskillSnapshot>();
    for (const id of playerIds) {
      const snap = this.openskill.get(id);
      if (snap) result.set(id, snap);
    }
    return result;
  }

  async loadRecentMatchRatings(playerId: string) {
    return this.recentRatingsByPlayer.get(playerId) ?? [];
  }

  async saveMatchResult(matchId: string, result: MatchResultSave) {
    this.savedResults.set(matchId, result);
  }

  async saveMatchStats(matchId: string, stats: PlayerMatchStats[], nRatingsByPlayer: Map<string, number>) {
    this.savedStats.set(matchId, { stats, nRatingsByPlayer });
  }

  async saveOpenskillRatings(updates: OpenskillUpdate[]) {
    this.savedOpenskill.push(...updates);
  }

  async setMatchDisputed(matchId: string) {
    this.disputedMatchIds.push(matchId);
    const g = this.graphs.get(matchId);
    if (g) this.graphs.set(matchId, { ...g, status: "disputed" });
  }

  async setMatchFinalized(matchId: string, finalizedAt: Date) {
    this.finalizedMatchIds.push({ matchId, finalizedAt });
    const g = this.graphs.get(matchId);
    if (g) this.graphs.set(matchId, { ...g, status: "finalized" });
  }

  async logAudit(matchId: string, action: string, payload: unknown) {
    this.auditLogs.push({ matchId, action, payload });
  }

  async recomputeCard(playerId: string, now: Date, formMatches: MatchFormInput[]) {
    this.recomputeCalls.push({ playerId, now, formMatches });
  }

  async confirmTournamentMatchResult(tournamentMatchId: string, result: { score1: number; score2: number }) {
    if (this.tournamentConfirmError) throw new Error(this.tournamentConfirmError);
    this.confirmedTournamentMatches.push({ tournamentMatchId, score1: result.score1, score2: result.score2 });
  }

  async advanceTournament(tournamentId: string) {
    this.advancedTournaments.push(tournamentId);
  }

  async awardMatchBadges(matchId: string, groupId: string, playerIds: string[]) {
    if (this.awardMatchBadgesError) throw new Error(this.awardMatchBadgesError);
    this.awardMatchBadgesCalls.push({ matchId, groupId, playerIds });
  }

  async notifyMatchFinalized(matchId: string, groupId: string, roster: MatchRosterEntry[], score: { team1Goals: number; team2Goals: number }) {
    if (this.notifyFinalizedError) throw new Error(this.notifyFinalizedError);
    this.notifyFinalizedCalls.push({ matchId, groupId, roster, score });
  }

  async notifyMatchDisputed(matchId: string, groupId: string, reasons: DisputeReason[]) {
    if (this.notifyDisputedError) throw new Error(this.notifyDisputedError);
    this.notifyDisputedCalls.push({ matchId, groupId, reasons });
  }
}

const PLAYED_AT = new Date("2026-01-01T20:00:00Z");
const NOW = new Date("2026-01-02T00:00:00Z");
const PAST_DEADLINE = new Date("2026-01-01T23:00:00Z");
const FUTURE_DEADLINE = new Date("2026-01-05T00:00:00Z");

function roster(entries: Partial<MatchRosterEntry>[]): MatchRosterEntry[] {
  return entries.map((e) => ({ playerId: "p", side: 1, role: "player", ...e }) as MatchRosterEntry);
}

function baseGraph(overrides: Partial<MatchGraph> = {}): MatchGraph {
  return {
    id: "m1",
    groupId: GROUP_ID,
    status: "pending_finalize",
    playedAt: PLAYED_AT,
    scheduledAt: PLAYED_AT,
    ratingDeadline: PAST_DEADLINE,
    roster: [],
    scoreReports: [],
    statReports: [],
    ratings: [],
    disputeResolution: null,
    tournamentMatchId: null,
    tournamentId: null,
    ...overrides,
  };
}

/** 3 raters (r1-r3) give `targetId` the same rating three times over -> weighted median = value,
 * comfortably clearing the default form.min_raters (3). */
function ratingsFor(targetId: string, value: number): MatchGraph["ratings"] {
  return ["r1", "r2", "r3"].map((raterId) => ({
    raterId,
    targetId,
    rating: value,
    raterRole: "player" as const,
    standoutAttributes: [],
  }));
}

function happyPathGraph(): MatchGraph {
  return baseGraph({
    roster: roster([
      { playerId: "p1", side: 1, role: "player" },
      { playerId: "p2", side: 1, role: "player" },
      { playerId: "p3", side: 2, role: "player" },
      { playerId: "p4", side: 2, role: "player" },
      { playerId: "spec1", side: 1, role: "spectator" },
    ]),
    scoreReports: [
      { reporterId: "p1", team1Goals: 2, team2Goals: 0 },
      { reporterId: "p3", team1Goals: 2, team2Goals: 0 },
    ],
    statReports: [
      { reporterId: "p1", subjectId: "p1", goals: 2, assists: 0, ownGoals: 0, saves: 0 },
      { reporterId: "p2", subjectId: "p2", goals: 0, assists: 1, ownGoals: 0, saves: 0 },
      { reporterId: "p3", subjectId: "p3", goals: 0, assists: 0, ownGoals: 0, saves: 0 },
      { reporterId: "p4", subjectId: "p4", goals: 0, assists: 0, ownGoals: 0, saves: 3 },
    ],
    ratings: [...ratingsFor("p1", 8), ...ratingsFor("p2", 7), ...ratingsFor("p3", 6), ...ratingsFor("p4", 5)],
  });
}

describe("finalizeMatch", () => {
  it("reconciles, saves results/stats, updates OpenSkill and recomputes cards on the happy path", async () => {
    const repo = new FakeFinalizeRepo();
    repo.graphs.set("m1", happyPathGraph());

    const outcome = await finalizeMatch(repo, "m1", NOW);

    expect(outcome).toEqual({ matchId: "m1", status: "finalized" });

    const result = repo.savedResults.get("m1")!;
    expect(result).toMatchObject({ team1Goals: 2, team2Goals: 0, decidedBy: "regular", winnerSide: 1 });
    expect(result.finalizedAt).toEqual(NOW);

    const { stats, nRatingsByPlayer } = repo.savedStats.get("m1")!;
    expect(stats).toHaveLength(4); // spectator excluded
    const p1 = stats.find((s) => s.playerId === "p1")!;
    expect(p1).toMatchObject({ goals: 2, assists: 0, ownGoals: 0, cleanSheet: true, isMvp: true, medianRating: 8 });
    const p3 = stats.find((s) => s.playerId === "p3")!;
    expect(p3).toMatchObject({ cleanSheet: false, isMvp: false });
    expect(nRatingsByPlayer.get("p1")).toBe(3);

    // OpenSkill: both sides updated, spectator untouched, winners' mu increases, losers' decreases.
    expect(repo.savedOpenskill).toHaveLength(4);
    expect(repo.savedOpenskill.every((u) => u.matchesPlayed === 1)).toBe(true);
    const muById = new Map(repo.savedOpenskill.map((u) => [u.playerId, u.mu]));
    expect(muById.get("p1")!).toBeGreaterThan(defaultGroupSettings.rating.openskill.mu);
    expect(muById.get("p3")!).toBeLessThan(defaultGroupSettings.rating.openskill.mu);

    expect(repo.finalizedMatchIds).toEqual([{ matchId: "m1", finalizedAt: NOW }]);
    expect(repo.disputedMatchIds).toEqual([]);

    // Card recompute: one call per team player, never the spectator.
    expect(repo.recomputeCalls.map((c) => c.playerId).sort()).toEqual(["p1", "p2", "p3", "p4"]);
    const p1Recompute = repo.recomputeCalls.find((c) => c.playerId === "p1")!;
    expect(p1Recompute.formMatches[0].ratings).toHaveLength(3);
    expect(p1Recompute.formMatches[0].playedAt).toEqual(PLAYED_AT);

    // Badges evaluated for team players only (spectator excluded), notification sent to the roster.
    expect(repo.awardMatchBadgesCalls).toEqual([{ matchId: "m1", groupId: GROUP_ID, playerIds: ["p1", "p2", "p3", "p4"] }]);
    expect(repo.notifyFinalizedCalls).toHaveLength(1);
    expect(repo.notifyFinalizedCalls[0]).toMatchObject({ matchId: "m1", groupId: GROUP_ID, score: { team1Goals: 2, team2Goals: 0 } });
    expect(repo.notifyDisputedCalls).toEqual([]);
  });

  it("a badge-award or finalized-notification failure never fails finalization (best-effort)", async () => {
    const repo = new FakeFinalizeRepo();
    repo.graphs.set("m1", happyPathGraph());
    repo.awardMatchBadgesError = "boom";
    repo.notifyFinalizedError = "boom";

    const outcome = await finalizeMatch(repo, "m1", NOW);

    expect(outcome).toEqual({ matchId: "m1", status: "finalized" });
    expect(repo.finalizedMatchIds).toEqual([{ matchId: "m1", finalizedAt: NOW }]);
  });

  it("treats a draw as a tie for OpenSkill and leaves winnerSide null", async () => {
    const repo = new FakeFinalizeRepo();
    const graph = happyPathGraph();
    graph.scoreReports = [
      { reporterId: "p1", team1Goals: 1, team2Goals: 1 },
      { reporterId: "p3", team1Goals: 1, team2Goals: 1 },
    ];
    graph.statReports = [
      { reporterId: "p1", subjectId: "p1", goals: 1, assists: 0, ownGoals: 0, saves: 0 },
      { reporterId: "p3", subjectId: "p3", goals: 1, assists: 0, ownGoals: 0, saves: 0 },
    ];
    repo.graphs.set("m1", graph);

    const outcome = await finalizeMatch(repo, "m1", NOW);
    expect(outcome.status).toBe("finalized");
    expect(repo.savedResults.get("m1")).toMatchObject({ team1Goals: 1, team2Goals: 1, winnerSide: null });

    // A draw should not systematically favor either side: both teams' mu move by the same
    // magnitude given identical starting ratings.
    const muById = new Map(repo.savedOpenskill.map((u) => [u.playerId, u.mu]));
    expect(muById.get("p1")).toBeCloseTo(muById.get("p3")!, 6);
  });

  it("disputes when score reports disagree, without writing results/stats/openskill", async () => {
    const repo = new FakeFinalizeRepo();
    const graph = happyPathGraph();
    graph.scoreReports = [
      { reporterId: "p1", team1Goals: 2, team2Goals: 0 },
      { reporterId: "p3", team1Goals: 1, team2Goals: 1 },
    ];
    repo.graphs.set("m1", graph);

    const outcome = await finalizeMatch(repo, "m1", NOW);

    expect(outcome.status).toBe("disputed");
    if (outcome.status === "disputed") {
      expect(outcome.reasons).toEqual<DisputeReason[]>([
        {
          code: "SCORE_MISMATCH",
          reports: [
            { reporterId: "p1", team1Goals: 2, team2Goals: 0 },
            { reporterId: "p3", team1Goals: 1, team2Goals: 1 },
          ],
        },
      ]);
    }
    expect(repo.disputedMatchIds).toEqual(["m1"]);
    expect(repo.savedResults.size).toBe(0);
    expect(repo.savedStats.size).toBe(0);
    expect(repo.savedOpenskill).toEqual([]);
    expect(repo.recomputeCalls).toEqual([]);
    expect(repo.auditLogs).toHaveLength(1);
    expect(repo.auditLogs[0].action).toBe("auto_dispute");
    expect(repo.notifyDisputedCalls).toHaveLength(1);
    expect(repo.notifyDisputedCalls[0]).toMatchObject({ matchId: "m1", groupId: GROUP_ID });
    expect(repo.notifyDisputedCalls[0]!.reasons).toEqual(outcome.status === "disputed" ? outcome.reasons : []);
    expect(repo.awardMatchBadgesCalls).toEqual([]); // never awarded on a disputed match
    expect(repo.notifyFinalizedCalls).toEqual([]);
  });

  it("a disputed-notification failure never fails the dispute outcome (best-effort)", async () => {
    const repo = new FakeFinalizeRepo();
    const graph = happyPathGraph();
    graph.scoreReports = [
      { reporterId: "p1", team1Goals: 2, team2Goals: 0 },
      { reporterId: "p3", team1Goals: 1, team2Goals: 1 },
    ];
    repo.graphs.set("m1", graph);
    repo.notifyDisputedError = "boom";

    const outcome = await finalizeMatch(repo, "m1", NOW);
    expect(outcome.status).toBe("disputed");
    expect(repo.disputedMatchIds).toEqual(["m1"]);
  });

  it("trusts an admin's resolve_dispute override instead of re-running Rule A", async () => {
    const repo = new FakeFinalizeRepo();
    const graph = happyPathGraph();
    // Conflicting score reports that would dispute on their own; p1's own stat report agrees
    // with their own (wrong) score claim of 3-0.
    graph.scoreReports = [
      { reporterId: "p1", team1Goals: 3, team2Goals: 0 },
      { reporterId: "p3", team1Goals: 1, team2Goals: 1 },
    ];
    graph.statReports = graph.statReports.map((r) => (r.subjectId === "p1" ? { ...r, goals: 3 } : r));
    // ...but an admin already resolved it at 2-0, overriding only p1's goals back down to 2.
    graph.disputeResolution = {
      team1Goals: 2,
      team2Goals: 0,
      stats: [{ subjectId: "p1", goals: 2 }],
    } satisfies DisputeResolution;
    repo.graphs.set("m1", graph);

    const outcome = await finalizeMatch(repo, "m1", NOW);

    expect(outcome).toEqual({ matchId: "m1", status: "finalized" });
    expect(repo.savedResults.get("m1")).toMatchObject({ team1Goals: 2, team2Goals: 0, decidedBy: "manual", winnerSide: 1 });
    const { stats } = repo.savedStats.get("m1")!;
    expect(stats.find((s) => s.playerId === "p1")).toMatchObject({ goals: 2 });
    // p2's assist came from the raw stat reports (not overridden), untouched by the admin.
    expect(stats.find((s) => s.playerId === "p2")).toMatchObject({ assists: 1 });
    expect(repo.disputedMatchIds).toEqual([]);
  });

  it("breaks an MVP tie by goals+assists then OpenSkill ordinal", async () => {
    const repo = new FakeFinalizeRepo();
    const graph = happyPathGraph();
    // p1 and p2 tie on median rating and on goals+assists; p2 has a higher existing OpenSkill
    // ordinal (higher mu, same sigma), so p2 should win the MVP tiebreak.
    graph.ratings = [...ratingsFor("p1", 8), ...ratingsFor("p2", 8), ...ratingsFor("p3", 5), ...ratingsFor("p4", 5)];
    graph.statReports = [
      { reporterId: "p1", subjectId: "p1", goals: 1, assists: 0, ownGoals: 0, saves: 0 },
      { reporterId: "p2", subjectId: "p2", goals: 1, assists: 0, ownGoals: 0, saves: 0 },
    ];
    repo.openskill.set("p1", { mu: 25, sigma: 25 / 3, matchesPlayed: 3 });
    repo.openskill.set("p2", { mu: 30, sigma: 25 / 3, matchesPlayed: 3 });
    repo.graphs.set("m1", graph);

    await finalizeMatch(repo, "m1", NOW);

    const { stats } = repo.savedStats.get("m1")!;
    expect(stats.find((s) => s.playerId === "p1")!.isMvp).toBe(false);
    expect(stats.find((s) => s.playerId === "p2")!.isMvp).toBe(true);
  });

  it("is a no-op when the rating window is still open", async () => {
    const repo = new FakeFinalizeRepo();
    const graph = happyPathGraph();
    graph.ratingDeadline = FUTURE_DEADLINE;
    repo.graphs.set("m1", graph);

    const outcome = await finalizeMatch(repo, "m1", NOW);

    expect(outcome).toEqual({ matchId: "m1", status: "skipped", reason: "rating_window_open" });
    expect(repo.savedResults.size).toBe(0);
    expect(repo.finalizedMatchIds).toEqual([]);
  });

  it("is idempotent: re-running an already-finalized match is a no-op", async () => {
    const repo = new FakeFinalizeRepo();
    const graph = happyPathGraph();
    graph.status = "finalized";
    repo.graphs.set("m1", graph);

    const outcome = await finalizeMatch(repo, "m1", NOW);

    expect(outcome).toEqual({ matchId: "m1", status: "skipped", reason: "already_finalized" });
    expect(repo.savedResults.size).toBe(0);
    expect(repo.savedOpenskill).toEqual([]);
    expect(repo.recomputeCalls).toEqual([]);
  });

  it("is a no-op on an already-disputed match (waiting on the organizer)", async () => {
    const repo = new FakeFinalizeRepo();
    const graph = happyPathGraph();
    graph.status = "disputed";
    repo.graphs.set("m1", graph);

    const outcome = await finalizeMatch(repo, "m1", NOW);

    expect(outcome).toEqual({ matchId: "m1", status: "skipped", reason: "already_disputed" });
  });

  it("returns skipped for an unknown match id", async () => {
    const repo = new FakeFinalizeRepo();
    const outcome = await finalizeMatch(repo, "does-not-exist", NOW);
    expect(outcome).toEqual({ matchId: "does-not-exist", status: "skipped", reason: "not_found" });
  });

  it("skips a match that never left reporting", async () => {
    const repo = new FakeFinalizeRepo();
    const graph = happyPathGraph();
    graph.status = "reporting";
    repo.graphs.set("m1", graph);

    const outcome = await finalizeMatch(repo, "m1", NOW);
    expect(outcome).toEqual({ matchId: "m1", status: "skipped", reason: "not_pending_finalize" });
  });

  it("accounts for own goals in the official score and clean sheets", async () => {
    const repo = new FakeFinalizeRepo();
    const graph = baseGraph({
      roster: roster([
        { playerId: "p1", side: 1, role: "player" },
        { playerId: "p3", side: 2, role: "player" },
      ]),
      // p3 (side 2) scores an own goal -> counts toward side 1's score.
      scoreReports: [
        { reporterId: "p1", team1Goals: 1, team2Goals: 0 },
        { reporterId: "p3", team1Goals: 1, team2Goals: 0 },
      ],
      statReports: [
        { reporterId: "p1", subjectId: "p1", goals: 0, assists: 0, ownGoals: 0, saves: 0 },
        { reporterId: "p3", subjectId: "p3", goals: 0, assists: 0, ownGoals: 1, saves: 0 },
      ],
    });
    repo.graphs.set("m1", graph);

    const outcome = await finalizeMatch(repo, "m1", NOW);
    expect(outcome.status).toBe("finalized");

    const { stats } = repo.savedStats.get("m1")!;
    const p3 = stats.find((s) => s.playerId === "p3")!;
    expect(p3.ownGoals).toBe(1);
    expect(p3.cleanSheet).toBe(false); // side 2 conceded 1 (via their own own goal)
    const p1 = stats.find((s) => s.playerId === "p1")!;
    expect(p1.cleanSheet).toBe(true); // side 1 conceded 0
  });

  it("passes prior finalized matches' ratings into the card recompute alongside this match's", async () => {
    const repo = new FakeFinalizeRepo();
    repo.graphs.set("m1", happyPathGraph());
    const priorMatch: MatchFormInput = { playedAt: new Date("2025-12-20T00:00:00Z"), ratings: [{ value: 9, raterRole: "player" }] };
    repo.recentRatingsByPlayer.set("p1", [priorMatch]);

    await finalizeMatch(repo, "m1", NOW);

    const p1Recompute = repo.recomputeCalls.find((c) => c.playerId === "p1")!;
    expect(p1Recompute.formMatches).toHaveLength(2);
    expect(p1Recompute.formMatches[1]).toEqual(priorMatch);
  });

  it("syncs the result to the linked tournament fixture and advances the bracket", async () => {
    const repo = new FakeFinalizeRepo();
    const graph = happyPathGraph();
    graph.tournamentMatchId = "tm1";
    graph.tournamentId = "t1";
    repo.graphs.set("m1", graph);

    const outcome = await finalizeMatch(repo, "m1", NOW);

    expect(outcome).toEqual({ matchId: "m1", status: "finalized" }); // tournamentSyncError undefined
    expect(repo.confirmedTournamentMatches).toEqual([{ tournamentMatchId: "tm1", score1: 2, score2: 0 }]);
    expect(repo.advancedTournaments).toEqual(["t1"]);
  });

  it("finalizes the real match even when the tournament sync fails (e.g. a KO draw needing pens)", async () => {
    const repo = new FakeFinalizeRepo();
    const graph = happyPathGraph();
    graph.tournamentMatchId = "tm1";
    graph.tournamentId = "t1";
    repo.tournamentConfirmError = "PICADO_KO_DRAW: a tied knockout match requires penalties or a manual/walkover decision";
    repo.graphs.set("m1", graph);

    const outcome = await finalizeMatch(repo, "m1", NOW);

    expect(outcome).toEqual({
      matchId: "m1",
      status: "finalized",
      tournamentSyncError: "PICADO_KO_DRAW: a tied knockout match requires penalties or a manual/walkover decision",
    });
    // The real match itself still finalized fully.
    expect(repo.savedResults.has("m1")).toBe(true);
    expect(repo.finalizedMatchIds).toEqual([{ matchId: "m1", finalizedAt: NOW }]);
    expect(repo.advancedTournaments).toEqual([]); // never reached
  });

  it("does not touch the tournament repo methods for a match with no linked tournament fixture", async () => {
    const repo = new FakeFinalizeRepo();
    repo.graphs.set("m1", happyPathGraph());

    await finalizeMatch(repo, "m1", NOW);

    expect(repo.confirmedTournamentMatches).toEqual([]);
    expect(repo.advancedTournaments).toEqual([]);
  });
});

describe("processPendingFinalize", () => {
  it("processes every eligible match and collects per-match failures without stopping the batch", async () => {
    const repo = new FakeFinalizeRepo();
    repo.graphs.set("m1", happyPathGraph());
    const disputed = happyPathGraph();
    disputed.id = "m2";
    disputed.scoreReports = [
      { reporterId: "p1", team1Goals: 2, team2Goals: 0 },
      { reporterId: "p3", team1Goals: 0, team2Goals: 2 },
    ];
    repo.graphs.set("m2", disputed);
    // Not yet eligible (rating window open): must not appear in loadPendingFinalizeMatchIds.
    const notYet = happyPathGraph();
    notYet.id = "m3";
    notYet.ratingDeadline = FUTURE_DEADLINE;
    repo.graphs.set("m3", notYet);

    const result = await processPendingFinalize(repo, NOW);

    expect(result.matchIds.sort()).toEqual(["m1", "m2"]);
    expect(result.finalized).toBe(1);
    expect(result.disputed).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it("collects a thrown error for one match without aborting the rest", async () => {
    const repo = new FakeFinalizeRepo();
    repo.graphs.set("m1", happyPathGraph());
    repo.graphs.set("m2", { ...happyPathGraph(), id: "m2" });
    const originalLoad = repo.loadMatchGraph.bind(repo);
    repo.loadMatchGraph = async (matchId: string) => {
      if (matchId === "m2") throw new Error("boom");
      return originalLoad(matchId);
    };

    const result = await processPendingFinalize(repo, NOW);

    expect(result.finalized).toBe(1);
    expect(result.errors).toEqual([{ matchId: "m2", error: "boom" }]);
  });
});
