import { beforeEach, describe, expect, it, vi } from "vitest";
import { es } from "@/messages/es";

const mockRpc = vi.fn();
const mockGetUserId = vi.fn();
const mockRevalidatePath = vi.fn();
const mockFinalizeMatch = vi.fn();
const mockTables: Record<string, unknown> = {};

// Minimal query-builder stub: .from(t).select().eq().eq().maybeSingle() → { data: mockTables[t] }.
function queryFor(table: string) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: mockTables[table] ?? null, error: null }),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: mockRpc, from: queryFor })),
  getUserId: () => mockGetUserId(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/server/finalize-repo", () => ({ createSupabaseFinalizeRepo: () => ({}) }));
vi.mock("@/lib/server/finalize", () => ({
  finalizeMatch: (...args: unknown[]) => mockFinalizeMatch(...args),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => mockRevalidatePath(path),
}));

const { finalizeMatchNow } = await import("./finalize");

const MATCH_ID = "11111111-1111-4111-8111-111111111111";
const GROUP_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  mockRpc.mockReset();
  mockGetUserId.mockReset();
  mockRevalidatePath.mockReset();
  mockFinalizeMatch.mockReset();
  for (const key of Object.keys(mockTables)) delete mockTables[key];
  mockGetUserId.mockResolvedValue(USER_ID);
  mockRpc.mockResolvedValue({ error: null });
  mockFinalizeMatch.mockResolvedValue({ status: "finalized" });
});

describe("finalizeMatchNow", () => {
  it("rejects invalid input", async () => {
    expect(await finalizeMatchNow({ matchId: "nope" })).toEqual({ ok: false, error: es.errors.validation });
    expect(mockFinalizeMatch).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers", async () => {
    mockGetUserId.mockResolvedValue(null);
    expect(await finalizeMatchNow({ matchId: MATCH_ID })).toEqual({ ok: false, error: es.errors.unauthenticated });
    expect(mockFinalizeMatch).not.toHaveBeenCalled();
  });

  it("rejects a match the caller cannot see", async () => {
    expect(await finalizeMatchNow({ matchId: MATCH_ID })).toEqual({ ok: false, error: es.errors.notMember });
    expect(mockFinalizeMatch).not.toHaveBeenCalled();
  });

  it("rejects non-admin members without calling the RPC or the finalizer", async () => {
    mockTables.matches = { group_id: GROUP_ID, status: "pending_finalize" };
    mockTables.group_members = { role: "member" };
    expect(await finalizeMatchNow({ matchId: MATCH_ID })).toEqual({ ok: false, error: es.errors.forbidden });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFinalizeMatch).not.toHaveBeenCalled();
  });

  it("closes the windows for a reporting match, then finalizes", async () => {
    mockTables.matches = { group_id: GROUP_ID, status: "reporting" };
    mockTables.group_members = { role: "admin" };
    const result = await finalizeMatchNow({ matchId: MATCH_ID });
    expect(result).toEqual({ ok: true, data: { outcome: { status: "finalized" } } });
    expect(mockRpc).toHaveBeenCalledWith("request_finalize", { p_match_id: MATCH_ID });
    expect(mockFinalizeMatch).toHaveBeenCalledTimes(1);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/g/${GROUP_ID}/partidos/${MATCH_ID}`);
  });

  it("skips the RPC for a match already pending finalize", async () => {
    mockTables.matches = { group_id: GROUP_ID, status: "pending_finalize" };
    mockTables.group_members = { role: "owner" };
    const result = await finalizeMatchNow({ matchId: MATCH_ID });
    expect(result.ok).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFinalizeMatch).toHaveBeenCalledTimes(1);
  });

  it("maps RPC errors and does not finalize", async () => {
    mockTables.matches = { group_id: GROUP_ID, status: "reporting" };
    mockTables.group_members = { role: "admin" };
    mockRpc.mockResolvedValue({ error: { message: "PICADO_FORBIDDEN: only group admins can request finalization" } });
    expect(await finalizeMatchNow({ matchId: MATCH_ID })).toEqual({ ok: false, error: es.errors.forbidden });
    expect(mockFinalizeMatch).not.toHaveBeenCalled();
  });

  it("maps a raw tournament sync error before returning it", async () => {
    mockTables.matches = { group_id: GROUP_ID, status: "pending_finalize" };
    mockTables.group_members = { role: "admin" };
    mockFinalizeMatch.mockResolvedValue({
      matchId: MATCH_ID,
      status: "finalized",
      tournamentSyncError: "PICADO_KO_DRAW: a knockout match cannot end in a draw",
    });
    const result = await finalizeMatchNow({ matchId: MATCH_ID });
    expect(result).toEqual({
      ok: true,
      data: { outcome: { matchId: MATCH_ID, status: "finalized", tournamentSyncError: es.common.error } },
    });
  });

  it("never leaks a finalizer exception", async () => {
    mockTables.matches = { group_id: GROUP_ID, status: "pending_finalize" };
    mockTables.group_members = { role: "admin" };
    mockFinalizeMatch.mockRejectedValue(new Error("duplicate key value violates unique constraint"));
    expect(await finalizeMatchNow({ matchId: MATCH_ID })).toEqual({ ok: false, error: es.common.error });
  });
});
