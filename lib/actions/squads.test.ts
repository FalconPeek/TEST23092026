import { beforeEach, describe, expect, it, vi } from "vitest";
import { es } from "@/messages/es";

const mockRpc = vi.fn();
const mockGetUserId = vi.fn();
const mockRevalidatePath = vi.fn();
let mockSquadRows: unknown[] = [];

// .from("squads").select().eq(match).eq(kind) → the rows in mockSquadRows.
const mockFrom = () => ({
  select: () => ({ eq: () => ({ eq: async () => ({ data: mockSquadRows, error: null }) }) }),
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: mockRpc, from: mockFrom })),
  getUserId: () => mockGetUserId(),
}));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => mockRevalidatePath(path) }));

const { saveSquad, applyLineupSquads, likeSquad } = await import("./squads");
const { createClub, setClubPlayers, updateClub } = await import("./clubs");

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const MATCH_ID = "22222222-2222-4222-8222-222222222222";
const P1 = "33333333-3333-4333-8333-333333333333";
const P2 = "44444444-4444-4444-8444-444444444444";
const SQUAD_ID = "55555555-5555-4555-8555-555555555555";
const CLUB_ID = "66666666-6666-4666-8666-666666666666";

const base = {
  squadId: null,
  groupId: GROUP_ID,
  kind: "dream" as const,
  name: "Mi equipo",
  teamSize: 5 as const,
  formation: "2-2",
  clubId: null,
  matchId: null,
  side: null,
};

beforeEach(() => {
  mockRpc.mockReset();
  mockGetUserId.mockReset().mockResolvedValue("77777777-7777-4777-8777-777777777777");
  mockRevalidatePath.mockReset();
  mockSquadRows = [];
});

describe("saveSquad", () => {
  it("derives slot positions from the formation catalog", async () => {
    mockRpc.mockResolvedValue({ data: SQUAD_ID, error: null });
    const result = await saveSquad({ ...base, slots: [{ slot: 0, playerId: P1 }, { slot: 3, playerId: P2 }] });
    expect(result).toEqual({ ok: true, data: { squadId: SQUAD_ID } });
    expect(mockRpc).toHaveBeenCalledWith(
      "save_squad",
      expect.objectContaining({
        p_formation: "2-2",
        p_slots: [
          { slot: 0, position: "POR", player_id: P1 },
          { slot: 3, position: "DC", player_id: P2 },
        ],
      }),
    );
  });

  it("rejects an unknown formation, a slot outside it, and repeated players without calling rpc", async () => {
    expect(await saveSquad({ ...base, formation: "4-3-3", slots: [] })).toEqual({ ok: false, error: es.errors.validation });
    expect(await saveSquad({ ...base, slots: [{ slot: 7, playerId: P1 }] })).toEqual({ ok: false, error: es.errors.validation });
    expect(
      await saveSquad({ ...base, slots: [{ slot: 0, playerId: P1 }, { slot: 1, playerId: P1 }] }),
    ).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("requires match and side exactly for lineup squads", async () => {
    expect(await saveSquad({ ...base, kind: "lineup", slots: [] })).toEqual({ ok: false, error: es.errors.validation });
    expect(await saveSquad({ ...base, matchId: MATCH_ID, side: 1, slots: [] })).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns unauthenticated without calling rpc", async () => {
    mockGetUserId.mockResolvedValue(null);
    expect(await saveSquad({ ...base, slots: [] })).toEqual({ ok: false, error: es.errors.unauthenticated });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("likeSquad", () => {
  it("maps the self-like error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "PICADO_SELF_VOTE: you cannot like your own squad" } });
    expect(await likeSquad({ groupId: GROUP_ID, squadId: SQUAD_ID, like: true })).toEqual({ ok: false, error: es.errors.selfVote });
  });
});

describe("applyLineupSquads", () => {
  it("builds set_match_lineup from both sides, preferring the club's name and color", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockSquadRows = [
      { id: "a", side: 1, name: "Titulares", club_id: CLUB_ID, clubs: { name: "Los Pibes", primary_color: "#ff0000" }, squad_slots: [{ slot: 1, position: "DFC", player_id: P2 }, { slot: 0, position: "POR", player_id: P1 }] },
      { id: "b", side: 2, name: "Suplentes", club_id: null, clubs: null, squad_slots: [] },
    ];
    expect(await applyLineupSquads({ groupId: GROUP_ID, matchId: MATCH_ID })).toEqual({ ok: true, data: undefined });
    expect(mockRpc).toHaveBeenCalledWith("set_match_lineup", {
      p_match_id: MATCH_ID,
      p_team1: {
        name: "Los Pibes",
        color: "#ff0000",
        players: [
          { player_id: P1, position: "POR" },
          { player_id: P2, position: "DFC" },
        ],
      },
      p_team2: { name: "Suplentes", color: undefined, players: [] },
      p_spectators: [],
    });
  });

  it("fails when a side has no lineup squad", async () => {
    mockSquadRows = [{ id: "a", side: 1, name: "X", club_id: null, clubs: null, squad_slots: [] }];
    expect(await applyLineupSquads({ groupId: GROUP_ID, matchId: MATCH_ID })).toEqual({ ok: false, error: es.errors.validation });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("clubs", () => {
  it("upper-cases the short name and validates colors", async () => {
    mockRpc.mockResolvedValue({ data: CLUB_ID, error: null });
    await createClub({ groupId: GROUP_ID, name: "Los Pibes", shortName: "lpb", primaryColor: "#ff0000", secondaryColor: "#ffffff" });
    expect(mockRpc).toHaveBeenCalledWith("create_club", expect.objectContaining({ p_short_name: "LPB" }));
    expect(
      await createClub({ groupId: GROUP_ID, name: "X", shortName: "XX", primaryColor: "red", secondaryColor: "#ffffff" }),
    ).toEqual({ ok: false, error: es.errors.validation });
  });

  it("sends an explicit null to clear the crest and rejects foreign crest paths", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const input = { groupId: GROUP_ID, clubId: CLUB_ID, name: "Los Pibes", shortName: "LPB", primaryColor: "#ff0000", secondaryColor: "#ffffff" };
    await updateClub({ ...input, crestPath: null });
    expect(mockRpc).toHaveBeenCalledWith("update_club", expect.objectContaining({ p_crest_path: null }));
    expect(await updateClub({ ...input, crestPath: "../../evil.svg" })).toEqual({ ok: false, error: es.errors.validation });
  });

  it("rejects duplicate players or shirt numbers in a roster", async () => {
    const input = { groupId: GROUP_ID, clubId: CLUB_ID };
    expect(await setClubPlayers({ ...input, players: [{ playerId: P1, shirtNumber: 1 }, { playerId: P1, shirtNumber: 2 }] })).toEqual({
      ok: false,
      error: es.errors.validation,
    });
    expect(await setClubPlayers({ ...input, players: [{ playerId: P1, shirtNumber: 9 }, { playerId: P2, shirtNumber: 9 }] })).toEqual({
      ok: false,
      error: es.errors.validation,
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
