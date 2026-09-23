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
});
