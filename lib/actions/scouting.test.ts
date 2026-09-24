import { beforeEach, describe, expect, it, vi } from "vitest";
import { es } from "@/messages/es";

const mockRpc = vi.fn();
const mockGetUserId = vi.fn();
const mockRevalidatePath = vi.fn();
const mockRecomputeNow = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: mockRpc })),
  getUserId: () => mockGetUserId(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => mockRevalidatePath(path),
}));

vi.mock("@/lib/server/recompute-now", () => ({
  recomputeNow: (...args: unknown[]) => mockRecomputeNow(...args),
}));

const { submitScoutingVotes, submitPlaystyleVotes, submitStarVotes } = await import("./scouting");

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  mockRpc.mockReset();
  mockGetUserId.mockReset();
  mockRevalidatePath.mockReset();
  mockRecomputeNow.mockReset();
});

describe("submitScoutingVotes", () => {
  it("never calls rpc for a quick-mode key that isn't a face stat", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);

    const result = await submitScoutingVotes({
      groupId: GROUP_ID,
      targetPlayerId: TARGET_ID,
      mode: "quick",
      votes: { finishing: 5 },
    });

    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("accepts goalkeeper quick keys (the RPC decides whether the target is a keeper)", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await submitScoutingVotes({
      groupId: GROUP_ID,
      targetPlayerId: TARGET_ID,
      mode: "quick",
      votes: { div: 8, ref: 9, pac: 6 },
    });

    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("submit_scouting_votes", {
      p_target_player_id: TARGET_ID,
      p_mode: "quick",
      p_votes: { div: 8, ref: 9, pac: 6 },
    });
  });

  it("never calls rpc for a vote value out of range", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);

    const result = await submitScoutingVotes({
      groupId: GROUP_ID,
      targetPlayerId: TARGET_ID,
      mode: "quick",
      votes: { pac: 11 },
    });

    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns unauthenticated without calling rpc when there is no session", async () => {
    mockGetUserId.mockResolvedValue(null);

    const result = await submitScoutingVotes({
      groupId: GROUP_ID,
      targetPlayerId: TARGET_ID,
      mode: "quick",
      votes: { pac: 8 },
    });

    expect(result).toEqual({ ok: false, error: es.errors.unauthenticated });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("calls submit_scouting_votes with the right p_* args, recomputes, and revalidates", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockRecomputeNow.mockResolvedValue(undefined);

    const result = await submitScoutingVotes({
      groupId: GROUP_ID,
      targetPlayerId: TARGET_ID,
      mode: "quick",
      votes: { pac: 8, sho: 6 },
    });

    expect(mockRpc).toHaveBeenCalledWith("submit_scouting_votes", {
      p_target_player_id: TARGET_ID,
      p_mode: "quick",
      p_votes: { pac: 8, sho: 6 },
    });
    expect(mockRecomputeNow).toHaveBeenCalledWith([TARGET_ID]);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/g/${GROUP_ID}/jugadores/${TARGET_ID}`);
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("accepts detailed-mode sub-attribute keys (gk_* included)", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await submitScoutingVotes({
      groupId: GROUP_ID,
      targetPlayerId: TARGET_ID,
      mode: "detailed",
      votes: { finishing: 7, gk_diving: 4 },
    });

    expect(mockRpc).toHaveBeenCalledWith("submit_scouting_votes", {
      p_target_player_id: TARGET_ID,
      p_mode: "detailed",
      p_votes: { finishing: 7, gk_diving: 4 },
    });
  });

  it("maps a cooldown RPC error and does not recompute", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "PICADO_COOLDOWN: you must wait before revoting this player" },
    });

    const result = await submitScoutingVotes({
      groupId: GROUP_ID,
      targetPlayerId: TARGET_ID,
      mode: "quick",
      votes: { pac: 8 },
    });

    expect(result).toEqual({ ok: false, error: es.errors.cooldown });
    expect(mockRecomputeNow).not.toHaveBeenCalled();
  });

  it("still returns ok when recomputeNow throws", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockRecomputeNow.mockRejectedValue(new Error("boom"));

    const result = await submitScoutingVotes({
      groupId: GROUP_ID,
      targetPlayerId: TARGET_ID,
      mode: "quick",
      votes: { pac: 8 },
    });

    expect(result).toEqual({ ok: true, data: undefined });
  });
});

describe("submitPlaystyleVotes", () => {
  it("rejects more than 5 playstyles without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);

    const result = await submitPlaystyleVotes({
      groupId: GROUP_ID,
      targetPlayerId: TARGET_ID,
      playstyles: ["rapid", "flair", "technical", "trickster", "intercept", "block"],
    });

    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects duplicate playstyles without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);

    const result = await submitPlaystyleVotes({
      groupId: GROUP_ID,
      targetPlayerId: TARGET_ID,
      playstyles: ["rapid", "rapid"],
    });

    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects an unknown playstyle code without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);

    const result = await submitPlaystyleVotes({
      groupId: GROUP_ID,
      targetPlayerId: TARGET_ID,
      playstyles: ["not_a_playstyle"],
    });

    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("calls submit_playstyle_votes with the right p_* args and recomputes", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await submitPlaystyleVotes({ groupId: GROUP_ID, targetPlayerId: TARGET_ID, playstyles: ["rapid", "flair"] });

    expect(mockRpc).toHaveBeenCalledWith("submit_playstyle_votes", {
      p_target_player_id: TARGET_ID,
      p_playstyles: ["rapid", "flair"],
    });
    expect(mockRecomputeNow).toHaveBeenCalledWith([TARGET_ID]);
  });

  it("returns unauthenticated without calling rpc when there is no session", async () => {
    mockGetUserId.mockResolvedValue(null);

    const result = await submitPlaystyleVotes({ groupId: GROUP_ID, targetPlayerId: TARGET_ID, playstyles: ["rapid"] });

    expect(result).toEqual({ ok: false, error: es.errors.unauthenticated });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("submitStarVotes", () => {
  it("rejects when neither weakFoot nor skillMoves is provided", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);

    const result = await submitStarVotes({ groupId: GROUP_ID, targetPlayerId: TARGET_ID });

    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("passes null for the omitted field", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await submitStarVotes({ groupId: GROUP_ID, targetPlayerId: TARGET_ID, weakFoot: 4 });

    expect(mockRpc).toHaveBeenCalledWith("submit_star_votes", {
      p_target_player_id: TARGET_ID,
      p_weak_foot: 4,
      p_skill_moves: null,
    });
    expect(mockRecomputeNow).toHaveBeenCalledWith([TARGET_ID]);
  });

  it("maps a self-vote RPC error", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "PICADO_SELF_VOTE: you cannot vote for yourself" },
    });

    const result = await submitStarVotes({ groupId: GROUP_ID, targetPlayerId: TARGET_ID, weakFoot: 3, skillMoves: 3 });

    expect(result).toEqual({ ok: false, error: es.errors.selfVote });
  });
});
