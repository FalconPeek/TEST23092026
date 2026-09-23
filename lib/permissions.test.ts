import { describe, expect, it } from "vitest";
import { canClaimGuest, canInviteAdmin, isGroupAdmin, memberActionsFor } from "./permissions";

describe("memberActionsFor", () => {
  it("owner acting on an admin can demote or remove, never re-promote or set spectator", () => {
    expect(memberActionsFor("owner", "admin", false)).toEqual(["removeAdmin", "remove"]);
  });

  it("admin acting on another admin can do nothing", () => {
    expect(memberActionsFor("admin", "admin", false)).toEqual([]);
  });

  it("owner acting on a member can promote, demote to spectator, or remove", () => {
    expect(memberActionsFor("owner", "member", false)).toEqual(["makeAdmin", "toSpectator", "remove"]);
  });

  it("admin acting on a member can demote to spectator or remove, but not promote to admin", () => {
    expect(memberActionsFor("admin", "member", false)).toEqual(["toSpectator", "remove"]);
  });

  it("owner acting on a spectator can promote to member or remove, but not jump straight to admin", () => {
    expect(memberActionsFor("owner", "spectator", false)).toEqual(["toMember", "remove"]);
  });

  it("admin acting on a spectator can promote to member or remove", () => {
    expect(memberActionsFor("admin", "spectator", false)).toEqual(["toMember", "remove"]);
  });

  it("a member or spectator caller has no actions on anyone", () => {
    expect(memberActionsFor("member", "spectator", false)).toEqual([]);
    expect(memberActionsFor("spectator", "member", false)).toEqual([]);
  });

  it("nobody has actions on the owner", () => {
    expect(memberActionsFor("owner", "owner", false)).toEqual([]);
    expect(memberActionsFor("admin", "owner", false)).toEqual([]);
  });

  it("nobody has actions on themselves (self-management lives in the danger zone)", () => {
    expect(memberActionsFor("owner", "admin", true)).toEqual([]);
    expect(memberActionsFor("admin", "admin", true)).toEqual([]);
    expect(memberActionsFor("admin", "member", true)).toEqual([]);
  });
});

describe("canInviteAdmin", () => {
  it("only the owner can invite admins", () => {
    expect(canInviteAdmin("owner")).toBe(true);
    expect(canInviteAdmin("admin")).toBe(false);
    expect(canInviteAdmin("member")).toBe(false);
    expect(canInviteAdmin("spectator")).toBe(false);
  });
});

describe("canClaimGuest", () => {
  it("owner, admin and member can claim; spectator cannot", () => {
    expect(canClaimGuest("owner")).toBe(true);
    expect(canClaimGuest("admin")).toBe(true);
    expect(canClaimGuest("member")).toBe(true);
    expect(canClaimGuest("spectator")).toBe(false);
  });
});

describe("isGroupAdmin", () => {
  it("owner and admin only", () => {
    expect(isGroupAdmin("owner")).toBe(true);
    expect(isGroupAdmin("admin")).toBe(true);
    expect(isGroupAdmin("member")).toBe(false);
    expect(isGroupAdmin("spectator")).toBe(false);
  });
});
