import { beforeEach, describe, expect, it, vi } from "vitest";
import { es } from "@/messages/es";

const mockRpc = vi.fn();
const mockGetUserId = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: mockRpc })),
  getUserId: () => mockGetUserId(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => mockRevalidatePath(path),
}));

const { getLeaderboard, markNotificationsRead, updateNotificationPrefs, savePushSubscription, deletePushSubscription } =
  await import("./engagement");

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const NOTIF_ID = "33333333-3333-4333-8333-333333333333";
const PLAYER_ID = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  mockRpc.mockReset();
  mockGetUserId.mockReset();
  mockRevalidatePath.mockReset();
});

describe("getLeaderboard", () => {
  it("rejects an unknown metric without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    // @ts-expect-error intentionally invalid metric
    const result = await getLeaderboard({ groupId: GROUP_ID, metric: "trophies" });
    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns unauthenticated without calling rpc when there is no session", async () => {
    mockGetUserId.mockResolvedValue(null);
    const result = await getLeaderboard({ groupId: GROUP_ID, metric: "ovr" });
    expect(result).toEqual({ ok: false, error: es.errors.unauthenticated });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("calls get_group_leaderboard and maps rows to camelCase", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({
      data: [{ player_id: PLAYER_ID, display_name: "Juan", avatar_url: null, value: 78, rank: 1, matches_played: 12 }],
      error: null,
    });

    const result = await getLeaderboard({ groupId: GROUP_ID, metric: "ovr", limit: 10 });

    expect(mockRpc).toHaveBeenCalledWith("get_group_leaderboard", { p_group_id: GROUP_ID, p_metric: "ovr", p_limit: 10 });
    expect(result).toEqual({
      ok: true,
      data: [{ playerId: PLAYER_ID, displayName: "Juan", avatarUrl: null, value: 78, rank: 1, matchesPlayed: 12 }],
    });
  });

  it("maps a not-a-member RPC error", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: { message: "PICADO_NOT_MEMBER: you are not a member of this group" } });

    const result = await getLeaderboard({ groupId: GROUP_ID, metric: "goals" });

    expect(result).toEqual({ ok: false, error: es.errors.notMember });
  });
});

describe("markNotificationsRead", () => {
  it("returns unauthenticated without calling rpc when there is no session", async () => {
    mockGetUserId.mockResolvedValue(null);
    const result = await markNotificationsRead({ ids: [NOTIF_ID] });
    expect(result).toEqual({ ok: false, error: es.errors.unauthenticated });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("passes p_ids through and returns the updated count", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: 3, error: null });

    const result = await markNotificationsRead({ ids: [NOTIF_ID] });

    expect(mockRpc).toHaveBeenCalledWith("mark_notifications_read", { p_ids: [NOTIF_ID] });
    expect(result).toEqual({ ok: true, data: { count: 3 } });
  });

  it("defaults to marking every unread notification when called with no ids", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: 5, error: null });

    const result = await markNotificationsRead();

    expect(mockRpc).toHaveBeenCalledWith("mark_notifications_read", { p_ids: undefined });
    expect(result).toEqual({ ok: true, data: { count: 5 } });
  });
});

describe("updateNotificationPrefs", () => {
  it("rejects an unknown notification kind without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    // @ts-expect-error intentionally invalid kind
    const result = await updateNotificationPrefs({ prefs: { not_a_real_kind: false } });
    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean value without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    // @ts-expect-error intentionally invalid value type
    const result = await updateNotificationPrefs({ prefs: { match_finalized: "no" } });
    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("sends only the toggled keys (a partial merge, not the full set)", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await updateNotificationPrefs({ prefs: { match_finalized: false, badge_awarded: true } });

    expect(mockRpc).toHaveBeenCalledWith("update_notification_prefs", {
      p_prefs: { match_finalized: false, badge_awarded: true },
    });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/yo");
  });

  it("accepts an empty prefs object", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await updateNotificationPrefs({ prefs: {} });

    expect(result).toEqual({ ok: true, data: undefined });
  });
});

describe("savePushSubscription", () => {
  it("rejects an empty endpoint without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    const result = await savePushSubscription({ endpoint: "", p256dh: "p", auth: "a" });
    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns unauthenticated without calling rpc when there is no session", async () => {
    mockGetUserId.mockResolvedValue(null);
    const result = await savePushSubscription({ endpoint: "https://push.example/x", p256dh: "p", auth: "a" });
    expect(result).toEqual({ ok: false, error: es.errors.unauthenticated });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("calls save_push_subscription with the right p_* args and returns the id", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    const subId = "55555555-5555-4555-8555-555555555555";
    mockRpc.mockResolvedValue({ data: subId, error: null });

    const result = await savePushSubscription({
      endpoint: "https://push.example/x",
      p256dh: "p256dh-key",
      auth: "auth-key",
      userAgent: "Mozilla/5.0",
    });

    expect(mockRpc).toHaveBeenCalledWith("save_push_subscription", {
      p_endpoint: "https://push.example/x",
      p_p256dh: "p256dh-key",
      p_auth: "auth-key",
      p_user_agent: "Mozilla/5.0",
    });
    expect(result).toEqual({ ok: true, data: { id: subId } });
  });
});

describe("deletePushSubscription", () => {
  it("rejects an empty endpoint without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    const result = await deletePushSubscription({ endpoint: "" });
    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("calls delete_push_subscription with the endpoint", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await deletePushSubscription({ endpoint: "https://push.example/x" });

    expect(mockRpc).toHaveBeenCalledWith("delete_push_subscription", { p_endpoint: "https://push.example/x" });
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("maps a forbidden RPC error (another user's endpoint)", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: { message: "PICADO_FORBIDDEN: you cannot delete another user's push subscription" } });

    const result = await deletePushSubscription({ endpoint: "https://push.example/x" });

    expect(result).toEqual({ ok: false, error: es.errors.forbidden });
  });
});
