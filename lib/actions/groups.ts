"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/env";
import { groupSettingsSchema } from "@/lib/settings/group";
import { POSITIONS, type PositionCode } from "@/lib/rating/positions";
import { ok, fail, type ActionResult } from "@/lib/actions/result";
import { mapDbError } from "@/lib/actions/errors";
import type { Json } from "@/lib/supabase/database.types";

const uuid = z.uuid();
const nameField = z.string().trim().min(1).max(60);
const positionEnum = z.enum(POSITIONS);
const memberRoleEnum = z.enum(["member", "spectator", "admin"]);
const preferredFootEnum = z.enum(["left", "right", "both"]);

function altPositionsValid(v: { primaryPosition?: PositionCode; altPositions?: PositionCode[] }): boolean {
  if (!v.altPositions) return true;
  const noDupes = new Set(v.altPositions).size === v.altPositions.length;
  const noPrimary = !v.primaryPosition || !v.altPositions.includes(v.primaryPosition);
  return noDupes && noPrimary;
}

const playerFieldsShape = {
  displayName: nameField,
  primaryPosition: positionEnum.optional(),
  altPositions: z.array(positionEnum).max(4).optional(),
  preferredFoot: preferredFootEnum.optional(),
  heightCm: z.int().min(120).max(230).optional(),
};

// --- createGroup ------------------------------------------------------------------------

const createGroupSchema = z.object({ name: nameField });

export async function createGroup(input: {
  name: string;
}): Promise<ActionResult<{ groupId: string }>> {
  const parsed = createGroupSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_group", { p_name: parsed.data.name });
  if (error || !data) return fail(mapDbError(error));

  revalidatePath("/g");
  return ok({ groupId: data });
}

// --- updateGroup --------------------------------------------------------------------------

const updateGroupSchema = z.object({
  groupId: uuid,
  name: nameField,
  settings: z.unknown(),
});

export async function updateGroup(input: {
  groupId: string;
  name: string;
  settings: unknown;
}): Promise<ActionResult<void>> {
  const parsed = updateGroupSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const settingsResult = groupSettingsSchema.safeParse(parsed.data.settings);
  if (!settingsResult.success) return fail(es.errors.validation);

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_group", {
    p_group_id: parsed.data.groupId,
    p_name: parsed.data.name,
    p_settings: settingsResult.data as unknown as Json,
  });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}`);
  return ok(undefined);
}

// --- createInvite -------------------------------------------------------------------------

const createInviteSchema = z.object({
  groupId: uuid,
  role: memberRoleEnum,
  expiresInDays: z.union([z.int().min(1).max(90), z.null()]),
  maxUses: z.union([z.int().min(1).max(1000), z.null()]),
});

export async function createInvite(input: {
  groupId: string;
  role: "member" | "spectator" | "admin";
  expiresInDays: number | null;
  maxUses: number | null;
}): Promise<ActionResult<{ id: string; code: string; url: string }>> {
  const parsed = createInviteSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const { groupId, role, expiresInDays, maxUses } = parsed.data;
  const expiresAt =
    expiresInDays === null ? null : new Date(Date.now() + expiresInDays * 86_400_000).toISOString();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invite", {
    p_group_id: groupId,
    p_role: role,
    p_expires_at: expiresAt as unknown as string | undefined,
    p_max_uses: maxUses as unknown as number | undefined,
  });
  if (error || !data || data.length === 0) return fail(mapDbError(error));

  const invite = data[0]!;
  revalidatePath(`/g/${groupId}`);
  return ok({ id: invite.id, code: invite.code, url: `${siteUrl()}invitacion/${invite.code}` });
}

// --- revokeInvite -------------------------------------------------------------------------

const revokeInviteSchema = z.object({ groupId: uuid, inviteId: uuid });

export async function revokeInvite(input: {
  groupId: string;
  inviteId: string;
}): Promise<ActionResult<void>> {
  const parsed = revokeInviteSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invite", { p_invite_id: parsed.data.inviteId });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}`);
  return ok(undefined);
}

// --- acceptInvite -------------------------------------------------------------------------

const acceptInviteSchema = z.object({ code: z.string().trim().min(1) });

export async function acceptInvite(input: {
  code: string;
}): Promise<ActionResult<{ groupId: string }>> {
  const parsed = acceptInviteSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invite", { p_code: parsed.data.code });
  if (error || !data) return fail(mapDbError(error));

  revalidatePath("/g");
  return ok({ groupId: data });
}

// --- setMemberRole ------------------------------------------------------------------------

const setMemberRoleSchema = z.object({
  groupId: uuid,
  userId: uuid,
  role: memberRoleEnum,
});

export async function setMemberRole(input: {
  groupId: string;
  userId: string;
  role: "member" | "spectator" | "admin";
}): Promise<ActionResult<void>> {
  const parsed = setMemberRoleSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const authUserId = await getUserId();
  if (!authUserId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_role", {
    p_group_id: parsed.data.groupId,
    p_user_id: parsed.data.userId,
    p_role: parsed.data.role,
  });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}`);
  return ok(undefined);
}

// --- transferOwnership --------------------------------------------------------------------

const transferOwnershipSchema = z.object({ groupId: uuid, newOwnerId: uuid });

export async function transferOwnership(input: {
  groupId: string;
  newOwnerId: string;
}): Promise<ActionResult<void>> {
  const parsed = transferOwnershipSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_ownership", {
    p_group_id: parsed.data.groupId,
    p_new_owner: parsed.data.newOwnerId,
  });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}`);
  return ok(undefined);
}

// --- removeMember -------------------------------------------------------------------------

const removeMemberSchema = z.object({ groupId: uuid, userId: uuid });

export async function removeMember(input: {
  groupId: string;
  userId: string;
}): Promise<ActionResult<void>> {
  const parsed = removeMemberSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const authUserId = await getUserId();
  if (!authUserId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", {
    p_group_id: parsed.data.groupId,
    p_user_id: parsed.data.userId,
  });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}`);
  return ok(undefined);
}

// --- leaveGroup ---------------------------------------------------------------------------

const leaveGroupSchema = z.object({ groupId: uuid });

export async function leaveGroup(input: { groupId: string }): Promise<ActionResult<void>> {
  const parsed = leaveGroupSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_group", { p_group_id: parsed.data.groupId });
  if (error) return fail(mapDbError(error));

  revalidatePath("/g");
  return ok(undefined);
}

// --- addGuestPlayer -----------------------------------------------------------------------

const addGuestPlayerSchema = z.object({
  groupId: uuid,
  displayName: nameField,
  primaryPosition: positionEnum.optional(),
});

export async function addGuestPlayer(input: {
  groupId: string;
  displayName: string;
  primaryPosition?: PositionCode;
}): Promise<ActionResult<{ playerId: string }>> {
  const parsed = addGuestPlayerSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_guest_player", {
    p_group_id: parsed.data.groupId,
    p_display_name: parsed.data.displayName,
    p_primary_position: parsed.data.primaryPosition,
  });
  if (error || !data) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}`);
  return ok({ playerId: data });
}

// --- claimGuestPlayer ---------------------------------------------------------------------

const claimGuestPlayerSchema = z.object({ groupId: uuid, playerId: uuid });

export async function claimGuestPlayer(input: {
  groupId: string;
  playerId: string;
}): Promise<ActionResult<void>> {
  const parsed = claimGuestPlayerSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_guest_player", { p_player_id: parsed.data.playerId });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}`);
  return ok(undefined);
}

// --- assignGuestPlayer --------------------------------------------------------------------

const assignGuestPlayerSchema = z.object({ groupId: uuid, playerId: uuid, userId: uuid });

export async function assignGuestPlayer(input: {
  groupId: string;
  playerId: string;
  userId: string;
}): Promise<ActionResult<void>> {
  const parsed = assignGuestPlayerSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const authUserId = await getUserId();
  if (!authUserId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_guest_player", {
    p_player_id: parsed.data.playerId,
    p_user_id: parsed.data.userId,
  });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}`);
  return ok(undefined);
}

// --- updateMyPlayer -----------------------------------------------------------------------

const updateMyPlayerSchema = z
  .object({ groupId: uuid, ...playerFieldsShape })
  .refine(altPositionsValid, {
    message: "alt positions must be unique and exclude the primary position",
    path: ["altPositions"],
  });

export async function updateMyPlayer(input: {
  groupId: string;
  displayName: string;
  primaryPosition?: PositionCode;
  altPositions?: PositionCode[];
  preferredFoot?: "left" | "right" | "both";
  heightCm?: number;
}): Promise<ActionResult<void>> {
  const parsed = updateMyPlayerSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_player", {
    p_group_id: parsed.data.groupId,
    p_display_name: parsed.data.displayName,
    p_primary_position: parsed.data.primaryPosition,
    p_alt_positions: parsed.data.altPositions,
    p_preferred_foot: parsed.data.preferredFoot,
    p_height_cm: parsed.data.heightCm,
  });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}`);
  return ok(undefined);
}

// --- updatePlayer -------------------------------------------------------------------------

const updatePlayerSchema = z
  .object({ groupId: uuid, playerId: uuid, ...playerFieldsShape })
  .refine(altPositionsValid, {
    message: "alt positions must be unique and exclude the primary position",
    path: ["altPositions"],
  });

export async function updatePlayer(input: {
  groupId: string;
  playerId: string;
  displayName: string;
  primaryPosition?: PositionCode;
  altPositions?: PositionCode[];
  preferredFoot?: "left" | "right" | "both";
  heightCm?: number;
}): Promise<ActionResult<void>> {
  const parsed = updatePlayerSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_player", {
    p_player_id: parsed.data.playerId,
    p_display_name: parsed.data.displayName,
    p_primary_position: parsed.data.primaryPosition,
    p_alt_positions: parsed.data.altPositions,
    p_preferred_foot: parsed.data.preferredFoot,
    p_height_cm: parsed.data.heightCm,
  });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}`);
  return ok(undefined);
}
