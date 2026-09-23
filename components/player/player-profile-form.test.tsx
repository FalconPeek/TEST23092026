import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayerProfileForm, type PlayerProfile } from "./player-profile-form";
import { es } from "@/messages/es";

afterEach(cleanup);

// jsdom doesn't implement these; Radix Select's pointer-based interactions need them.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

const mockUpdateMyPlayer = vi.fn();
const mockUpdatePlayer = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/actions/groups", () => ({
  updateMyPlayer: (...args: unknown[]) => mockUpdateMyPlayer(...args),
  updatePlayer: (...args: unknown[]) => mockUpdatePlayer(...args),
}));

const basePlayer: PlayerProfile = {
  id: "p1",
  displayName: "Juan",
  primaryPosition: null,
  altPositions: [],
  preferredFoot: null,
  heightCm: null,
};

describe("PlayerProfileForm", () => {
  it("caps alternate positions at 4 and excludes the primary position", async () => {
    const user = userEvent.setup();
    render(
      <PlayerProfileForm groupId="g1" editedByAdmin={false} player={{ ...basePlayer, primaryPosition: "DC" }} />,
    );

    // the primary position (DC) must not be offered as an alternate
    expect(screen.queryByRole("button", { name: es.positions.DC })).not.toBeInTheDocument();

    const chips = ["POR", "LI", "DFC", "LD", "CAI"] as const;
    for (const code of chips) {
      await user.click(screen.getByRole("button", { name: es.positions[code] }));
    }

    // only the first 4 clicks should have registered as pressed
    const pressed = chips.map((code) => screen.getByRole("button", { name: es.positions[code] }));
    expect(pressed.filter((btn) => btn.getAttribute("aria-pressed") === "true")).toHaveLength(4);
    expect(screen.getByRole("button", { name: es.positions.CAI })).toHaveAttribute("aria-pressed", "false");
  });

  it("removes an alternate from the selection when picked as the new primary position", async () => {
    const user = userEvent.setup();
    render(<PlayerProfileForm groupId="g1" editedByAdmin={false} player={{ ...basePlayer, altPositions: ["DC"] }} />);

    expect(screen.getByRole("button", { name: es.positions.DC })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: es.positions.DC }));

    // DC is now the primary position, so it should no longer render as an alt chip at all
    expect(screen.queryByRole("button", { name: es.positions.DC })).not.toBeInTheDocument();
  });

  it("calls updateMyPlayer for the caller's own profile", async () => {
    mockUpdateMyPlayer.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    render(<PlayerProfileForm groupId="g1" editedByAdmin={false} player={basePlayer} />);

    await user.click(screen.getByRole("button", { name: es.player.save }));

    expect(mockUpdateMyPlayer).toHaveBeenCalledWith(expect.objectContaining({ groupId: "g1", displayName: "Juan" }));
    expect(mockUpdatePlayer).not.toHaveBeenCalled();
  });

  it("calls updatePlayer with the playerId when an admin edits a guest", async () => {
    mockUpdatePlayer.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    render(<PlayerProfileForm groupId="g1" editedByAdmin={true} player={basePlayer} />);

    await user.click(screen.getByRole("button", { name: es.player.save }));

    expect(mockUpdatePlayer).toHaveBeenCalledWith(expect.objectContaining({ groupId: "g1", playerId: "p1" }));
    expect(mockUpdateMyPlayer).not.toHaveBeenCalled();
  });
});
