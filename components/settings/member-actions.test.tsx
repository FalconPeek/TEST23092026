import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemberActions } from "./member-actions";
import { es } from "@/messages/es";

afterEach(cleanup);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/actions/groups", () => ({
  setMemberRole: vi.fn(),
  removeMember: vi.fn(),
}));

async function openMenu() {
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: es.common.edit });
  await user.click(trigger);
  return user;
}

describe("MemberActions", () => {
  it("renders nothing when the owner views their own row (no self-actions)", () => {
    const { container } = render(
      <MemberActions groupId="g1" targetUserId="u1" targetRole="owner" myRole="owner" isSelf={true} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers Quitar admin and Quitar del grupo when the owner views an admin", async () => {
    render(<MemberActions groupId="g1" targetUserId="u1" targetRole="admin" myRole="owner" isSelf={false} />);
    await openMenu();

    expect(screen.getByRole("menuitem", { name: es.settings.members.actions.removeAdmin })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: es.settings.members.actions.remove })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: es.settings.members.actions.makeAdmin }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: es.settings.members.actions.toSpectator }),
    ).not.toBeInTheDocument();
  });

  it("offers nothing when an admin views another admin", () => {
    const { container } = render(
      <MemberActions groupId="g1" targetUserId="u1" targetRole="admin" myRole="admin" isSelf={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers Pasar a espectador and Quitar del grupo when an admin views a member", async () => {
    render(<MemberActions groupId="g1" targetUserId="u1" targetRole="member" myRole="admin" isSelf={false} />);
    await openMenu();

    expect(screen.getByRole("menuitem", { name: es.settings.members.actions.toSpectator })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: es.settings.members.actions.remove })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: es.settings.members.actions.makeAdmin }),
    ).not.toBeInTheDocument();
  });

  it("offers nothing when a plain member views anyone", () => {
    const { container } = render(
      <MemberActions groupId="g1" targetUserId="u1" targetRole="member" myRole="member" isSelf={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers nothing when the target is the owner", () => {
    const { container } = render(
      <MemberActions groupId="g1" targetUserId="u1" targetRole="owner" myRole="admin" isSelf={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("opens a confirm dialog before running a destructive action", async () => {
    render(<MemberActions groupId="g1" targetUserId="u1" targetRole="member" myRole="owner" isSelf={false} />);
    const user = await openMenu();

    await user.click(screen.getByRole("menuitem", { name: es.settings.members.actions.remove }));

    expect(screen.getByText(es.settings.members.confirmRemoveTitle)).toBeInTheDocument();
    expect(screen.getByText(es.settings.members.confirmRemoveBody)).toBeInTheDocument();
  });
});
