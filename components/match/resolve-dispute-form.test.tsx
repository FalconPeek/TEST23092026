import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResolveDisputeForm } from "./resolve-dispute-form";
import type { StatFormPlayer, StatPrefill } from "./stats-form";
import { es } from "@/messages/es";

afterEach(cleanup);

const mockResolveDispute = vi.fn();

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("@/lib/actions/matches", () => ({
  resolveDispute: (...args: unknown[]) => mockResolveDispute(...args),
}));

const PLAYERS: StatFormPlayer[] = [
  { id: "p1", displayName: "Juan", avatarUrl: null, side: 1, position: "DC" },
  { id: "p2", displayName: "Pedro", avatarUrl: null, side: 2, position: "DC" },
];

function rowFor(name: string): HTMLElement {
  return screen.getByText(name).closest("div")!.parentElement!;
}

describe("ResolveDisputeForm", () => {
  it("sends only the edited player rows as stat overrides", async () => {
    mockResolveDispute.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    const prefill: Record<string, StatPrefill> = {};
    render(
      <ResolveDisputeForm
        groupId="g1"
        matchId="m1"
        team1Name="Blancos"
        team2Name="Negros"
        players={PLAYERS}
        prefill={prefill}
        initialTeam1Goals={1}
        initialTeam2Goals={0}
      />,
    );

    const juanGoalsPlus = within(rowFor("Juan")).getByRole("button", { name: es.match.increase(es.match.goals) });
    await user.click(juanGoalsPlus);

    await user.click(screen.getByRole("button", { name: es.match.resolve }));
    await user.click(screen.getByRole("button", { name: es.common.confirm }));

    expect(mockResolveDispute).toHaveBeenCalledWith({
      groupId: "g1",
      matchId: "m1",
      team1Goals: 1,
      team2Goals: 0,
      stats: [{ subjectPlayerId: "p1", goals: 1, assists: 0, ownGoals: 0, saves: 0 }],
    });
  });

  it("sends no stats overrides when no player row was touched", async () => {
    mockResolveDispute.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    render(
      <ResolveDisputeForm
        groupId="g1"
        matchId="m1"
        team1Name="Blancos"
        team2Name="Negros"
        players={PLAYERS}
        prefill={{}}
        initialTeam1Goals={2}
        initialTeam2Goals={1}
      />,
    );

    await user.click(screen.getByRole("button", { name: es.match.resolve }));
    await user.click(screen.getByRole("button", { name: es.common.confirm }));

    expect(mockResolveDispute).toHaveBeenCalledWith({
      groupId: "g1",
      matchId: "m1",
      team1Goals: 2,
      team2Goals: 1,
      stats: undefined,
    });
  });
});
