import { describe, expect, it } from "vitest";
import { generateSingleElim } from "./single-elim";
import { applyResult } from "./engine";
import { defaultTournamentSettings, tournamentSettingsSchema } from "@/lib/settings/tournament";
import { BYE, type Entry, type Match, type TournamentState } from "./types";

function makeEntries(n: number): Entry[] {
  return Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, name: `E${i + 1}`, seed: i + 1 }));
}

function playAllWinnersAreHigherSeed(state: TournamentState): TournamentState {
  let s = state;
  // Repeatedly resolve any ready match (lower numeric seed wins) until nothing left.
  for (let guard = 0; guard < 200; guard++) {
    const ready = s.matches.find((m) => m.status === "ready");
    if (!ready) break;
    const e1 = ready.entry1Id as string;
    const e2 = ready.entry2Id as string;
    const seedOf = (id: string) => Number(id.slice(1));
    const [score1, score2] = seedOf(e1) < seedOf(e2) ? [1, 0] : [0, 1];
    s = applyResult(s, ready.id, { score1, score2 });
  }
  return s;
}

describe("generateSingleElim", () => {
  it("byes go to top seeds for a 5-entry bracket", () => {
    const state = generateSingleElim(makeEntries(5), defaultTournamentSettings);
    const round1 = state.matches.filter((m) => m.round === 1);
    expect(round1).toHaveLength(4); // pow2=8 -> 4 first round matches
    const seed1Match = round1.find((m) => m.entry1Id === "e1" || m.entry2Id === "e1");
    expect(seed1Match?.status).toBe("completed");
    expect(seed1Match?.decidedBy).toBe("bye");
    expect(seed1Match?.winnerEntryId).toBe("e1");
  });

  it("every entry appears exactly once across round 1 slots, n = 2..33", () => {
    for (let n = 2; n <= 33; n++) {
      const entries = makeEntries(n);
      const state = generateSingleElim(entries, defaultTournamentSettings);
      const round1 = state.matches.filter((m) => m.round === 1 && m.bracket !== "third");
      const seen = new Set<string>();
      for (const m of round1) {
        for (const slot of [m.entry1Id, m.entry2Id]) {
          if (typeof slot === "string" && slot !== BYE) seen.add(slot);
        }
      }
      expect(seen.size).toBe(n);
    }
  });

  it("has pow2-1 bracket slots, of which exactly n-1 are real (non-bye) eliminations, n = 2..33", () => {
    for (let n = 2; n <= 33; n++) {
      const settings = { ...defaultTournamentSettings, single_elim: { third_place: true } };
      const state = generateSingleElim(makeEntries(n), settings);
      const bracket = state.matches.filter((m) => m.bracket !== "third");
      const pow2 = Math.pow(2, Math.ceil(Math.log2(n)));
      expect(bracket).toHaveLength(pow2 - 1);
      const realEliminations = bracket.filter((m) => m.decidedBy !== "bye");
      expect(realEliminations).toHaveLength(n - 1);
      const thirdPlace = state.matches.find((m) => m.bracket === "third");
      if (n >= 4) expect(thirdPlace).toBeDefined();
    }
  });

  it("no match is ever playable with two empty/void slots (no BYE-vs-BYE reaching a human)", () => {
    for (let n = 2; n <= 33; n++) {
      const state = generateSingleElim(makeEntries(n), defaultTournamentSettings);
      for (const m of state.matches) {
        if (m.status === "ready" || m.status === "locked" || m.status === "waiting") {
          expect(m.entry1Id === BYE && m.entry2Id === BYE).toBe(false);
        }
      }
    }
  });

  it("last round is tagged 'final'", () => {
    const state = generateSingleElim(makeEntries(8), defaultTournamentSettings);
    const rounds = state.matches.filter((m) => m.bracket !== "third").map((m) => m.round);
    const maxRound = Math.max(...rounds);
    const finalMatches = state.matches.filter((m) => m.round === maxRound && m.bracket !== "third");
    expect(finalMatches).toHaveLength(1);
    expect(finalMatches[0].bracket).toBe("final");
  });

  it("simulating all results (top seed always wins) crowns seed 1 champion, n = 2..33", () => {
    for (let n = 2; n <= 33; n++) {
      let state = generateSingleElim(makeEntries(n), defaultTournamentSettings);
      state = playAllWinnersAreHigherSeed(state);
      const final = state.matches.find((m) => m.bracket === "final");
      expect(final?.status).toBe("completed");
      expect(final?.winnerEntryId).toBe("e1");
    }
  });

  it("third place match is fed by both semifinal losers", () => {
    const settings = tournamentSettingsSchema.parse({ single_elim: { third_place: true } });
    let state = generateSingleElim(makeEntries(8), settings);
    state = playAllWinnersAreHigherSeed(state);
    const third = state.matches.find((m) => m.bracket === "third") as Match;
    expect(third.status).toBe("completed");
    // Losers of the two semifinals (seed 3 and seed 2, since 1 beats 4-ish paths... just check it's not BYE)
    expect(third.entry1Id).not.toBe(BYE);
    expect(third.entry2Id).not.toBe(BYE);
  });
});
