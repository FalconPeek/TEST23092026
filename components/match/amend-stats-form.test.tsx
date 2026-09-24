import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AmendStatsForm, type AmendFormPlayer } from "./amend-stats-form";
import { es } from "@/messages/es";
import type { StatValues } from "@/components/match/stat-row";

afterEach(cleanup);

const mockRefresh = vi.fn();
const mockAmendMatchStats = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/actions/matches", () => ({
  amendMatchStats: (...args: unknown[]) => mockAmendMatchStats(...args),
}));

const PLAYERS: AmendFormPlayer[] = [
  { id: "p1", displayName: "Juan", avatarUrl: null, side: 1 },
  { id: "p2", displayName: "Pedro", avatarUrl: null, side: 2 },
];

function rowFor(name: string): HTMLElement {
  return screen.getByText(name).closest("div")!.parentElement!;
}

function empty(): StatValues {
  return { goals: 0, assists: 0, ownGoals: 0, saves: 0 };
}

describe("AmendStatsForm", () => {
  it("sends only the changed field for the edited player", async () => {
    mockAmendMatchStats.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    render(
      <AmendStatsForm
        groupId="g1"
        matchId="m1"
        team1Name="Blancos"
        team2Name="Negros"
        players={PLAYERS}
        initialStats={{ p1: empty(), p2: empty() }}
        score={{ team1Goals: 1, team2Goals: 0 }}
      />,
    );
    await user.click(screen.getByText(es.match.amendTitle));

    const juanGoalsPlus = within(rowFor("Juan")).getByRole("button", { name: es.match.increase(es.match.goals) });
    await user.click(juanGoalsPlus);
    await user.click(screen.getByRole("button", { name: es.match.amendSave }));

    expect(mockAmendMatchStats).toHaveBeenCalledWith({
      groupId: "g1",
      matchId: "m1",
      stats: [{ subjectPlayerId: "p1", goals: 1 }],
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("blocks submit and shows the over-score error once a side exceeds its official goals", async () => {
    const user = userEvent.setup();
    render(
      <AmendStatsForm
        groupId="g1"
        matchId="m1"
        team1Name="Blancos"
        team2Name="Negros"
        players={PLAYERS}
        initialStats={{ p1: empty(), p2: empty() }}
        score={{ team1Goals: 1, team2Goals: 0 }}
      />,
    );
    await user.click(screen.getByText(es.match.amendTitle));

    const juanGoalsPlus = within(rowFor("Juan")).getByRole("button", { name: es.match.increase(es.match.goals) });
    await user.click(juanGoalsPlus);
    await user.click(juanGoalsPlus);

    expect(screen.getByText(es.match.amendOverScore("Blancos"))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: es.match.amendSave }));
    expect(mockAmendMatchStats).not.toHaveBeenCalled();
  });

  it("shows a live unattributed-goals counter per side", () => {
    render(
      <AmendStatsForm
        groupId="g1"
        matchId="m1"
        team1Name="Blancos"
        team2Name="Negros"
        players={PLAYERS}
        initialStats={{ p1: { ...empty(), goals: 1 }, p2: empty() }}
        score={{ team1Goals: 3, team2Goals: 0 }}
      />,
    );

    expect(screen.getByText(es.match.unattributed(2))).toBeInTheDocument();
  });

  it("disables save until a field actually changes", () => {
    render(
      <AmendStatsForm
        groupId="g1"
        matchId="m1"
        team1Name="Blancos"
        team2Name="Negros"
        players={PLAYERS}
        initialStats={{ p1: empty(), p2: empty() }}
        score={{ team1Goals: 0, team2Goals: 0 }}
      />,
    );

    expect(screen.getByRole("button", { name: es.match.amendSave })).toBeDisabled();
  });
});
