import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EntriesEditor, type EntryPlayer } from "./entries-editor";
import { es } from "@/messages/es";
import type { DraftEntry } from "@/lib/tournament/entries";

afterEach(cleanup);

const mockRefresh = vi.fn();
const mockSaveTournamentEntries = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/actions/tournaments", () => ({
  saveTournamentEntries: (...args: unknown[]) => mockSaveTournamentEntries(...args),
}));

const PLAYERS: EntryPlayer[] = [{ id: "p1", displayName: "Juan", avatarUrl: null, ovr: 70 }];

describe("EntriesEditor read-only mode", () => {
  it("lists entries and their players without editing controls", () => {
    const initialEntries: DraftEntry[] = [
      { id: "e1", name: "Equipo A", seed: 1, playerIds: ["p1"] },
      { id: "e2", name: "Equipo B", seed: 2, playerIds: [] },
    ];
    render(
      <EntriesEditor
        groupId="g1"
        tournamentId="t1"
        players={PLAYERS}
        initialEntries={initialEntries}
        editable={false}
      />,
    );

    expect(screen.getByText("Equipo A")).toBeInTheDocument();
    expect(screen.getByText("Juan")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: es.tournament.addEntry })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: es.tournament.saveEntries })).not.toBeInTheDocument();
  });
});

describe("EntriesEditor editable mode", () => {
  it("adds a new entry when 'Agregar equipo' is clicked", async () => {
    const user = userEvent.setup();
    render(<EntriesEditor groupId="g1" tournamentId="t1" players={[]} initialEntries={[]} editable />);

    await user.click(screen.getByRole("button", { name: es.tournament.addEntry }));

    expect(screen.getByDisplayValue(`${es.tournament.entries} 1`)).toBeInTheDocument();
  });

  it("blocks save with fewer than 2 entries and shows the error", async () => {
    const user = userEvent.setup();
    const initialEntries: DraftEntry[] = [{ id: "e1", name: "Equipo A", seed: null, playerIds: [] }];
    render(
      <EntriesEditor groupId="g1" tournamentId="t1" players={[]} initialEntries={initialEntries} editable />,
    );

    await user.click(screen.getByRole("button", { name: es.tournament.saveEntries }));

    expect(mockSaveTournamentEntries).not.toHaveBeenCalled();
    expect(screen.getByText(es.tournament.needTwoEntries)).toBeInTheDocument();
  });

  it("assigns an unassigned player to an entry and saves the resulting rosters", async () => {
    mockSaveTournamentEntries.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    const initialEntries: DraftEntry[] = [
      { id: "e1", name: "Equipo A", seed: null, playerIds: [] },
      { id: "e2", name: "Equipo B", seed: null, playerIds: [] },
    ];
    render(
      <EntriesEditor groupId="g1" tournamentId="t1" players={PLAYERS} initialEntries={initialEntries} editable />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Equipo A" }));
    await user.click(screen.getByRole("button", { name: es.tournament.saveEntries }));

    expect(mockSaveTournamentEntries).toHaveBeenCalledWith({
      groupId: "g1",
      tournamentId: "t1",
      entries: [
        { name: "Equipo A", seed: null, playerIds: ["p1"] },
        { name: "Equipo B", seed: null, playerIds: [] },
      ],
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("unassigns a player back to the unassigned list when its remove button is clicked", async () => {
    const user = userEvent.setup();
    const initialEntries: DraftEntry[] = [
      { id: "e1", name: "Equipo A", seed: null, playerIds: ["p1"] },
      { id: "e2", name: "Equipo B", seed: null, playerIds: [] },
    ];
    render(
      <EntriesEditor groupId="g1" tournamentId="t1" players={PLAYERS} initialEntries={initialEntries} editable />,
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: es.tournament.removePlayer }));

    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});
