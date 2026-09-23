import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JoinButton } from "./join-button";
import { es } from "@/messages/es";
import type { ActionResult } from "@/lib/actions/result";

afterEach(cleanup);

const mockReplace = vi.fn();
const mockAcceptInvite = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock("@/lib/actions/groups", () => ({
  acceptInvite: (...args: unknown[]) => mockAcceptInvite(...args),
}));

describe("JoinButton", () => {
  it("navigates to the group on success", async () => {
    mockAcceptInvite.mockResolvedValue({
      ok: true,
      data: { groupId: "group-1" },
    } satisfies ActionResult<{ groupId: string }>);
    const user = userEvent.setup();
    render(<JoinButton code="abc123" />);

    await user.click(screen.getByRole("button", { name: es.invite.join }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/g/group-1"));
    expect(mockAcceptInvite).toHaveBeenCalledWith({ code: "abc123" });
    expect(mockToastSuccess).toHaveBeenCalledWith(es.groups.joined);
  });

  it("toasts the mapped error on failure", async () => {
    mockAcceptInvite.mockResolvedValue({
      ok: false,
      error: es.errors.inviteExpired,
    } satisfies ActionResult<{ groupId: string }>);
    const user = userEvent.setup();
    render(<JoinButton code="abc123" />);

    await user.click(screen.getByRole("button", { name: es.invite.join }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(es.errors.inviteExpired));
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
