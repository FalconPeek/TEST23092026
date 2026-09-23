export type GroupRole = "owner" | "admin" | "member" | "spectator";

export type MemberAction = "makeAdmin" | "removeAdmin" | "toMember" | "toSpectator" | "remove";

/**
 * Mirrors the permission checks in `set_member_role` / `remove_member` (see
 * supabase/migrations/20260923055124_group_rpcs.sql) so the UI never offers an action the
 * RPC would reject. Admin<->member and member<->spectator are treated as two independent
 * toggles: demoting an admin always lands on `member` first ("Quitar admin"), never
 * directly on `spectator`, even though the owner's RPC call would technically allow it.
 */
export function memberActionsFor(
  myRole: GroupRole,
  targetRole: GroupRole,
  isSelf: boolean,
): MemberAction[] {
  if (isSelf || targetRole === "owner") return [];
  if (myRole !== "owner" && myRole !== "admin") return [];

  const actions: MemberAction[] = [];

  if (myRole === "owner") {
    if (targetRole === "admin") actions.push("removeAdmin");
    if (targetRole === "member") actions.push("makeAdmin");
  }
  if (targetRole === "member") actions.push("toSpectator");
  if (targetRole === "spectator") actions.push("toMember");
  if (myRole === "owner" || targetRole !== "admin") actions.push("remove");

  return actions;
}

/** Only the owner can create invites that grant the admin role (`create_invite`). */
export function canInviteAdmin(myRole: GroupRole): boolean {
  return myRole === "owner";
}

/** Only non-spectator members can claim a guest (`claim_guest_player`). */
export function canClaimGuest(myRole: GroupRole): boolean {
  return myRole === "owner" || myRole === "admin" || myRole === "member";
}

/** Guests/invites management is admin-only (`add_guest_player`, `create_invite`, …). */
export function isGroupAdmin(myRole: GroupRole): boolean {
  return myRole === "owner" || myRole === "admin";
}
