import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateMatchForm } from "./create-match-form";
import { es } from "@/messages/es";

afterEach(cleanup);

const mockPush = vi.fn();
const mockCreateMatch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/actions/matches", () => ({
  createMatch: (...args: unknown[]) => mockCreateMatch(...args),
}));

describe("CreateMatchForm", () => {
  it("blocks submit without a date/time, without calling the action", async () => {
    const user = userEvent.setup();
    render(<CreateMatchForm groupId="g1" defaultTeamSize={5} />);

    await user.click(screen.getByRole("button", { name: es.matches.new }));

    expect(mockCreateMatch).not.toHaveBeenCalled();
  });

  it("converts the datetime-local value to an Argentina-time ISO string and submits", async () => {
    mockCreateMatch.mockResolvedValue({ ok: true, data: { matchId: "m1" } });
    const user = userEvent.setup();
    render(<CreateMatchForm groupId="g1" defaultTeamSize={7} />);

    fireEvent.change(screen.getByLabelText(es.matches.when), { target: { value: "2026-10-01T20:00" } });
    await user.type(screen.getByLabelText(es.matches.venue), "Cancha 3");
    await user.click(screen.getByRole("button", { name: es.matches.new }));

    expect(mockCreateMatch).toHaveBeenCalledWith({
      groupId: "g1",
      scheduledAt: "2026-10-01T23:00:00.000Z",
      teamSize: 7,
      venue: "Cancha 3",
    });
    expect(mockPush).toHaveBeenCalledWith("/g/g1/partidos/m1/equipos");
  });

  it("shows the mapped error on failure without navigating", async () => {
    mockCreateMatch.mockResolvedValue({ ok: false, error: es.errors.forbidden });
    const user = userEvent.setup();
    render(<CreateMatchForm groupId="g1" defaultTeamSize={5} />);

    fireEvent.change(screen.getByLabelText(es.matches.when), { target: { value: "2026-10-01T20:00" } });
    await user.click(screen.getByRole("button", { name: es.matches.new }));

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("defaults the team size select to the group's default_team_size", () => {
    render(<CreateMatchForm groupId="g1" defaultTeamSize={7} />);
    expect(screen.getByText(es.matches.teamSizeOption(7))).toBeInTheDocument();
  });
});
