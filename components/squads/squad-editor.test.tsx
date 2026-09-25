import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SquadEditor, type EditorPlayer } from "./squad-editor";
import { es } from "@/messages/es";
import { defaultGroupSettings } from "@/lib/settings/group";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockRefresh = vi.fn();
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}));

const mockSaveSquad = vi.fn();
const mockDeleteSquad = vi.fn();
const mockSetSquadPublished = vi.fn();
vi.mock("@/lib/actions/squads", () => ({
  saveSquad: (...args: unknown[]) => mockSaveSquad(...args),
  deleteSquad: (...args: unknown[]) => mockDeleteSquad(...args),
  setSquadPublished: (...args: unknown[]) => mockSetSquadPublished(...args),
}));

function player(id: string, name: string, ovr: number): EditorPlayer {
  return {
    playerId: id,
    name,
    avatarUrl: null,
    primaryPosition: "DC",
    altPositions: [],
    ovrByPosition: {},
    ovr,
    clubIds: [],
    tier: "silver",
    provisional: false,
  };
}

const ALTO = player("alto", "Alto", 80);
const BAJO = player("bajo", "Bajo", 60);

function renderEditor() {
  return render(
    <SquadEditor
      groupId="g1"
      squadId={null}
      initialName="Mi equipo"
      initialTeamSize={5}
      initialFormationCode="1-2-1"
      initialClubId={null}
      initialSlots={[]}
      initialPublished={false}
      players={[ALTO, BAJO]}
      shared={[]}
      settings={defaultGroupSettings.squads}
      clubs={[]}
    />,
  );
}

describe("SquadEditor", () => {
  it("updates rating and chemistry when a player is placed in a slot", async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(screen.queryAllByText("80")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: `${es.squads.emptySlot} DC` }));
    await user.click(screen.getByRole("button", { name: /Alto/ }));

    expect(screen.getAllByText("80").length).toBeGreaterThan(0);
  });

  it("excludes an already-placed player from another slot's candidates", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: `${es.squads.emptySlot} DC` }));
    await user.click(screen.getByRole("button", { name: /Alto/ }));

    await user.click(screen.getByRole("button", { name: `${es.squads.emptySlot} DFC` }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).queryByText("Alto")).not.toBeInTheDocument();
    expect(within(sheet).getByText("Bajo")).toBeInTheDocument();
  });

  it("saves a slot payload with no position field", async () => {
    mockSaveSquad.mockResolvedValue({ ok: true, data: { squadId: "s1" } });
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: `${es.squads.emptySlot} DC` }));
    await user.click(screen.getByRole("button", { name: /Alto/ }));
    await user.click(screen.getByRole("button", { name: es.common.save }));

    expect(mockSaveSquad).toHaveBeenCalledWith(
      expect.objectContaining({ slots: [{ slot: 4, playerId: "alto" }] }),
    );
    const payload = mockSaveSquad.mock.calls[0]![0] as { slots: object[] };
    expect(Object.keys(payload.slots[0]!)).toEqual(["slot", "playerId"]);
  });
});
