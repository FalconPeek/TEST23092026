import { beforeEach, describe, expect, it, vi } from "vitest";
import { es } from "@/messages/es";
import { defaultGroupSettings } from "@/lib/settings/group";

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

const {
  createGroup,
  updateGroup,
  createInvite,
  revokeInvite,
  acceptInvite,
  setMemberRole,
  transferOwnership,
  removeMember,
  leaveGroup,
  addGuestPlayer,
  claimGuestPlayer,
  assignGuestPlayer,
  updateMyPlayer,
  updatePlayer,
} = await import("./groups");

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_USER_ID = "33333333-3333-4333-8333-333333333333";
const PLAYER_ID = "44444444-4444-4444-8444-444444444444";
const INVITE_ID = "55555555-5555-4555-8555-555555555555";

beforeEach(() => {
  mockRpc.mockReset();
  mockGetUserId.mockReset();
  mockRevalidatePath.mockReset();
});

describe("createGroup", () => {
  it("never calls rpc when the input is invalid", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    const result = await createGroup({ name: "" });
    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns unauthenticated when there is no session, without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(null);
    const result = await createGroup({ name: "Los Pibes" });
    expect(result).toEqual({ ok: false, error: es.errors.unauthenticated });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("calls create_group with p_name and returns the groupId, then revalidates /g", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: GROUP_ID, error: null });

    const result = await createGroup({ name: "Los Pibes" });

    expect(mockRpc).toHaveBeenCalledWith("create_group", { p_name: "Los Pibes" });
    expect(result).toEqual({ ok: true, data: { groupId: GROUP_ID } });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/g");
  });

  it("maps an RPC error instead of leaking it", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "PICADO_VALIDATION: group name must be between 1 and 60 characters" },
    });

    const result = await createGroup({ name: "Los Pibes" });

    expect(result).toEqual({ ok: false, error: es.errors.validation });
  });
});

describe("updateGroup", () => {
  it("applies group settings defaults for a partial/empty settings object", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await updateGroup({ groupId: GROUP_ID, name: "Grupo", settings: {} });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(mockRpc).toHaveBeenCalledWith("update_group", {
      p_group_id: GROUP_ID,
      p_name: "Grupo",
      p_settings: defaultGroupSettings,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/g/${GROUP_ID}`);
  });

  it("rejects an invalid groupId without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    const result = await updateGroup({ groupId: "not-a-uuid", name: "Grupo", settings: {} });
    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("maps a forbidden RPC error", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "PICADO_FORBIDDEN: only group admins can update the group" },
    });

    const result = await updateGroup({ groupId: GROUP_ID, name: "Grupo", settings: {} });

    expect(result).toEqual({ ok: false, error: es.errors.forbidden });
  });
});

describe("createInvite", () => {
  it("passes explicit nulls for no-expiration/no-limit and builds the invite url", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: [{ id: INVITE_ID, code: "ABC123" }], error: null });

    const result = await createInvite({
      groupId: GROUP_ID,
      role: "member",
      expiresInDays: null,
      maxUses: null,
    });

    expect(mockRpc).toHaveBeenCalledWith("create_invite", {
      p_group_id: GROUP_ID,
      p_role: "member",
      p_expires_at: null,
      p_max_uses: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        id: INVITE_ID,
        code: "ABC123",
        url: expect.stringContaining("/invitacion/ABC123"),
      });
    }
  });

  it("rejects role 'owner' at the schema level without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    const result = await createInvite({
      groupId: GROUP_ID,
      // @ts-expect-error owner is intentionally not an accepted invite role
      role: "owner",
      expiresInDays: null,
      maxUses: null,
    });
    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("revokeInvite", () => {
  it("calls revoke_invite with only the invite id and revalidates the group page", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await revokeInvite({ groupId: GROUP_ID, inviteId: INVITE_ID });

    expect(mockRpc).toHaveBeenCalledWith("revoke_invite", { p_invite_id: INVITE_ID });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/g/${GROUP_ID}`);
  });
});

describe("acceptInvite", () => {
  it("maps an expired invite error", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "PICADO_INVITE_INVALID: invite expired" },
    });

    const result = await acceptInvite({ code: "ABC123" });

    expect(result).toEqual({ ok: false, error: es.errors.inviteExpired });
  });

  it("returns the groupId on success", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: GROUP_ID, error: null });

    const result = await acceptInvite({ code: "ABC123" });

    expect(mockRpc).toHaveBeenCalledWith("accept_invite", { p_code: "ABC123" });
    expect(result).toEqual({ ok: true, data: { groupId: GROUP_ID } });
  });
});

describe("setMemberRole", () => {
  it("calls set_member_role with the right p_* args", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await setMemberRole({ groupId: GROUP_ID, userId: OTHER_USER_ID, role: "admin" });

    expect(mockRpc).toHaveBeenCalledWith("set_member_role", {
      p_group_id: GROUP_ID,
      p_user_id: OTHER_USER_ID,
      p_role: "admin",
    });
    expect(result).toEqual({ ok: true, data: undefined });
  });
});

describe("transferOwnership", () => {
  it("calls transfer_ownership with the right p_* args", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await transferOwnership({ groupId: GROUP_ID, newOwnerId: OTHER_USER_ID });

    expect(mockRpc).toHaveBeenCalledWith("transfer_ownership", {
      p_group_id: GROUP_ID,
      p_new_owner: OTHER_USER_ID,
    });
  });
});

describe("removeMember", () => {
  it("maps the owner-cannot-be-removed error", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "PICADO_FORBIDDEN: the owner cannot be removed" },
    });

    const result = await removeMember({ groupId: GROUP_ID, userId: OTHER_USER_ID });

    expect(result).toEqual({ ok: false, error: es.errors.ownerCannotBeRemoved });
  });
});

describe("leaveGroup", () => {
  it("maps the owner-must-transfer-first error", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "PICADO_FORBIDDEN: transfer ownership before leaving the group" },
    });

    const result = await leaveGroup({ groupId: GROUP_ID });

    expect(result).toEqual({ ok: false, error: es.errors.ownerCannotLeave });
    expect(mockRpc).toHaveBeenCalledWith("leave_group", { p_group_id: GROUP_ID });
  });
});

describe("addGuestPlayer", () => {
  it("calls add_guest_player and returns the playerId", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: PLAYER_ID, error: null });

    const result = await addGuestPlayer({ groupId: GROUP_ID, displayName: "Fulano" });

    expect(mockRpc).toHaveBeenCalledWith("add_guest_player", {
      p_group_id: GROUP_ID,
      p_display_name: "Fulano",
      p_primary_position: undefined,
    });
    expect(result).toEqual({ ok: true, data: { playerId: PLAYER_ID } });
  });
});

describe("claimGuestPlayer", () => {
  it("calls claim_guest_player with only the player id", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await claimGuestPlayer({ groupId: GROUP_ID, playerId: PLAYER_ID });

    expect(mockRpc).toHaveBeenCalledWith("claim_guest_player", { p_player_id: PLAYER_ID });
  });
});

describe("assignGuestPlayer", () => {
  it("calls assign_guest_player with the right p_* args", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await assignGuestPlayer({ groupId: GROUP_ID, playerId: PLAYER_ID, userId: OTHER_USER_ID });

    expect(mockRpc).toHaveBeenCalledWith("assign_guest_player", {
      p_player_id: PLAYER_ID,
      p_user_id: OTHER_USER_ID,
    });
  });
});

describe("updateMyPlayer", () => {
  it("rejects alt positions that include the primary position, without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);

    const result = await updateMyPlayer({
      groupId: GROUP_ID,
      displayName: "Fulano",
      primaryPosition: "DC",
      altPositions: ["DC", "MC"],
    });

    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects duplicate alt positions, without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);

    const result = await updateMyPlayer({
      groupId: GROUP_ID,
      displayName: "Fulano",
      altPositions: ["MC", "MC"],
    });

    expect(result).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("calls update_my_player with the right p_* args on the happy path", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await updateMyPlayer({
      groupId: GROUP_ID,
      displayName: "Fulano",
      primaryPosition: "DC",
      altPositions: ["SD"],
      preferredFoot: "right",
      heightCm: 180,
    });

    expect(mockRpc).toHaveBeenCalledWith("update_my_player", {
      p_group_id: GROUP_ID,
      p_display_name: "Fulano",
      p_primary_position: "DC",
      p_alt_positions: ["SD"],
      p_preferred_foot: "right",
      p_height_cm: 180,
    });
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("returns unauthenticated without calling rpc when there is no session", async () => {
    mockGetUserId.mockResolvedValue(null);

    const result = await updateMyPlayer({ groupId: GROUP_ID, displayName: "Fulano" });

    expect(result).toEqual({ ok: false, error: es.errors.unauthenticated });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("updatePlayer", () => {
  it("calls update_player with the right p_* args", async () => {
    mockGetUserId.mockResolvedValue(USER_ID);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await updatePlayer({
      groupId: GROUP_ID,
      playerId: PLAYER_ID,
      displayName: "Fulano",
      primaryPosition: "POR",
    });

    expect(mockRpc).toHaveBeenCalledWith("update_player", {
      p_player_id: PLAYER_ID,
      p_display_name: "Fulano",
      p_primary_position: "POR",
      p_alt_positions: undefined,
      p_preferred_foot: undefined,
      p_height_cm: undefined,
    });
  });
});
