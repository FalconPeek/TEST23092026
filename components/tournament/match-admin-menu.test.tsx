import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MatchAdminMenu } from "./match-admin-menu";
import { es } from "@/messages/es";
import type { BracketSlotDisplay } from "@/lib/tournament/bracket-layout";

afterEach(cleanup);

// jsdom doesn't implement these; Radix Select's pointer-based interactions need them.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

const mockRefresh = vi.fn();
const mockPush = vi.fn();
const mockConfirmTournamentResult = vi.fn();
const mockEditTournamentResult = vi.fn();
const mockStartTournamentMatch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/actions/tournaments", () => ({
  confirmTournamentResult: (...args: unknown[]) => mockConfirmTournamentResult(...args),
  editTournamentResult: (...args: unknown[]) => mockEditTournamentResult(...args),
  startTournamentMatch: (...args: unknown[]) => mockStartTournamentMatch(...args),
}));

const SLOT1: BracketSlotDisplay = { kind: "entry", entryId: "e1", label: "Los Pibes", isWinner: false };
const SLOT2: BracketSlotDisplay = { kind: "entry", entryId: "e2", label: "Otro Equipo", isWinner: false };

async function openMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: es.common.edit }));
  return user;
}

describe("MatchAdminMenu visibility by status", () => {
  it("renders nothing for a locked match with no real match linked", () => {
    const { container } = render(
      <MatchAdminMenu
        groupId="g1"
        tournamentId="t1"
        tournamentMatchId="tm1"
        status="locked"
        matchId={null}
        slot1={SLOT1}
        slot2={SLOT2}
        initialScore1={null}
        initialScore2={null}
        initialPens1={null}
        initialPens2={null}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers only 'Corregir resultado' once the match is completed", async () => {
    render(
      <MatchAdminMenu
        groupId="g1"
        tournamentId="t1"
        tournamentMatchId="tm1"
        status="completed"
        matchId="m1"
        slot1={SLOT1}
        slot2={SLOT2}
        initialScore1={2}
        initialScore2={1}
        initialPens1={null}
        initialPens2={null}
      />,
    );
    await openMenu();

    expect(screen.getByRole("menuitem", { name: es.bracket.editResult })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: es.bracket.enterResult })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: es.bracket.play })).not.toBeInTheDocument();
  });
});

describe("MatchAdminMenu result dialog", () => {
  function renderReady() {
    return render(
      <MatchAdminMenu
        groupId="g1"
        tournamentId="t1"
        tournamentMatchId="tm1"
        status="ready"
        matchId={null}
        slot1={SLOT1}
        slot2={SLOT2}
        initialScore1={null}
        initialScore2={null}
        initialPens1={null}
        initialPens2={null}
      />,
    );
  }

  it("shows penalty fields only once the score is tied", async () => {
    renderReady();
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: es.bracket.enterResult }));

    // Both scores start at 0 (tied), so pens is already offered; make it 1-0 first to check it
    // disappears, then re-tie it at 1-1 to check it reappears.
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    await user.click(plusButtons[0]!); // slot1 -> 1
    expect(screen.queryByText(es.bracket.pens)).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "+" })[1]!); // slot2 -> 1
    expect(screen.getByText(es.bracket.pens)).toBeInTheDocument();
  });

  it("requires a winner before submitting a walkover", async () => {
    renderReady();
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: es.bracket.enterResult }));

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("switch", { name: es.bracket.walkover }));
    await user.click(within(dialog).getByRole("button", { name: es.common.confirm }));

    expect(mockConfirmTournamentResult).not.toHaveBeenCalled();
  });

  it("submits a walkover with the selected winner", async () => {
    mockConfirmTournamentResult.mockResolvedValue({ ok: true, data: undefined });
    renderReady();
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: es.bracket.enterResult }));

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("switch", { name: es.bracket.walkover }));
    await user.click(within(dialog).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Los Pibes" }));
    await user.click(within(dialog).getByRole("button", { name: es.common.confirm }));

    expect(mockConfirmTournamentResult).toHaveBeenCalledWith(
      expect.objectContaining({
        tournamentMatchId: "tm1",
        score1: 0,
        score2: 0,
        decidedBy: "walkover",
        winnerEntryId: "e1",
      }),
    );
  });
});
