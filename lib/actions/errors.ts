import { es } from "@/messages/es";

/** Maps a raw Postgres/RPC error (stable `PICADO_<CODE>: <detail>` prefix) to Spanish UI copy. */
export function mapDbError(error: { message?: string } | null | undefined): string {
  const message = error?.message ?? "";

  if (message.startsWith("PICADO_NOT_MEMBER:")) {
    return es.errors.notMember;
  }

  if (message.startsWith("PICADO_INVITE_INVALID:")) {
    if (message.includes("revoked")) return es.errors.inviteRevoked;
    if (message.includes("expired")) return es.errors.inviteExpired;
    if (message.includes("usage limit")) return es.errors.inviteUsedUp;
    return es.errors.inviteInvalid;
  }

  if (message.startsWith("PICADO_FORBIDDEN:")) {
    if (message.includes("transfer ownership before leaving")) return es.errors.ownerCannotLeave;
    if (message.includes("owner cannot be removed")) return es.errors.ownerCannotBeRemoved;
    return es.errors.forbidden;
  }

  if (message.startsWith("PICADO_VALIDATION:")) {
    return es.errors.validation;
  }

  if (message.startsWith("PICADO_SELF_VOTE:")) {
    return es.errors.selfVote;
  }

  if (message.startsWith("PICADO_SPECTATOR:")) {
    return es.errors.spectator;
  }

  if (message.startsWith("PICADO_NO_SHARED_MATCH:")) {
    return es.errors.noSharedMatch;
  }

  if (message.startsWith("PICADO_COOLDOWN:")) {
    return es.errors.cooldown;
  }

  if (message.startsWith("PICADO_TARGET_LEFT:")) {
    return es.errors.targetLeft;
  }

  if (message.startsWith("PICADO_NOT_PARTICIPANT:")) {
    return es.errors.notParticipant;
  }

  if (message.startsWith("PICADO_DEADLINE_PASSED:")) {
    return es.errors.deadlinePassed;
  }

  return es.common.error;
}
