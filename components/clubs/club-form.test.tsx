import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ClubForm, type ClubFormData, type ClubFormPlayer } from "./club-form";
import { es } from "@/messages/es";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockRefresh = vi.fn();
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}));

const mockUpdateClub = vi.fn();
const mockDeleteClub = vi.fn();
const mockSetClubPlayers = vi.fn();
vi.mock("@/lib/actions/clubs", () => ({
  updateClub: (...args: unknown[]) => mockUpdateClub(...args),
  deleteClub: (...args: unknown[]) => mockDeleteClub(...args),
  setClubPlayers: (...args: unknown[]) => mockSetClubPlayers(...args),
}));

const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn();
const mockRemove = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => mockUpload(...args),
        getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
        remove: (...args: unknown[]) => mockRemove(...args),
      }),
    },
  }),
}));

const CLUB: ClubFormData = {
  id: "c1",
  name: "River",
  shortName: "RIV",
  primaryColor: "#112233",
  secondaryColor: "#ffffff",
  crestPath: null,
  crestUrl: null,
};

const PLAYERS: ClubFormPlayer[] = [
  { id: "p1", displayName: "Juan", avatarUrl: null },
  { id: "p2", displayName: "Pedro", avatarUrl: null },
];

function getFileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="file"]')!;
}

describe("ClubForm crest upload validation", () => {
  it("rejects a non-image file without uploading", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { container } = render(<ClubForm groupId="g1" club={CLUB} players={[]} initialRoster={{}} />);

    const file = new File(["<svg></svg>"], "crest.svg", { type: "image/svg+xml" });
    await user.upload(getFileInput(container), file);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(es.clubs.crestBadType);
  });

  it("rejects a file over 512 KB without uploading", async () => {
    const user = userEvent.setup();
    const { container } = render(<ClubForm groupId="g1" club={CLUB} players={[]} initialRoster={{}} />);

    const file = new File(["x"], "crest.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 600_000 });
    await user.upload(getFileInput(container), file);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(es.clubs.crestTooBig);
  });

  it("uploads a valid png and saves its path via updateClub", async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: "https://storage.example/club-crests/g1/c1.png" } });
    mockUpdateClub.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    const { container } = render(<ClubForm groupId="g1" club={CLUB} players={[]} initialRoster={{}} />);

    const file = new File(["ok"], "crest.png", { type: "image/png" });
    await user.upload(getFileInput(container), file);

    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith("g1/c1.png", file, expect.objectContaining({ upsert: true })));
    await waitFor(() =>
      expect(mockUpdateClub).toHaveBeenCalledWith(expect.objectContaining({ clubId: "c1", crestPath: "g1/c1.png" })),
    );
  });

  it("removes the old crest object when the new one has a different extension", async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: "https://storage.example/club-crests/g1/c1.png" } });
    mockUpdateClub.mockResolvedValue({ ok: true, data: undefined });
    mockRemove.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    const withJpgCrest: ClubFormData = { ...CLUB, crestPath: "g1/c1.jpg", crestUrl: "https://storage.example/club-crests/g1/c1.jpg" };
    const { container } = render(<ClubForm groupId="g1" club={withJpgCrest} players={[]} initialRoster={{}} />);

    const file = new File(["ok"], "crest.png", { type: "image/png" });
    await user.upload(getFileInput(container), file);

    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith(["g1/c1.jpg"]));
  });

  it("does not remove anything when the crest keeps the same extension", async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: "https://storage.example/club-crests/g1/c1.png" } });
    mockUpdateClub.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    const withPngCrest: ClubFormData = { ...CLUB, crestPath: "g1/c1.png", crestUrl: "https://storage.example/club-crests/g1/c1.png" };
    const { container } = render(<ClubForm groupId="g1" club={withPngCrest} players={[]} initialRoster={{}} />);

    const file = new File(["ok"], "crest.png", { type: "image/png" });
    await user.upload(getFileInput(container), file);

    await waitFor(() => expect(mockUpdateClub).toHaveBeenCalled());
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("removing the crest deletes its storage object", async () => {
    mockUpdateClub.mockResolvedValue({ ok: true, data: undefined });
    mockRemove.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    const withCrest: ClubFormData = { ...CLUB, crestPath: "g1/c1.png", crestUrl: "https://storage.example/club-crests/g1/c1.png" };
    render(<ClubForm groupId="g1" club={withCrest} players={[]} initialRoster={{}} />);

    await user.click(screen.getByRole("button", { name: es.clubs.removeCrest }));

    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith(["g1/c1.png"]));
    expect(mockUpdateClub).toHaveBeenCalledWith(expect.objectContaining({ clubId: "c1", crestPath: null }));
  });
});

describe("ClubForm details", () => {
  it("saves the edited name via updateClub", async () => {
    mockUpdateClub.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    render(<ClubForm groupId="g1" club={CLUB} players={[]} initialRoster={{}} />);

    const nameInput = screen.getByLabelText(es.clubs.name);
    await user.clear(nameInput);
    await user.type(nameInput, "Boca");
    const saveButtons = screen.getAllByRole("button", { name: es.common.save });
    await user.click(saveButtons[0]!);

    await waitFor(() =>
      expect(mockUpdateClub).toHaveBeenCalledWith(expect.objectContaining({ clubId: "c1", name: "Boca" })),
    );
  });
});

describe("ClubForm roster", () => {
  it("blocks saving when two selected players share a shirt number", async () => {
    const user = userEvent.setup();
    render(<ClubForm groupId="g1" club={CLUB} players={PLAYERS} initialRoster={{}} />);

    await user.click(screen.getByText("Juan").closest("div")!.querySelector('[role="checkbox"]')!);
    await user.click(screen.getByText("Pedro").closest("div")!.querySelector('[role="checkbox"]')!);

    const numberInputs = screen.getAllByLabelText(new RegExp(es.clubs.shirtNumber));
    await user.type(numberInputs[0]!, "9");
    await user.type(numberInputs[1]!, "9");

    expect(screen.getByText(es.clubs.shirtNumberDuplicate)).toBeInTheDocument();
    expect(mockSetClubPlayers).not.toHaveBeenCalled();
  });

  it("saves only the checked players with their shirt numbers", async () => {
    mockSetClubPlayers.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    render(<ClubForm groupId="g1" club={CLUB} players={PLAYERS} initialRoster={{}} />);

    await user.click(screen.getByText("Juan").closest("div")!.querySelector('[role="checkbox"]')!);
    const numberInput = screen.getByLabelText(new RegExp(`${es.clubs.shirtNumber}: Juan`));
    await user.type(numberInput, "9");

    const saveButtons = screen.getAllByRole("button", { name: es.common.save });
    await user.click(saveButtons[saveButtons.length - 1]!);

    expect(mockSetClubPlayers).toHaveBeenCalledWith({
      groupId: "g1",
      clubId: "c1",
      players: [{ playerId: "p1", shirtNumber: 9 }],
    });
  });
});
