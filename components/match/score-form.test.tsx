import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScoreForm } from "./score-form";
import { es } from "@/messages/es";

afterEach(cleanup);

const mockSubmitScoreReport = vi.fn();

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/actions/matches", () => ({
  submitScoreReport: (...args: unknown[]) => mockSubmitScoreReport(...args),
}));

describe("ScoreForm tap targets (T-022 self-check regression)", () => {
  it("renders every stepper +/- button at >=44px (size-11)", () => {
    render(
      <ScoreForm
        groupId="g1"
        matchId="m1"
        team1Name="Blancos"
        team2Name="Negros"
        initialTeam1Goals={null}
        initialTeam2Goals={null}
      />,
    );

    for (const button of screen.getAllByRole("button", { name: /^[−+]$/ })) {
      expect(button.className).toContain("size-11");
    }
  });

  it("renders the save-score submit button at >=44px (h-11)", () => {
    render(
      <ScoreForm
        groupId="g1"
        matchId="m1"
        team1Name="Blancos"
        team2Name="Negros"
        initialTeam1Goals={null}
        initialTeam2Goals={null}
      />,
    );

    expect(screen.getByRole("button", { name: es.match.saveScore }).className).toContain("h-11");
  });
});

describe("ScoreForm", () => {
  it("increments both steppers and submits the entered score", async () => {
    mockSubmitScoreReport.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    render(
      <ScoreForm
        groupId="g1"
        matchId="m1"
        team1Name="Blancos"
        team2Name="Negros"
        initialTeam1Goals={null}
        initialTeam2Goals={null}
      />,
    );

    const [team1Minus, team1Plus, , team2Plus] = screen.getAllByRole("button", { name: /^[−+]$/ });
    await user.click(team1Plus!);
    await user.click(team1Plus!);
    await user.click(team2Plus!);
    expect(team1Minus).toBeEnabled();

    await user.click(screen.getByRole("button", { name: es.match.saveScore }));

    expect(mockSubmitScoreReport).toHaveBeenCalledWith({
      groupId: "g1",
      matchId: "m1",
      team1Goals: 2,
      team2Goals: 1,
    });
  });

  it("prefills from an existing report", () => {
    render(
      <ScoreForm
        groupId="g1"
        matchId="m1"
        team1Name="Blancos"
        team2Name="Negros"
        initialTeam1Goals={3}
        initialTeam2Goals={1}
      />,
    );

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
