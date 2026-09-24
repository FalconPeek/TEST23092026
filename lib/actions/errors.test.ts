import { describe, expect, it } from "vitest";
import { mapDbError } from "./errors";
import { es } from "@/messages/es";

describe("mapDbError", () => {
  it("maps null/undefined to the generic error", () => {
    expect(mapDbError(null)).toBe(es.common.error);
    expect(mapDbError(undefined)).toBe(es.common.error);
  });

  it("maps an unknown message to the generic error", () => {
    expect(mapDbError({ message: "some unrelated postgres error" })).toBe(es.common.error);
  });

  it("maps PICADO_NOT_MEMBER to notMember", () => {
    expect(mapDbError({ message: "PICADO_NOT_MEMBER: you are not a member of this group" })).toBe(
      es.errors.notMember,
    );
  });

  it("maps a generic PICADO_INVITE_INVALID to inviteInvalid", () => {
    expect(mapDbError({ message: "PICADO_INVITE_INVALID: invite not found" })).toBe(
      es.errors.inviteInvalid,
    );
  });

  it("maps an expired invite to inviteExpired", () => {
    expect(mapDbError({ message: "PICADO_INVITE_INVALID: invite expired" })).toBe(
      es.errors.inviteExpired,
    );
  });

  it("maps a revoked invite to inviteRevoked", () => {
    expect(mapDbError({ message: "PICADO_INVITE_INVALID: invite revoked" })).toBe(
      es.errors.inviteRevoked,
    );
  });

  it("maps a used-up invite to inviteUsedUp", () => {
    expect(
      mapDbError({ message: "PICADO_INVITE_INVALID: invite has reached its usage limit" }),
    ).toBe(es.errors.inviteUsedUp);
  });

  it("maps a generic PICADO_FORBIDDEN to forbidden", () => {
    expect(mapDbError({ message: "PICADO_FORBIDDEN: only group admins can update the group" })).toBe(
      es.errors.forbidden,
    );
  });

  it("maps the owner-cannot-leave forbidden detail to ownerCannotLeave", () => {
    expect(
      mapDbError({ message: "PICADO_FORBIDDEN: transfer ownership before leaving the group" }),
    ).toBe(es.errors.ownerCannotLeave);
  });

  it("maps the owner-cannot-be-removed forbidden detail to ownerCannotBeRemoved", () => {
    expect(mapDbError({ message: "PICADO_FORBIDDEN: the owner cannot be removed" })).toBe(
      es.errors.ownerCannotBeRemoved,
    );
  });

  it("maps PICADO_VALIDATION to validation", () => {
    expect(
      mapDbError({ message: "PICADO_VALIDATION: group name must be between 1 and 60 characters" }),
    ).toBe(es.errors.validation);
  });

  it("maps PICADO_SELF_VOTE to selfVote", () => {
    expect(mapDbError({ message: "PICADO_SELF_VOTE: you cannot vote for yourself" })).toBe(
      es.errors.selfVote,
    );
  });

  it("maps PICADO_SPECTATOR to spectator", () => {
    expect(mapDbError({ message: "PICADO_SPECTATOR: spectators cannot cast scouting votes" })).toBe(
      es.errors.spectator,
    );
  });

  it("maps PICADO_NO_SHARED_MATCH to noSharedMatch", () => {
    expect(
      mapDbError({ message: "PICADO_NO_SHARED_MATCH: you need to share a match with this player first" }),
    ).toBe(es.errors.noSharedMatch);
  });

  it("maps PICADO_COOLDOWN to cooldown", () => {
    expect(mapDbError({ message: "PICADO_COOLDOWN: you must wait before revoting this player" })).toBe(
      es.errors.cooldown,
    );
  });

  it("maps PICADO_TARGET_LEFT to targetLeft", () => {
    expect(mapDbError({ message: "PICADO_TARGET_LEFT: target player has left the group" })).toBe(
      es.errors.targetLeft,
    );
  });

  it("maps PICADO_NOT_PARTICIPANT to notParticipant", () => {
    expect(
      mapDbError({ message: "PICADO_NOT_PARTICIPANT: you are not a participant of this match" }),
    ).toBe(es.errors.notParticipant);
  });

  it("maps PICADO_DEADLINE_PASSED to deadlinePassed", () => {
    expect(mapDbError({ message: "PICADO_DEADLINE_PASSED: the report window has closed" })).toBe(
      es.errors.deadlinePassed,
    );
  });

  it("maps PICADO_ALREADY_GENERATED to tournamentAlreadyGenerated", () => {
    expect(mapDbError({ message: "PICADO_ALREADY_GENERATED: this tournament already has a bracket" })).toBe(
      es.errors.tournamentAlreadyGenerated,
    );
  });

  it("maps PICADO_KO_DRAW to koDrawNeedsDecision", () => {
    expect(
      mapDbError({ message: "PICADO_KO_DRAW: a tied knockout match requires penalties or a manual/walkover decision" }),
    ).toBe(es.errors.koDrawNeedsDecision);
  });

  it("maps PICADO_NOT_EDITABLE to resultNotEditable", () => {
    expect(mapDbError({ message: "PICADO_NOT_EDITABLE: this match result can no longer be edited" })).toBe(
      es.errors.resultNotEditable,
    );
  });
});
