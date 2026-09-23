import { describe, expect, it } from "vitest";
import { defaultSwissRounds, generateSwiss, nextSwissRound } from "./swiss";
import { applyResult } from "./engine";
import { seededRng } from "./rng";
import { defaultTournamentSettings, tournamentSettingsSchema } from "@/lib/settings/tournament";
import { BYE, type Entry, type TournamentState } from "./types";

function makeEntries(n: number): Entry[] {
  return Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, name: `E${i + 1}`, seed: i + 1 }));
}

function completeRound(state: TournamentState, round: number): TournamentState {
  let s = state;
  const roundMatches = s.matches.filter((m) => m.round === round && m.status !== "completed");
  for (const m of roundMatches) {
    const e1 = m.entry1Id as string;
    const e2 = m.entry2Id as string;
    const seedOf = (id: string) => Number(id.slice(1));
    const [score1, score2] = seedOf(e1) < seedOf(e2) ? [1, 0] : [0, 1];
    s = applyResult(s, m.id, { score1, score2 });
  }
  return s;
}

function playAllRounds(state: TournamentState, rng = seededRng(1)): TournamentState {
  let s = state;
  const total = s.settings.swiss.rounds ?? defaultSwissRounds(s.entries.length);
  for (let r = 1; r <= total; r++) {
    s = completeRound(s, r);
    if (r < total) s = nextSwissRound(s, rng);
  }
  return s;
}

describe("defaultSwissRounds", () => {
  it("is ceil(log2 n)", () => {
    expect(defaultSwissRounds(2)).toBe(1);
    expect(defaultSwissRounds(3)).toBe(2);
    expect(defaultSwissRounds(4)).toBe(2);
    expect(defaultSwissRounds(5)).toBe(3);
    expect(defaultSwissRounds(33)).toBe(6);
  });
});

describe("generateSwiss", () => {
  it("round 1 pairs top half vs bottom half by seed", () => {
    const state = generateSwiss(makeEntries(8), defaultTournamentSettings);
    const round1 = state.matches.filter((m) => m.round === 1);
    expect(round1).toHaveLength(4);
    for (const m of round1) {
      const a = Number((m.entry1Id as string).slice(1));
      const b = Number((m.entry2Id as string).slice(1));
      expect(Math.abs(a - b)).toBe(4); // seed i vs seed i+4
    }
  });

  it("odd n gives exactly one bye, to the worst seed", () => {
    const state = generateSwiss(makeEntries(7), defaultTournamentSettings);
    const byeMatch = state.matches.find((m) => m.entry2Id === BYE);
    expect(byeMatch?.entry1Id).toBe("e7");
    expect(byeMatch?.status).toBe("completed");
    expect(byeMatch?.decidedBy).toBe("bye");
    expect(byeMatch?.winnerEntryId).toBe("e7");
  });

  it("no match is ever left playable with a BYE slot", () => {
    for (let n = 2; n <= 33; n++) {
      const state = generateSwiss(makeEntries(n), defaultTournamentSettings);
      for (const m of state.matches) {
        if (m.status !== "completed") expect(m.entry1Id === BYE || m.entry2Id === BYE).toBe(false);
      }
    }
  });
});

describe("nextSwissRound", () => {
  it("plays the configured (or default) number of rounds with no rematches, n = 2..33", () => {
    for (let n = 2; n <= 33; n++) {
      let state = generateSwiss(makeEntries(n), defaultTournamentSettings);
      state = playAllRounds(state);
      const totalRounds = defaultSwissRounds(n);
      const rounds = new Set(state.matches.map((m) => m.round));
      expect(rounds.size).toBe(totalRounds);

      const seen = new Set<string>();
      for (const m of state.matches) {
        if (typeof m.entry1Id !== "string" || m.entry1Id === BYE) continue;
        if (typeof m.entry2Id !== "string" || m.entry2Id === BYE) continue;
        const key = [m.entry1Id, m.entry2Id].sort().join("|");
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it("every entry appears exactly once per round", () => {
    for (const n of [5, 8, 13]) {
      let state = generateSwiss(makeEntries(n), defaultTournamentSettings);
      const totalRounds = defaultSwissRounds(n);
      for (let r = 1; r <= totalRounds; r++) {
        const roundMatches = state.matches.filter((m) => m.round === r);
        const seen = new Set<string>();
        for (const m of roundMatches) {
          for (const slot of [m.entry1Id, m.entry2Id]) {
            if (typeof slot === "string" && slot !== BYE) {
              expect(seen.has(slot)).toBe(false);
              seen.add(slot);
            }
          }
        }
        expect(seen.size).toBe(n);
        state = completeRound(state, r);
        if (r < totalRounds) state = nextSwissRound(state, seededRng(r));
      }
    }
  });

  it("nobody gets a second bye while rounds played < number of entries (n odd)", () => {
    const settings = tournamentSettingsSchema.parse({ swiss: { rounds: 5 } });
    let state = generateSwiss(makeEntries(9), settings);
    state = playAllRounds(state);
    const byeCounts = new Map<string, number>();
    for (const m of state.matches) {
      if (m.entry2Id === BYE) byeCounts.set(m.entry1Id as string, (byeCounts.get(m.entry1Id as string) ?? 0) + 1);
    }
    for (const count of byeCounts.values()) expect(count).toBeLessThanOrEqual(1);
    expect(byeCounts.size).toBe(5); // 5 rounds, 1 bye each, all going to different entries
  });

  it("throws once all configured rounds are generated", () => {
    const settings = tournamentSettingsSchema.parse({ swiss: { rounds: 1 } });
    let state = generateSwiss(makeEntries(4), settings);
    state = completeRound(state, 1);
    expect(() => nextSwissRound(state, seededRng(1))).toThrow();
  });

  it("throws if the current round isn't finished yet", () => {
    const state = generateSwiss(makeEntries(4), defaultTournamentSettings);
    expect(() => nextSwissRound(state, seededRng(1))).toThrow();
  });
});
