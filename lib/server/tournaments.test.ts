import { describe, expect, it } from "vitest";
import { BYE, seededRng, type Match, type TournamentState } from "@/lib/brackets";
import { setSlot, toMatchMap } from "@/lib/brackets/propagation";
import { tournamentSettingsSchema, type TournamentFormat, type TournamentSettings } from "@/lib/settings/tournament";
import {
  afterTournamentMatchCompleted,
  buildIndividualEntries,
  computeStandings,
  generateBracket,
  TournamentAlreadyGeneratedError,
  TournamentNotFoundError,
} from "./tournaments";
import type { BalanceInput, EntryRow, GroupQualifiers, NewEntry, TournamentRepo, TournamentRow } from "./tournament-repo";

const RNG = seededRng(42);

/** In-memory TournamentRepo double, mirroring FakeFinalizeRepo (lib/server/finalize.test.ts).
 * loadState/persistBracket/appendSwissRound/seedKnockoutFromGroups operate on the *engine's own*
 * ids directly (no uuid<->engine_key translation layer -- that's createSupabaseTournamentRepo's
 * job, exercised separately by tournaments.dbint.test.ts), so a round trip through this fake is
 * effectively identity, which is exactly what makes it useful for testing the orchestration in
 * tournaments.ts in isolation. seedKnockoutFromGroups replays the RPC's own semantics (resolve
 * every placeholder matching {fromGroup, rank} via setSlot, cascading BYEs) using the engine's own
 * propagation helpers, so it's a faithful (not just a recording) fake. */
class FakeTournamentRepo implements TournamentRepo {
  tournaments = new Map<string, TournamentRow>();
  entries = new Map<string, EntryRow[]>();
  registrations = new Map<string, string[]>();
  ovrByPlayer = new Map<string, number>();
  balanceInputs = new Map<string, BalanceInput>();
  states = new Map<string, TournamentState>();

  saveEntriesCalls: { tournamentId: string; entries: NewEntry[] }[] = [];
  persistBracketCalls: { tournamentId: string; state: TournamentState }[] = [];
  seedKnockoutCalls: { tournamentId: string; qualifiers: GroupQualifiers[] }[] = [];
  appendSwissCalls: { tournamentId: string; stageEngineKey: string; matches: Match[] }[] = [];

  async loadTournament(tournamentId: string) {
    return this.tournaments.get(tournamentId) ?? null;
  }

  async loadEntries(tournamentId: string) {
    return this.entries.get(tournamentId) ?? [];
  }

  async loadRegistrations(tournamentId: string) {
    return this.registrations.get(tournamentId) ?? [];
  }

  async loadPlayerOvrs(playerIds: string[]) {
    const result = new Map<string, number>();
    for (const id of playerIds) {
      const v = this.ovrByPlayer.get(id);
      if (v !== undefined) result.set(id, v);
    }
    return result;
  }

  async loadBalanceInputs(playerIds: string[]) {
    const result = new Map<string, BalanceInput>();
    for (const id of playerIds) {
      const v = this.balanceInputs.get(id);
      if (v) result.set(id, v);
    }
    return result;
  }

  async hasBracket(tournamentId: string) {
    return this.states.has(tournamentId);
  }

  async loadState(tournamentId: string) {
    const state = this.states.get(tournamentId);
    return state ? structuredClone(state) : null;
  }

  async saveEntries(tournamentId: string, entries: NewEntry[]) {
    this.saveEntriesCalls.push({ tournamentId, entries });
    this.entries.set(
      tournamentId,
      entries.map((e, i) => ({ id: `entry-${tournamentId}-${i + 1}`, name: e.name, seed: e.seed, playerIds: e.playerIds })),
    );
  }

  async persistBracket(tournamentId: string, state: TournamentState) {
    this.persistBracketCalls.push({ tournamentId, state });
    this.states.set(tournamentId, structuredClone(state));
  }

  async appendSwissRound(tournamentId: string, stageEngineKey: string, matches: Match[]) {
    this.appendSwissCalls.push({ tournamentId, stageEngineKey, matches });
    const state = this.states.get(tournamentId);
    if (!state) throw new Error("appendSwissRound: no state");
    state.matches = [...state.matches, ...structuredClone(matches)];
    state.swissRoundsGenerated = Math.max(state.swissRoundsGenerated ?? 0, ...matches.map((m) => m.round));
  }

  async seedKnockoutFromGroups(tournamentId: string, qualifiers: GroupQualifiers[]) {
    this.seedKnockoutCalls.push({ tournamentId, qualifiers });
    const state = this.states.get(tournamentId);
    if (!state) throw new Error("seedKnockoutFromGroups: no state");
    const map = toMatchMap(state.matches);
    for (const { group, entries } of qualifiers) {
      entries.forEach((entryId, idx) => {
        const rank = idx + 1;
        const value = entryId ?? BYE;
        for (const m of state.matches) {
          if (m.entry1From?.fromGroup === group && m.entry1From.rank === rank && m.entry1Id === null) {
            setSlot(map, m.id, 1, value);
          }
          if (m.entry2From?.fromGroup === group && m.entry2From.rank === rank && m.entry2Id === null) {
            setSlot(map, m.id, 2, value);
          }
        }
      });
    }
    state.matches = [...map.values()];
  }
}

function settingsFor(overrides: Partial<TournamentSettings> = {}): TournamentSettings {
  return tournamentSettingsSchema.parse(overrides);
}

function seedTournament(
  repo: FakeTournamentRepo,
  id: string,
  format: TournamentFormat,
  overrides: Partial<TournamentSettings> = {},
  extra: Partial<TournamentRow> = {},
): TournamentRow {
  const row: TournamentRow = {
    id,
    groupId: "group-1",
    name: "Torneo de prueba",
    format,
    entryMode: "teams",
    teamSize: 5,
    status: "registration",
    settings: settingsFor(overrides),
    organizerId: "organizer-1",
    ...extra,
  };
  repo.tournaments.set(id, row);
  return row;
}

function seedEntries(repo: FakeTournamentRepo, tournamentId: string, entries: EntryRow[]): void {
  repo.entries.set(tournamentId, entries);
}

function entryRow(n: number, seed: number | null = n): EntryRow {
  return { id: `e${n}`, name: `Entry ${n}`, seed, playerIds: [] };
}

/** Marks a match completed directly (bypassing confirm_match_result/applyResult, which aren't
 * this repo's concern) so afterTournamentMatchCompleted's "is this group/round done" checks have
 * something to react to. */
function completeMatch(state: TournamentState, matchId: string, winnerId: string, score1: number, score2: number): void {
  const m = state.matches.find((x) => x.id === matchId);
  if (!m) throw new Error(`completeMatch: ${matchId} not found`);
  m.status = "completed";
  m.decidedBy = "regular";
  m.score1 = score1;
  m.score2 = score2;
  m.winnerEntryId = winnerId;
  m.loserEntryId = m.entry1Id === winnerId ? (m.entry2Id as string) : (m.entry1Id as string);
}

describe("generateBracket", () => {
  const formats: TournamentFormat[] = ["league", "single_elim", "double_elim", "groups_ko", "swiss"];

  it.each(formats)("persists a valid bracket payload for format=%s", async (format) => {
    const repo = new FakeTournamentRepo();
    seedTournament(repo, "t1", format);
    seedEntries(repo, "t1", [entryRow(1), entryRow(2), entryRow(3), entryRow(4)]);

    const state = await generateBracket(repo, "t1", RNG);

    expect(repo.persistBracketCalls).toHaveLength(1);
    expect(state.format).toBe(format);
    expect(state.stages.length).toBeGreaterThan(0);
    expect(state.matches.length).toBeGreaterThan(0);

    const validIds = new Set<string | null>(["e1", "e2", "e3", "e4", BYE, null]);
    for (const m of state.matches) {
      expect(validIds.has(m.entry1Id)).toBe(true);
      expect(validIds.has(m.entry2Id)).toBe(true);
    }
  });

  it("seeds entries by descending average OVR when no entry has a manual seed", async () => {
    const repo = new FakeTournamentRepo();
    seedTournament(repo, "t1", "single_elim");
    seedEntries(repo, "t1", [entryRow(1, null), entryRow(2, null), entryRow(3, null), entryRow(4, null)]);
    // e2 has the highest roster OVR, e1 lowest -- descending order should be e2, e3/e4 tied (broken
    // by name), e1.
    repo.entries.get("t1")!.forEach((e) => (e.playerIds = [`p-${e.id}`]));
    repo.ovrByPlayer.set("p-e1", 40);
    repo.ovrByPlayer.set("p-e2", 90);
    repo.ovrByPlayer.set("p-e3", 70);
    repo.ovrByPlayer.set("p-e4", 70);

    await generateBracket(repo, "t1", RNG);

    const state = repo.persistBracketCalls[0]!.state;
    // Single elim round 1 pairs seed1-vs-seed4 and seed2-vs-seed3 (standardSeedOrder(4)=[1,4,2,3]):
    // e2 (seed1) should meet the lowest remaining seed (e1, seed4).
    const round1 = state.matches.filter((m) => m.round === 1);
    const pairContainingE2 = round1.find((m) => m.entry1Id === "e2" || m.entry2Id === "e2")!;
    expect([pairContainingE2.entry1Id, pairContainingE2.entry2Id].sort()).toEqual(["e1", "e2"]);
  });

  it("keeps organizer-assigned seeds untouched when every entry already has one", async () => {
    const repo = new FakeTournamentRepo();
    seedTournament(repo, "t1", "single_elim");
    // Deliberately "wrong" vs OVR: e4 is seeded #1 despite the (irrelevant, since seeds are manual)
    // absence of any OVR data.
    seedEntries(repo, "t1", [entryRow(1, 4), entryRow(2, 3), entryRow(3, 2), entryRow(4, 1)]);

    await generateBracket(repo, "t1", RNG);

    const state = repo.persistBracketCalls[0]!.state;
    const round1 = state.matches.filter((m) => m.round === 1);
    // seed1 (e4) meets seed4 (e1).
    const pairContainingE4 = round1.find((m) => m.entry1Id === "e4" || m.entry2Id === "e4")!;
    expect([pairContainingE4.entry1Id, pairContainingE4.entry2Id].sort()).toEqual(["e1", "e4"]);
  });

  it("throws when the tournament doesn't exist", async () => {
    const repo = new FakeTournamentRepo();
    await expect(generateBracket(repo, "missing", RNG)).rejects.toBeInstanceOf(TournamentNotFoundError);
  });

  it("throws when a bracket was already generated", async () => {
    const repo = new FakeTournamentRepo();
    seedTournament(repo, "t1", "single_elim");
    seedEntries(repo, "t1", [entryRow(1), entryRow(2)]);
    await generateBracket(repo, "t1", RNG);

    await expect(generateBracket(repo, "t1", RNG)).rejects.toBeInstanceOf(TournamentAlreadyGeneratedError);
    expect(repo.persistBracketCalls).toHaveLength(1); // second attempt never touched persistBracket
  });

  it("throws with fewer than 2 entries", async () => {
    const repo = new FakeTournamentRepo();
    seedTournament(repo, "t1", "single_elim");
    seedEntries(repo, "t1", [entryRow(1)]);
    await expect(generateBracket(repo, "t1", RNG)).rejects.toThrow(/at least 2 entries/);
  });
});

describe("buildIndividualEntries", () => {
  it("balances registrations into teams and saves them (unseeded)", async () => {
    const repo = new FakeTournamentRepo();
    seedTournament(repo, "t1", "single_elim", {}, { entryMode: "individual", teamSize: 3 });
    const playerIds = ["p1", "p2", "p3", "p4", "p5", "p6"];
    repo.registrations.set("t1", playerIds);
    for (const id of playerIds) repo.balanceInputs.set(id, { id, mu: 25, ovr: 60, isGk: false });

    await buildIndividualEntries(repo, "t1", RNG);

    expect(repo.saveEntriesCalls).toHaveLength(1);
    const saved = repo.saveEntriesCalls[0]!.entries;
    expect(saved).toHaveLength(2); // 6 players / team_size 3 -> 2 teams
    expect(saved.every((e) => e.seed === null)).toBe(true);
    const allAssigned = saved.flatMap((e) => e.playerIds).sort();
    expect(allAssigned).toEqual([...playerIds].sort()); // every registrant placed exactly once
  });

  it("throws for a teams-mode tournament", async () => {
    const repo = new FakeTournamentRepo();
    seedTournament(repo, "t1", "single_elim"); // entryMode defaults to 'teams'
    repo.registrations.set("t1", ["p1", "p2"]);
    await expect(buildIndividualEntries(repo, "t1", RNG)).rejects.toThrow(/individual-entry/);
  });

  it("throws with fewer than 2 registrations", async () => {
    const repo = new FakeTournamentRepo();
    seedTournament(repo, "t1", "single_elim", {}, { entryMode: "individual" });
    repo.registrations.set("t1", ["p1"]);
    await expect(buildIndividualEntries(repo, "t1", RNG)).rejects.toThrow(/at least 2 registered/);
  });
});

describe("afterTournamentMatchCompleted: groups_ko", () => {
  async function setUpGroupsKo(): Promise<{ repo: FakeTournamentRepo; groupOfEntry: Map<string, string> }> {
    const repo = new FakeTournamentRepo();
    seedTournament(repo, "t1", "groups_ko"); // defaults: group_count 2, qualifiers_per_group 2
    seedEntries(repo, "t1", [entryRow(1), entryRow(2), entryRow(3), entryRow(4)]);
    await generateBracket(repo, "t1", RNG);

    const state = repo.states.get("t1")!;
    const groupOfEntry = new Map<string, string>();
    for (const group of state.groups) {
      for (const m of state.matches.filter((x) => x.groupId === group.id)) {
        if (typeof m.entry1Id === "string") groupOfEntry.set(m.entry1Id, group.label);
        if (typeof m.entry2Id === "string") groupOfEntry.set(m.entry2Id, group.label);
      }
    }
    return { repo, groupOfEntry };
  }

  it("seeds the knockout stage group-by-group as each group's matches complete", async () => {
    const { repo, groupOfEntry } = await setUpGroupsKo();
    const state = repo.states.get("t1")!;
    const groupA = [...groupOfEntry.entries()].filter(([, label]) => label === "A").map(([id]) => id);
    const groupB = [...groupOfEntry.entries()].filter(([, label]) => label === "B").map(([id]) => id);
    expect(groupA).toHaveLength(2);
    expect(groupB).toHaveLength(2);

    const groupAMatch = state.matches.find((m) => m.groupId && groupOfEntry.get(m.entry1Id as string) === "A")!;
    completeMatch(state, groupAMatch.id, groupA[0], 3, 1);

    await afterTournamentMatchCompleted(repo, "t1", RNG);

    expect(repo.seedKnockoutCalls).toHaveLength(1);
    expect(repo.seedKnockoutCalls[0]!.qualifiers).toEqual([{ group: "A", entries: [groupA[0], groupA[1]] }]);

    // Idempotent: calling again with nothing new completed does not re-seed group A.
    await afterTournamentMatchCompleted(repo, "t1", RNG);
    expect(repo.seedKnockoutCalls).toHaveLength(1);

    const groupBMatch = repo.states.get("t1")!.matches.find((m) => m.groupId && groupOfEntry.get(m.entry1Id as string) === "B")!;
    completeMatch(repo.states.get("t1")!, groupBMatch.id, groupB[1], 2, 0);

    await afterTournamentMatchCompleted(repo, "t1", RNG);
    expect(repo.seedKnockoutCalls).toHaveLength(2);
    expect(repo.seedKnockoutCalls[1]!.qualifiers).toEqual([{ group: "B", entries: [groupB[1], groupB[0]] }]);

    // Every knockout round-1 placeholder is now resolved to a real entry (no BYE, no null).
    const finalState = repo.states.get("t1")!;
    const koRound1 = finalState.matches.filter((m) => m.bracket === "winners" && m.round === 1);
    for (const m of koRound1) {
      expect(typeof m.entry1Id).toBe("string");
      expect(typeof m.entry2Id).toBe("string");
    }

    // Fully seeded now: a third call is a true no-op.
    await afterTournamentMatchCompleted(repo, "t1", RNG);
    expect(repo.seedKnockoutCalls).toHaveLength(2);
  });

  it("is a no-op when no group is fully completed yet", async () => {
    const { repo } = await setUpGroupsKo();
    await afterTournamentMatchCompleted(repo, "t1", RNG);
    expect(repo.seedKnockoutCalls).toHaveLength(0);
  });
});

describe("afterTournamentMatchCompleted: swiss", () => {
  it("appends the next round once the current one is fully completed, and stops after the last round", async () => {
    const repo = new FakeTournamentRepo();
    seedTournament(repo, "t1", "swiss"); // 4 entries -> ceil(log2(4)) = 2 rounds
    seedEntries(repo, "t1", [entryRow(1), entryRow(2), entryRow(3), entryRow(4)]);
    await generateBracket(repo, "t1", RNG);

    // Not complete yet: no-op.
    await afterTournamentMatchCompleted(repo, "t1", RNG);
    expect(repo.appendSwissCalls).toHaveLength(0);

    const state = repo.states.get("t1")!;
    const round1 = state.matches.filter((m) => m.round === 1);
    expect(round1).toHaveLength(2); // even entry count, no bye
    for (const m of round1) {
      completeMatch(state, m.id, m.entry1Id as string, 1, 0);
    }

    await afterTournamentMatchCompleted(repo, "t1", RNG);
    expect(repo.appendSwissCalls).toHaveLength(1);
    const round2 = repo.states.get("t1")!.matches.filter((m) => m.round === 2);
    expect(round2).toHaveLength(2);

    // Idempotent while round 2 is still in progress.
    await afterTournamentMatchCompleted(repo, "t1", RNG);
    expect(repo.appendSwissCalls).toHaveLength(1);

    const state2 = repo.states.get("t1")!;
    for (const m of state2.matches.filter((x) => x.round === 2)) {
      completeMatch(state2, m.id, m.entry1Id as string, 2, 1);
    }

    // Round 2 was the last configured round: no round 3 gets appended.
    await afterTournamentMatchCompleted(repo, "t1", RNG);
    expect(repo.appendSwissCalls).toHaveLength(1);
  });
});

describe("afterTournamentMatchCompleted: single_elim / double_elim / league", () => {
  it("is a no-op (no groups_ko/swiss progression applies)", async () => {
    for (const format of ["single_elim", "double_elim", "league"] as TournamentFormat[]) {
      const repo = new FakeTournamentRepo();
      seedTournament(repo, "t1", format);
      seedEntries(repo, "t1", [entryRow(1), entryRow(2), entryRow(3), entryRow(4)]);
      await generateBracket(repo, "t1", RNG);

      await expect(afterTournamentMatchCompleted(repo, "t1", RNG)).resolves.toBeUndefined();
      expect(repo.seedKnockoutCalls).toHaveLength(0);
      expect(repo.appendSwissCalls).toHaveLength(0);
    }
  });
});

describe("computeStandings", () => {
  it("returns a standings table for a league stage from the completed matches", async () => {
    const repo = new FakeTournamentRepo();
    seedTournament(repo, "t1", "league");
    seedEntries(repo, "t1", [entryRow(1), entryRow(2), entryRow(3)]); // odd -> one BYE per round
    await generateBracket(repo, "t1", RNG);

    const state = repo.states.get("t1")!;
    for (const m of state.matches) {
      if (m.status === "completed") continue; // already-resolved BYE
      completeMatch(state, m.id, m.entry1Id as string, 2, 0);
    }

    const result = await computeStandings(repo, "t1", RNG);
    expect(result).toHaveLength(1);
    expect(result[0]!.groupId).toBeNull();
    const winners = result[0]!.rows.filter((r) => r.wins > 0 || r.played === 1);
    expect(result[0]!.rows.map((r) => r.entryId)).toEqual(expect.arrayContaining(["e1", "e2", "e3"]));
    expect(winners.length).toBeGreaterThan(0);
  });

  it("returns [] for a tournament with no bracket yet", async () => {
    const repo = new FakeTournamentRepo();
    seedTournament(repo, "t1", "league");
    expect(await computeStandings(repo, "t1", RNG)).toEqual([]);
  });

  it("uses settings.swiss.tiebreakers (not the top-level tiebreakers) for a swiss stage", async () => {
    const repo = new FakeTournamentRepo();
    seedTournament(repo, "t1", "swiss");
    seedEntries(repo, "t1", [entryRow(1), entryRow(2), entryRow(3), entryRow(4)]);
    await generateBracket(repo, "t1", RNG);
    const state = repo.states.get("t1")!;
    for (const m of state.matches) completeMatch(state, m.id, m.entry1Id as string, 1, 0);

    const result = await computeStandings(repo, "t1", RNG);
    expect(result).toHaveLength(1);
    expect(result[0]!.rows).toHaveLength(4);
    // Buchholz is only meaningful under swiss.tiebreakers; sanity-check it was actually computed.
    expect(result[0]!.rows.some((r) => r.buchholz > 0)).toBe(true);
  });
});
