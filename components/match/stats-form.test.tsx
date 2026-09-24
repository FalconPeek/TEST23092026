import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatsForm, type StatFormPlayer } from "./stats-form";
import { es } from "@/messages/es";

afterEach(cleanup);

const mockSubmitStatReports = vi.fn();

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/actions/matches", () => ({
  submitStatReports: (...args: unknown[]) => mockSubmitStatReports(...args),
}));

const PLAYERS: StatFormPlayer[] = [
  { id: "p1", displayName: "Juan", avatarUrl: null, side: 1, position: "DC" },
  { id: "p2", displayName: "Pedro", avatarUrl: null, side: 2, position: "POR" },
];

function rowFor(name: string): HTMLElement {
  return screen.getByText(name).closest("div")!.parentElement!;
}

describe("StatsForm tap targets (T-021 regression)", () => {
  it("renders every stepper +/- button at >=44px (size-11)", () => {
    render(
      <StatsForm
        groupId="g1"
        matchId="m1"
        team1Name="Blancos"
        team2Name="Negros"
        players={PLAYERS}
        prefill={{}}
        myScoreReport={null}
      />,
    );

    const buttons = screen.getAllByRole("button", { name: /^(Restar a|Sumar a) /i });
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.className).toContain("size-11");
    }
  });

  it("shows the saves stepper for a POR player without touching the toggle", () => {
    render(
      <StatsForm
        groupId="g1"
        matchId="m1"
        team1Name="Blancos"
        team2Name="Negros"
        players={PLAYERS}
        prefill={{}}
        myScoreReport={null}
      />,
    );

    expect(within(rowFor("Pedro")).getByText(es.match.saves)).toBeInTheDocument();
    expect(within(rowFor("Juan")).queryByText(es.match.saves)).not.toBeInTheDocument();
  });

  it("renders the 'mostrar atajadas' toggle row at >=44px (min-h-11, T-022 regression)", () => {
    render(
      <StatsForm
        groupId="g1"
        matchId="m1"
        team1Name="Blancos"
        team2Name="Negros"
        players={PLAYERS}
        prefill={{}}
        myScoreReport={null}
      />,
    );

    const toggleLabel = screen.getByText(es.match.showSaves).closest("label")!;
    expect(toggleLabel.className).toContain("min-h-11");
  });

  it("renders the save-stats submit button at >=44px (h-11, T-022 regression)", () => {
    render(
      <StatsForm
        groupId="g1"
        matchId="m1"
        team1Name="Blancos"
        team2Name="Negros"
        players={PLAYERS}
        prefill={{}}
        myScoreReport={null}
      />,
    );

    expect(screen.getByRole("button", { name: es.match.saveStats }).className).toContain("h-11");
  });
});

describe("StatsForm", () => {
  it("increments a stat via its + button and submits only touched/nonzero rows", async () => {
    mockSubmitStatReports.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    render(
      <StatsForm
        groupId="g1"
        matchId="m1"
        team1Name="Blancos"
        team2Name="Negros"
        players={PLAYERS}
        prefill={{}}
        myScoreReport={null}
      />,
    );

    const juanGoalsPlus = within(rowFor("Juan")).getByRole("button", { name: es.match.increase(es.match.goals) });
    await user.click(juanGoalsPlus);
    await user.click(screen.getByRole("button", { name: es.match.saveStats }));

    expect(mockSubmitStatReports).toHaveBeenCalledWith({
      groupId: "g1",
      matchId: "m1",
      reports: [{ subjectPlayerId: "p1", goals: 1, assists: 0, ownGoals: 0, saves: 0 }],
    });
  });

  it("shows the goals-loaded check once I have a score report for that side", () => {
    render(
      <StatsForm
        groupId="g1"
        matchId="m1"
        team1Name="Blancos"
        team2Name="Negros"
        players={PLAYERS}
        prefill={{ p1: { goals: 2, assists: 0, ownGoals: 0, saves: 0 } }}
        myScoreReport={{ team1Goals: 3, team2Goals: 0 }}
      />,
    );

    expect(screen.getByText(es.match.goalsLoaded(2, 3))).toBeInTheDocument();
  });
});
