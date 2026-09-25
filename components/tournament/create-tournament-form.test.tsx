import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateTournamentForm } from "./create-tournament-form";
import { es } from "@/messages/es";

afterEach(cleanup);

const mockPush = vi.fn();
const mockCreateTournament = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/actions/tournaments", () => ({
  createTournament: (...args: unknown[]) => mockCreateTournament(...args),
}));

describe("CreateTournamentForm format-specific fields", () => {
  it("shows the league option and hides other formats' options by default", () => {
    render(<CreateTournamentForm groupId="g1" defaultTeamSize={7} />);

    expect(screen.getByText(es.tournaments.settings.leagueDoubleRoundRobinLabel)).toBeInTheDocument();
    expect(screen.queryByText(es.tournaments.settings.singleElimThirdPlaceLabel)).not.toBeInTheDocument();
    expect(screen.queryByText(es.tournaments.settings.groupsKoGroupCountLabel)).not.toBeInTheDocument();
    expect(screen.queryByText(es.tournaments.settings.swissRoundsLabel)).not.toBeInTheDocument();
  });

  it("switches to the groups_ko fields and hides the league field when that format is picked", async () => {
    const user = userEvent.setup();
    render(<CreateTournamentForm groupId="g1" defaultTeamSize={7} />);

    await user.click(screen.getByRole("radio", { name: es.tournaments.formats.groups_ko }));

    expect(screen.getByLabelText(es.tournaments.settings.groupsKoGroupCountLabel)).toBeInTheDocument();
    expect(screen.queryByText(es.tournaments.settings.leagueDoubleRoundRobinLabel)).not.toBeInTheDocument();
  });

  it("shows the swiss rounds field (and no ko-draw-resolution) for the swiss format", async () => {
    const user = userEvent.setup();
    render(<CreateTournamentForm groupId="g1" defaultTeamSize={7} />);

    await user.click(screen.getByRole("radio", { name: es.tournaments.formats.swiss }));
    await user.click(screen.getByText(es.tournaments.settings.rulesTitle));

    expect(screen.getByLabelText(es.tournaments.settings.swissRoundsLabel)).toBeInTheDocument();
    expect(screen.queryByText(es.tournaments.settings.koDrawResolutionLabel)).not.toBeInTheDocument();
  });
});

describe("CreateTournamentForm format selection", () => {
  it("highlights the selected format card with a ring class matching the radio item's real checked attribute", async () => {
    const user = userEvent.setup();
    render(<CreateTournamentForm groupId="g1" defaultTeamSize={7} />);

    const leagueLabel = screen.getByRole("radio", { name: es.tournaments.formats.league }).closest("label")!;

    // Radix's radio item marks itself checked via `data-state`, not `data-checked` -- the card's
    // selected-ring selector must target the attribute the item actually sets.
    expect(leagueLabel.className).toContain("has-[[data-state=checked]]:ring-2");
    expect(leagueLabel.className).not.toContain("data-checked");

    await user.click(screen.getByRole("radio", { name: es.tournaments.formats.groups_ko }));

    expect(screen.getByRole("radio", { name: es.tournaments.formats.league })).toHaveAttribute("data-state", "unchecked");
    expect(screen.getByRole("radio", { name: es.tournaments.formats.groups_ko })).toHaveAttribute("data-state", "checked");
  });
});

describe("CreateTournamentForm tiebreaker reorder", () => {
  it("moves a tiebreaker down when its down button is clicked", async () => {
    const user = userEvent.setup();
    render(<CreateTournamentForm groupId="g1" defaultTeamSize={7} />);

    await user.click(screen.getByText(es.tournaments.settings.rulesTitle));

    const firstRow = screen.getByText(`1. ${es.tournaments.settings.tiebreakerNames.points}`).closest("li")!;
    await user.click(within(firstRow).getByRole("button", { name: es.tournaments.settings.moveDown }));

    expect(screen.getByText(`1. ${es.tournaments.settings.tiebreakerNames.goal_diff}`)).toBeInTheDocument();
    expect(screen.getByText(`2. ${es.tournaments.settings.tiebreakerNames.points}`)).toBeInTheDocument();
  });
});

describe("CreateTournamentForm submit", () => {
  it("blocks submit and shows an error for an out-of-range groups_ko setting", async () => {
    const user = userEvent.setup();
    render(<CreateTournamentForm groupId="g1" defaultTeamSize={7} />);

    await user.type(screen.getByLabelText(es.tournaments.name), "Copa Apertura");
    await user.click(screen.getByRole("radio", { name: es.tournaments.formats.groups_ko }));

    const groupCount = screen.getByLabelText(es.tournaments.settings.groupsKoGroupCountLabel);
    await user.clear(groupCount);
    await user.type(groupCount, "0");
    await user.click(screen.getByRole("button", { name: es.tournaments.new }));

    expect(mockCreateTournament).not.toHaveBeenCalled();
    expect(screen.getByText(es.errors.fieldRange(1, 16))).toBeInTheDocument();
  });

  it("submits the parsed settings for a valid league tournament", async () => {
    mockCreateTournament.mockResolvedValue({ ok: true, data: { tournamentId: "t1" } });
    const user = userEvent.setup();
    render(<CreateTournamentForm groupId="g1" defaultTeamSize={7} />);

    await user.type(screen.getByLabelText(es.tournaments.name), "Copa Apertura");
    await user.click(screen.getByRole("button", { name: es.tournaments.new }));

    expect(mockCreateTournament).toHaveBeenCalledWith({
      groupId: "g1",
      name: "Copa Apertura",
      format: "league",
      teamSize: 7,
      entryMode: "teams",
      settings: expect.objectContaining({
        seeding: "ovr",
        tiebreakers: ["points", "goal_diff", "goals_for", "head_to_head", "lots"],
      }),
    });
    expect(mockPush).toHaveBeenCalledWith("/g/g1/torneos/t1");
  });
});
