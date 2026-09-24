import { beforeEach, describe, expect, it, vi } from "vitest";
import { es } from "@/messages/es";

const mockRpc = vi.fn();
const mockGetUserId = vi.fn();
const mockRevalidatePath = vi.fn();
const mockLoadTournament = vi.fn();
const mockCreateSupabaseTournamentRepo = vi.fn();
const mockGenerateBracket = vi.fn();
const mockBuildIndividualEntries = vi.fn();
const mockAfterTournamentMatchCompleted = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: mockRpc })),
  getUserId: () => mockGetUserId(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => mockRevalidatePath(path),
}));

// generateBracket/buildIndividualEntries/afterTournamentMatchCompleted are unit-tested against a
// fake repo in lib/server/tournaments.test.ts; here we only need to verify the action wires zod
// validation, auth, the repo/rng plumbing and error mapping correctly, so they're mocked.
vi.mock("@/lib/server/tournament-repo", () => ({
  createSupabaseTournamentRepo: (...args: unknown[]) => mockCreateSupabaseTournamentRepo(...args),
}));
vi.mock("@/lib/server/tournaments", () => ({
  generateBracket: (...args: unknown[]) => mockGenerateBracket(...args),
  buildIndividualEntries: (...args: unknown[]) => mockBuildIndividualEntries(...args),
  afterTournamentMatchCompleted: (...args: unknown[]) => mockAfterTournamentMatchCompleted(...args),
}));

const {
  createTournament,
  updateTournament,
  setTournamentStatus,
  registerForTournament,
  unregisterFromTournament,
  saveTournamentEntries,
  generateTournamentBracket,
  startTournamentMatch,
  confirmTournamentResult,
  editTournamentResult,
} = await import("./tournaments");

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const TOURNAMENT_ID = "33333333-3333-4333-8333-333333333333";
const TOURNAMENT_MATCH_ID = "44444444-4444-4444-8444-444444444444";
const ENTRY_ID = "55555555-5555-4555-8555-555555555555";

beforeEach(() => {
  mockRpc.mockReset();
  mockGetUserId.mockReset();
  mockRevalidatePath.mockReset();
  mockLoadTournament.mockReset();
  mockCreateSupabaseTournamentRepo.mockReset();
  mockCreateSupabaseTournamentRepo.mockReturnValue({ loadTournament: mockLoadTournament });
  mockGenerateBracket.mockReset();
  mockBuildIndividualEntries.mockReset();
  mockAfterTournamentMatchCompleted.mockReset();
  mockGetUserId.mockResolvedValue(USER_ID);
});

describe("createTournament", () => {
  it("rejects an invalid name without calling rpc", async () => {
    const result = await createTournament({
      groupId: GROUP_ID,
      name: "",
      format: "single_elim",
      teamSize: 5,
    });
    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects invalid settings without calling rpc", async () => {
    const result = await createTournament({
      groupId: GROUP_ID,
      name: "Copa",
      format: "single_elim",
      teamSize: 5,
      settings: { tiebreakers: [] }, // empty array fails the schema's .min(1)
    });
    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("parses settings with defaults applied and creates the tournament", async () => {
    mockRpc.mockResolvedValue({ data: TOURNAMENT_ID, error: null });

    const result = await createTournament({
      groupId: GROUP_ID,
      name: "Copa",
      format: "single_elim",
      teamSize: 5,
    });

    expect(result).toEqual({ ok: true, data: { tournamentId: TOURNAMENT_ID } });
    expect(mockRpc).toHaveBeenCalledWith(
      "create_tournament",
      expect.objectContaining({
        p_group_id: GROUP_ID,
        p_name: "Copa",
        p_format: "single_elim",
        p_team_size: 5,
        p_entry_mode: "teams",
        p_settings: expect.objectContaining({ seeding: "ovr" }),
      }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/g/${GROUP_ID}/torneos`);
  });

  it("maps an RPC error instead of leaking it", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "PICADO_FORBIDDEN: only group admins can create a tournament" } });
    const result = await createTournament({ groupId: GROUP_ID, name: "Copa", format: "league", teamSize: 5 });
    expect(result).toEqual({ ok: false, error: es.errors.forbidden });
  });
});

describe("updateTournament", () => {
  it("validates settings before calling rpc", async () => {
    const result = await updateTournament({
      tournamentId: TOURNAMENT_ID,
      groupId: GROUP_ID,
      name: "Copa",
      settings: { points: { win: -1 } },
    });
    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("calls update_tournament and revalidates both paths", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const result = await updateTournament({ tournamentId: TOURNAMENT_ID, groupId: GROUP_ID, name: "Copa", settings: {} });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(mockRpc).toHaveBeenCalledWith(
      "update_tournament",
      expect.objectContaining({ p_tournament_id: TOURNAMENT_ID, p_name: "Copa" }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/g/${GROUP_ID}/torneos`);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/g/${GROUP_ID}/torneos/${TOURNAMENT_ID}`);
  });
});

describe("setTournamentStatus", () => {
  it("calls set_tournament_status with the given status", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const result = await setTournamentStatus({ tournamentId: TOURNAMENT_ID, groupId: GROUP_ID, status: "registration" });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(mockRpc).toHaveBeenCalledWith("set_tournament_status", {
      p_tournament_id: TOURNAMENT_ID,
      p_status: "registration",
    });
  });
});

describe("registerForTournament / unregisterFromTournament", () => {
  it("registers", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const result = await registerForTournament({ tournamentId: TOURNAMENT_ID, groupId: GROUP_ID });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(mockRpc).toHaveBeenCalledWith("register_for_tournament", { p_tournament_id: TOURNAMENT_ID });
  });

  it("unregisters", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const result = await unregisterFromTournament({ tournamentId: TOURNAMENT_ID, groupId: GROUP_ID });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(mockRpc).toHaveBeenCalledWith("unregister_from_tournament", { p_tournament_id: TOURNAMENT_ID });
  });

  it("maps the spectator-forbidden error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "PICADO_FORBIDDEN: spectators cannot register for a tournament" } });
    const result = await registerForTournament({ tournamentId: TOURNAMENT_ID, groupId: GROUP_ID });
    expect(result).toEqual({ ok: false, error: es.errors.forbidden });
  });
});

describe("saveTournamentEntries", () => {
  it("requires at least one entry", async () => {
    const result = await saveTournamentEntries({ tournamentId: TOURNAMENT_ID, groupId: GROUP_ID, entries: [] });
    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("maps entries to the snake_case RPC payload", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const result = await saveTournamentEntries({
      tournamentId: TOURNAMENT_ID,
      groupId: GROUP_ID,
      entries: [{ name: "Equipo 1", seed: 1, playerIds: [ENTRY_ID] }, { name: "Equipo 2", playerIds: [] }],
    });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(mockRpc).toHaveBeenCalledWith("save_tournament_entries", {
      p_tournament_id: TOURNAMENT_ID,
      p_entries: [
        { name: "Equipo 1", seed: 1, player_ids: [ENTRY_ID] },
        { name: "Equipo 2", seed: null, player_ids: [] },
      ],
    });
  });
});

describe("generateTournamentBracket", () => {
  it("returns validation when the tournament doesn't exist", async () => {
    mockLoadTournament.mockResolvedValue(null);
    const result = await generateTournamentBracket({ tournamentId: TOURNAMENT_ID, groupId: GROUP_ID });
    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockGenerateBracket).not.toHaveBeenCalled();
  });

  it("teams mode: calls generateBracket without building individual entries first", async () => {
    mockLoadTournament.mockResolvedValue({ entryMode: "teams" });
    mockGenerateBracket.mockResolvedValue(undefined);

    const result = await generateTournamentBracket({ tournamentId: TOURNAMENT_ID, groupId: GROUP_ID });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(mockBuildIndividualEntries).not.toHaveBeenCalled();
    expect(mockGenerateBracket).toHaveBeenCalledTimes(1);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/g/${GROUP_ID}/torneos`);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/g/${GROUP_ID}/torneos/${TOURNAMENT_ID}`);
  });

  it("individual mode: builds entries before generating the bracket", async () => {
    mockLoadTournament.mockResolvedValue({ entryMode: "individual" });
    mockBuildIndividualEntries.mockResolvedValue(undefined);
    mockGenerateBracket.mockResolvedValue(undefined);

    const result = await generateTournamentBracket({ tournamentId: TOURNAMENT_ID, groupId: GROUP_ID });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(mockBuildIndividualEntries).toHaveBeenCalledTimes(1);
    expect(mockGenerateBracket).toHaveBeenCalledTimes(1);
  });

  it("maps a PICADO_-prefixed thrown error", async () => {
    mockLoadTournament.mockResolvedValue({ entryMode: "teams" });
    mockGenerateBracket.mockRejectedValue(new Error("PICADO_ALREADY_GENERATED: this tournament already has a bracket"));

    const result = await generateTournamentBracket({ tournamentId: TOURNAMENT_ID, groupId: GROUP_ID });

    // mapCaughtError routes this through the shared mapDbError, which maps this specific M4
    // code -- never leaks the raw message or throws.
    expect(result).toEqual({ ok: false, error: es.errors.tournamentAlreadyGenerated });
  });

  it("maps a plain engine error (e.g. fewer than 2 entries) to the generic error", async () => {
    mockLoadTournament.mockResolvedValue({ entryMode: "teams" });
    mockGenerateBracket.mockRejectedValue(new Error("a tournament needs at least 2 entries to generate a bracket"));

    const result = await generateTournamentBracket({ tournamentId: TOURNAMENT_ID, groupId: GROUP_ID });

    expect(result).toEqual({ ok: false, error: es.common.error });
  });

  it("still succeeds when the best-effort tournament_generated notification can't be sent (no SUPABASE_SECRET_KEY here)", async () => {
    mockLoadTournament.mockResolvedValue({ entryMode: "teams" });
    mockGenerateBracket.mockResolvedValue(undefined);

    const result = await generateTournamentBracket({ tournamentId: TOURNAMENT_ID, groupId: GROUP_ID });

    expect(result).toEqual({ ok: true, data: undefined });
  });
});

describe("startTournamentMatch", () => {
  it("links the real match and returns its id", async () => {
    const matchId = "66666666-6666-4666-8666-666666666666";
    mockRpc.mockResolvedValue({ data: matchId, error: null });

    const result = await startTournamentMatch({
      tournamentMatchId: TOURNAMENT_MATCH_ID,
      tournamentId: TOURNAMENT_ID,
      groupId: GROUP_ID,
      scheduledAt: new Date().toISOString(),
    });

    expect(result).toEqual({ ok: true, data: { matchId } });
    expect(mockRpc).toHaveBeenCalledWith("link_tournament_match", expect.objectContaining({
      p_tournament_match_id: TOURNAMENT_MATCH_ID,
    }));
  });

  it("rejects an invalid date", async () => {
    const result = await startTournamentMatch({
      tournamentMatchId: TOURNAMENT_MATCH_ID,
      tournamentId: TOURNAMENT_ID,
      groupId: GROUP_ID,
      scheduledAt: "not-a-date",
    });
    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("confirmTournamentResult / editTournamentResult", () => {
  it("confirms a result, best-effort advances the tournament, and revalidates", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockAfterTournamentMatchCompleted.mockResolvedValue(undefined);

    const result = await confirmTournamentResult({
      tournamentMatchId: TOURNAMENT_MATCH_ID,
      tournamentId: TOURNAMENT_ID,
      groupId: GROUP_ID,
      score1: 2,
      score2: 1,
    });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(mockRpc).toHaveBeenCalledWith("confirm_match_result", expect.objectContaining({
      p_tournament_match_id: TOURNAMENT_MATCH_ID,
      p_score1: 2,
      p_score2: 1,
    }));
    expect(mockAfterTournamentMatchCompleted).toHaveBeenCalledTimes(1);
  });

  it("still returns ok when afterTournamentMatchCompleted resolves newlyReadyMatches (best-effort champion/ready notifications can't be sent without SUPABASE_SECRET_KEY here)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockAfterTournamentMatchCompleted.mockResolvedValue({ newlyReadyMatches: [{ round: 2, entryIds: [ENTRY_ID, "e2"] }] });

    const result = await confirmTournamentResult({
      tournamentMatchId: TOURNAMENT_MATCH_ID,
      tournamentId: TOURNAMENT_ID,
      groupId: GROUP_ID,
      score1: 2,
      score2: 1,
    });

    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("still returns ok when the confirmed result's bracket-advancement step throws", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockAfterTournamentMatchCompleted.mockRejectedValue(new Error("boom"));

    const result = await confirmTournamentResult({
      tournamentMatchId: TOURNAMENT_MATCH_ID,
      tournamentId: TOURNAMENT_ID,
      groupId: GROUP_ID,
      score1: 2,
      score2: 1,
    });

    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("maps a PICADO_KO_DRAW rpc error and never calls afterTournamentMatchCompleted", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "PICADO_KO_DRAW: a tied knockout match requires penalties or a manual/walkover decision" },
    });

    const result = await confirmTournamentResult({
      tournamentMatchId: TOURNAMENT_MATCH_ID,
      tournamentId: TOURNAMENT_ID,
      groupId: GROUP_ID,
      score1: 1,
      score2: 1,
    });

    expect(result).toEqual({ ok: false, error: es.errors.koDrawNeedsDecision });
    expect(mockAfterTournamentMatchCompleted).not.toHaveBeenCalled();
  });

  it("edits a result via edit_match_result", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockAfterTournamentMatchCompleted.mockResolvedValue(undefined);

    const result = await editTournamentResult({
      tournamentMatchId: TOURNAMENT_MATCH_ID,
      tournamentId: TOURNAMENT_ID,
      groupId: GROUP_ID,
      score1: 3,
      score2: 3,
      decidedBy: "manual",
      winnerEntryId: ENTRY_ID,
    });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(mockRpc).toHaveBeenCalledWith("edit_match_result", expect.objectContaining({
      p_tournament_match_id: TOURNAMENT_MATCH_ID,
      p_score1: 3,
      p_score2: 3,
      p_decided_by: "manual",
      p_winner_entry_id: ENTRY_ID,
    }));
  });

  it("rejects an unauthenticated caller", async () => {
    mockGetUserId.mockResolvedValue(null);
    const result = await editTournamentResult({
      tournamentMatchId: TOURNAMENT_MATCH_ID,
      tournamentId: TOURNAMENT_ID,
      groupId: GROUP_ID,
      score1: 1,
      score2: 0,
    });
    expect(result).toEqual({ ok: false, error: es.errors.unauthenticated });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
