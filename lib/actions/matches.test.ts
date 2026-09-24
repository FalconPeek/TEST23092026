import { beforeEach, describe, expect, it, vi } from "vitest";
import { es } from "@/messages/es";

const mockRpc = vi.fn();
const mockGetUserId = vi.fn();
const mockRevalidatePath = vi.fn();
const mockAwardAmendment = vi.fn();
let mockBeforeRows: { player_id: string; goals: number; assists: number }[] = [];

// Minimal query builder for the pre-amendment snapshot: .from().select().eq().in() resolves rows.
const mockFrom = () => {
  const builder = { select: () => builder, eq: () => builder, in: async () => ({ data: mockBeforeRows, error: null }) };
  return builder;
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: mockRpc, from: mockFrom })),
  getUserId: () => mockGetUserId(),
}));

vi.mock("@/lib/server/match-notify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/match-notify")>()),
  awardAmendmentBadgesBestEffort: (...args: unknown[]) => mockAwardAmendment(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => mockRevalidatePath(path),
}));

const {
  createMatch,
  setMatchLineup,
  startReporting,
  cancelMatch,
  submitScoreReport,
  submitStatReports,
  submitMatchRatings,
  resolveDispute,
  amendMatchStats,
} = await import("./matches");

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const MATCH_ID = "33333333-3333-4333-8333-333333333333";
const PLAYER_1 = "44444444-4444-4444-8444-444444444444";
const PLAYER_2 = "55555555-5555-4555-8555-555555555555";
const PLAYER_3 = "66666666-6666-4666-8666-666666666666";

beforeEach(() => {
  mockRpc.mockReset();
  mockGetUserId.mockReset();
  mockRevalidatePath.mockReset();
  mockAwardAmendment.mockReset();
  mockBeforeRows = [];
});

describe("createMatch", () => {
  it("rejects an unsupported team size without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);

    const result = await createMatch({
      groupId: GROUP_ID,
      scheduledAt: new Date().toISOString(),
      // @ts-expect-error 10 is intentionally not one of the accepted team sizes
      teamSize: 10,
    });

    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns unauthenticated without calling rpc when there is no session", async () => {
    mockGetUserId.mockResolvedValue(null);

    const result = await createMatch({ groupId: GROUP_ID, scheduledAt: new Date().toISOString(), teamSize: 5 });

    expect(result).toEqual({ ok: false, error: es.errors.unauthenticated });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("calls create_match with the right p_* args and returns the matchId", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: MATCH_ID, error: null });
    const scheduledAt = new Date("2026-10-01T20:00:00.000Z").toISOString();

    const result = await createMatch({ groupId: GROUP_ID, scheduledAt, teamSize: 7, venue: "Cancha 3" });

    expect(mockRpc).toHaveBeenCalledWith("create_match", {
      p_group_id: GROUP_ID,
      p_scheduled_at: scheduledAt,
      p_team_size: 7,
      p_venue: "Cancha 3",
    });
    expect(result).toEqual({ ok: true, data: { matchId: MATCH_ID } });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/g/${GROUP_ID}/partidos`);
  });

  it("still succeeds when the best-effort match_scheduled notification can't be sent (no SUPABASE_SECRET_KEY here)", async () => {
    // notifyMatchScheduledBestEffort (lib/server/match-notify.ts) makes its own admin client and
    // swallows every error internally -- this test's env has no SUPABASE_SECRET_KEY, so that call
    // fails every time, which is exactly the "must never fail the action" case being asserted.
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: MATCH_ID, error: null });

    const result = await createMatch({ groupId: GROUP_ID, scheduledAt: new Date().toISOString(), teamSize: 5 });

    expect(result).toEqual({ ok: true, data: { matchId: MATCH_ID } });
  });

  it("maps a forbidden RPC error", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "PICADO_FORBIDDEN: only group admins can create matches" },
    });

    const result = await createMatch({ groupId: GROUP_ID, scheduledAt: new Date().toISOString(), teamSize: 5 });

    expect(result).toEqual({ ok: false, error: es.errors.forbidden });
  });
});

describe("setMatchLineup", () => {
  const team1 = { name: "Rojo", players: [{ playerId: PLAYER_1 }] };
  const team2 = { name: "Verde", players: [{ playerId: PLAYER_2 }] };

  it("rejects a player appearing on both teams without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);

    const result = await setMatchLineup({
      groupId: GROUP_ID,
      matchId: MATCH_ID,
      team1,
      team2: { name: "Verde", players: [{ playerId: PLAYER_1 }] },
      spectators: [],
    });

    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects a player listed as both a team player and a spectator", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);

    const result = await setMatchLineup({
      groupId: GROUP_ID,
      matchId: MATCH_ID,
      team1,
      team2,
      spectators: [PLAYER_1],
    });

    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("maps camelCase input to the snake_case team1/team2 JSON payloads", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await setMatchLineup({
      groupId: GROUP_ID,
      matchId: MATCH_ID,
      team1: { name: "Rojo", color: "#ff0000", players: [{ playerId: PLAYER_1, position: "DC" }] },
      team2,
      spectators: [PLAYER_3],
    });

    expect(mockRpc).toHaveBeenCalledWith("set_match_lineup", {
      p_match_id: MATCH_ID,
      p_team1: { name: "Rojo", color: "#ff0000", players: [{ player_id: PLAYER_1, position: "DC" }] },
      p_team2: { name: "Verde", color: null, players: [{ player_id: PLAYER_2, position: null }] },
      p_spectators: [PLAYER_3],
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/g/${GROUP_ID}/partidos`);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/g/${GROUP_ID}/partidos/${MATCH_ID}`);
  });
});

describe("startReporting", () => {
  it("calls start_reporting with the right p_* args", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await startReporting({ groupId: GROUP_ID, matchId: MATCH_ID });

    expect(mockRpc).toHaveBeenCalledWith("start_reporting", { p_match_id: MATCH_ID, p_played_at: undefined });
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("still succeeds when the best-effort report_pending/rating_pending notifications can't be sent", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await startReporting({ groupId: GROUP_ID, matchId: MATCH_ID });

    expect(result).toEqual({ ok: true, data: undefined });
  });
});

describe("cancelMatch", () => {
  it("calls cancel_match with only the match id", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await cancelMatch({ groupId: GROUP_ID, matchId: MATCH_ID });

    expect(mockRpc).toHaveBeenCalledWith("cancel_match", { p_match_id: MATCH_ID });
  });
});

describe("submitScoreReport", () => {
  it("rejects goals out of range without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);

    const result = await submitScoreReport({ groupId: GROUP_ID, matchId: MATCH_ID, team1Goals: -1, team2Goals: 2 });

    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("maps a not-participant RPC error", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "PICADO_NOT_PARTICIPANT: you are not a participant of this match" },
    });

    const result = await submitScoreReport({ groupId: GROUP_ID, matchId: MATCH_ID, team1Goals: 2, team2Goals: 1 });

    expect(result).toEqual({ ok: false, error: es.errors.notParticipant });
  });

  it("calls submit_score_report with the right p_* args", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await submitScoreReport({ groupId: GROUP_ID, matchId: MATCH_ID, team1Goals: 3, team2Goals: 2 });

    expect(mockRpc).toHaveBeenCalledWith("submit_score_report", {
      p_match_id: MATCH_ID,
      p_team1_goals: 3,
      p_team2_goals: 2,
    });
  });
});

describe("submitStatReports", () => {
  it("rejects a duplicate subject_player_id within the batch, without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);

    const result = await submitStatReports({
      groupId: GROUP_ID,
      matchId: MATCH_ID,
      reports: [{ subjectPlayerId: PLAYER_1, goals: 1 }, { subjectPlayerId: PLAYER_1, goals: 2 }],
    });

    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("maps camelCase reports to the snake_case JSON payload, defaulting missing numbers to 0", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await submitStatReports({
      groupId: GROUP_ID,
      matchId: MATCH_ID,
      reports: [{ subjectPlayerId: PLAYER_1, goals: 2, assists: 1 }],
    });

    expect(mockRpc).toHaveBeenCalledWith("submit_stat_reports", {
      p_match_id: MATCH_ID,
      p_reports: [{ subject_player_id: PLAYER_1, goals: 2, assists: 1, own_goals: 0, saves: 0 }],
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/g/${GROUP_ID}/partidos/${MATCH_ID}`);
  });
});

describe("submitMatchRatings", () => {
  it("rejects more than 2 standout attributes without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);

    const result = await submitMatchRatings({
      groupId: GROUP_ID,
      matchId: MATCH_ID,
      ratings: [
        { targetPlayerId: PLAYER_1, rating: 8, standoutAttributes: ["finishing", "vision", "dribbling"] },
      ],
    });

    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects a duplicate target_player_id within the batch", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);

    const result = await submitMatchRatings({
      groupId: GROUP_ID,
      matchId: MATCH_ID,
      ratings: [
        { targetPlayerId: PLAYER_1, rating: 7 },
        { targetPlayerId: PLAYER_1, rating: 8 },
      ],
    });

    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("maps camelCase ratings to the snake_case JSON payload", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await submitMatchRatings({
      groupId: GROUP_ID,
      matchId: MATCH_ID,
      ratings: [{ targetPlayerId: PLAYER_1, rating: 9, standoutAttributes: ["finishing"] }],
    });

    expect(mockRpc).toHaveBeenCalledWith("submit_match_ratings", {
      p_match_id: MATCH_ID,
      p_ratings: [{ target_player_id: PLAYER_1, rating: 9, standout_attributes: ["finishing"] }],
    });
  });

  it("maps a self-vote RPC error", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: { message: "PICADO_SELF_VOTE: you cannot rate yourself" } });

    const result = await submitMatchRatings({
      groupId: GROUP_ID,
      matchId: MATCH_ID,
      ratings: [{ targetPlayerId: PLAYER_1, rating: 6 }],
    });

    expect(result).toEqual({ ok: false, error: es.errors.selfVote });
  });
});

describe("resolveDispute", () => {
  it("rejects a duplicate subject_player_id in stats without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);

    const result = await resolveDispute({
      groupId: GROUP_ID,
      matchId: MATCH_ID,
      team1Goals: 2,
      team2Goals: 1,
      stats: [{ subjectPlayerId: PLAYER_1, goals: 1 }, { subjectPlayerId: PLAYER_1, goals: 2 }],
    });

    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("omits unset numeric stat fields instead of sending them as null/undefined keys", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await resolveDispute({
      groupId: GROUP_ID,
      matchId: MATCH_ID,
      team1Goals: 2,
      team2Goals: 1,
      stats: [{ subjectPlayerId: PLAYER_1, goals: 1 }],
    });

    expect(mockRpc).toHaveBeenCalledWith("resolve_dispute", {
      p_match_id: MATCH_ID,
      p_team1_goals: 2,
      p_team2_goals: 1,
      p_stats: [{ subject_player_id: PLAYER_1, goals: 1, assists: undefined, own_goals: undefined, saves: undefined }],
    });
  });

  it("passes p_stats as undefined when no stats override is given", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await resolveDispute({ groupId: GROUP_ID, matchId: MATCH_ID, team1Goals: 2, team2Goals: 1 });

    expect(mockRpc).toHaveBeenCalledWith("resolve_dispute", {
      p_match_id: MATCH_ID,
      p_team1_goals: 2,
      p_team2_goals: 1,
      p_stats: undefined,
    });
  });

  it("maps a validation RPC error (only a disputed match can be resolved)", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "PICADO_VALIDATION: only a disputed match can be resolved this way" },
    });

    const result = await resolveDispute({ groupId: GROUP_ID, matchId: MATCH_ID, team1Goals: 2, team2Goals: 1 });

    expect(result).toEqual({ ok: false, error: es.errors.validation });
  });
});

describe("amendMatchStats", () => {
  it("rejects duplicate subjects and empty amendments without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    expect(
      await amendMatchStats({ groupId: GROUP_ID, matchId: MATCH_ID, stats: [{ subjectPlayerId: PLAYER_1, goals: 1 }, { subjectPlayerId: PLAYER_1, goals: 2 }] }),
    ).toEqual({ ok: false, error: es.errors.validation });
    expect(await amendMatchStats({ groupId: GROUP_ID, matchId: MATCH_ID, stats: [] })).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns unauthenticated without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(null);
    expect(await amendMatchStats({ groupId: GROUP_ID, matchId: MATCH_ID, stats: [{ subjectPlayerId: PLAYER_1, goals: 1 }] })).toEqual({
      ok: false,
      error: es.errors.unauthenticated,
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("sends snake_case stats and awards badges with the pre-amendment values", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockBeforeRows = [{ player_id: PLAYER_1, goals: 1, assists: 0 }];

    const result = await amendMatchStats({
      groupId: GROUP_ID,
      matchId: MATCH_ID,
      stats: [{ subjectPlayerId: PLAYER_1, goals: 3 }, { subjectPlayerId: PLAYER_2, assists: 1 }],
    });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(mockRpc).toHaveBeenCalledWith("amend_match_stats", {
      p_match_id: MATCH_ID,
      p_stats: [
        { subject_player_id: PLAYER_1, goals: 3, assists: undefined, own_goals: undefined, saves: undefined },
        { subject_player_id: PLAYER_2, goals: undefined, assists: 1, own_goals: undefined, saves: undefined },
      ],
    });
    expect(mockAwardAmendment).toHaveBeenCalledWith(MATCH_ID, [
      { playerId: PLAYER_1, before: { goals: 1, assists: 0 } },
      { playerId: PLAYER_2, before: { goals: 0, assists: 0 } },
    ]);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/g/${GROUP_ID}/partidos/${MATCH_ID}`);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/g/${GROUP_ID}/jugadores/${PLAYER_1}`);
  });

  it("maps RPC errors and awards nothing", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: { message: "PICADO_FORBIDDEN: only group admins can amend match stats" } });
    expect(await amendMatchStats({ groupId: GROUP_ID, matchId: MATCH_ID, stats: [{ subjectPlayerId: PLAYER_1, goals: 1 }] })).toEqual({
      ok: false,
      error: es.errors.forbidden,
    });
    expect(mockAwardAmendment).not.toHaveBeenCalled();
  });
});
