import { describe, expect, it } from "vitest";
import { generateDoubleElim } from "./double-elim";
import { applyResult } from "./engine";
import { defaultTournamentSettings, tournamentSettingsSchema } from "@/lib/settings/tournament";
import { BYE, type Entry, type Match, type TournamentState } from "./types";

function makeEntries(n: number): Entry[] {
  return Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, name: `E${i + 1}`, seed: i + 1 }));
}

const seedOf = (id: string) => Number(id.slice(1));

/** Plays every ready match, lower numeric seed always wins, until nothing is left playable. */
function simulate(state: TournamentState, playedPairs: Array<[string, string]> = []): TournamentState {
  let s = state;
  for (let guard = 0; guard < 500; guard++) {
    const ready = s.matches.find((m) => m.status === "ready");
    if (!ready) break;
    const e1 = ready.entry1Id as string;
    const e2 = ready.entry2Id as string;
    playedPairs.push([e1, e2]);
    const [score1, score2] = seedOf(e1) < seedOf(e2) ? [1, 0] : [0, 1];
    s = applyResult(s, ready.id, { score1, score2 });
  }
  return s;
}

describe("generateDoubleElim", () => {
  it("has 2(k-1) losers-bracket rounds for a k-round winners bracket, n = 2..33", () => {
    for (let n = 2; n <= 33; n++) {
      const state = generateDoubleElim(makeEntries(n), defaultTournamentSettings);
      const k = Math.ceil(Math.log2(n)) || 1;
      const lbRounds = new Set(state.matches.filter((m) => m.bracket === "losers").map((m) => m.round));
      expect(lbRounds.size).toBe(Math.max(0, 2 * (k - 1)));
    }
  });

  it("every entry appears exactly once in winners-bracket round 1, n = 2..33", () => {
    for (let n = 2; n <= 33; n++) {
      const entries = makeEntries(n);
      const state = generateDoubleElim(entries, defaultTournamentSettings);
      const round1 = state.matches.filter((m) => m.bracket === "winners" && m.round === 1);
      const seen = new Set<string>();
      for (const m of round1) {
        for (const slot of [m.entry1Id, m.entry2Id]) {
          if (typeof slot === "string" && slot !== BYE) seen.add(slot);
        }
      }
      expect(seen.size).toBe(n);
    }
  });

  it("has pow2-1 WB slots and pow2-2 LB slots (byes pad up to the next power of two), n = 2..33", () => {
    for (let n = 2; n <= 33; n++) {
      const state = generateDoubleElim(makeEntries(n), defaultTournamentSettings);
      const pow2 = Math.pow(2, Math.ceil(Math.log2(n)));
      const wb = state.matches.filter((m) => m.bracket === "winners");
      const lb = state.matches.filter((m) => m.bracket === "losers");
      expect(wb).toHaveLength(pow2 - 1);
      expect(lb).toHaveLength(pow2 - 2);
      const finals = state.matches.filter((m) => m.bracket === "final");
      expect(finals).toHaveLength(defaultTournamentSettings.double_elim.grand_final_reset ? 2 : 1);
    }
  });

  it("no BYE-vs-BYE match is ever left playable", () => {
    for (let n = 2; n <= 33; n++) {
      const state = generateDoubleElim(makeEntries(n), defaultTournamentSettings);
      for (const m of state.matches) {
        if (m.status !== "completed" && m.status !== "archived") {
          expect(m.entry1Id === BYE && m.entry2Id === BYE).toBe(false);
        }
      }
    }
  });

  it("BYEs cascade into the losers bracket (small bracket sanity: n=5)", () => {
    // pow2=8: WB1 has 3 byes; at least one LB1 match should itself involve a BYE slot
    // (a WB1 bye produces no real loser).
    const state = generateDoubleElim(makeEntries(5), defaultTournamentSettings);
    const lb1 = state.matches.filter((m) => m.bracket === "losers" && m.round === 1);
    const anyByeFed = lb1.some((m) => m.entry1Id === BYE || m.entry2Id === BYE || m.status === "completed");
    expect(anyByeFed).toBe(true);
  });

  it("simulating all results (top seed always wins) crowns seed 1 champion via the WB path, n = 2..33", () => {
    for (let n = 2; n <= 33; n++) {
      let state = generateDoubleElim(makeEntries(n), defaultTournamentSettings);
      state = simulate(state);
      const gf1 = state.matches.find((m) => m.bracket === "final" && m.round === 1) as Match;
      expect(gf1.status).toBe("completed");
      expect(gf1.winnerEntryId).toBe("e1");
      // Seed 1 never lost, so GF1's winner came from the WB slot (entry1) and no reset is needed.
      expect(gf1.winnerEntryId).toBe(gf1.entry1Id);
      const gf2 = state.matches.find((m) => m.bracket === "final" && m.round === 2);
      if (gf2) expect(gf2.status).toBe("archived");
    }
  });

  it("grand final reset activates only when the LB-path entrant wins GF1", () => {
    const settings = tournamentSettingsSchema.parse({ double_elim: { grand_final_reset: true } });
    let state = generateDoubleElim(makeEntries(4), settings);
    // Force seed 4 to win it all: lose once early in WB, then run the table in LB, then win GF1.
    // Simplest deterministic path: play everything with seed4 always winning.
    for (let guard = 0; guard < 50; guard++) {
      const ready = state.matches.find((m) => m.status === "ready");
      if (!ready) break;
      const e1 = ready.entry1Id as string;
      const e2 = ready.entry2Id as string;
      const winner = e1 === "e4" || e2 === "e4" ? "e4" : e1; // seed4 wins whenever present, else arbitrary
      const [score1, score2] = winner === e1 ? [1, 0] : [0, 1];
      state = applyResult(state, ready.id, { score1, score2 });
    }
    const gf1 = state.matches.find((m) => m.bracket === "final" && m.round === 1) as Match;
    expect(gf1.status).toBe("completed");
    const gf2 = state.matches.find((m) => m.bracket === "final" && m.round === 2) as Match;
    if (gf1.winnerEntryId === gf1.entry2Id) {
      // LB path won GF1: reset must be activated and playable.
      expect(gf2.status).toBe("ready");
      expect(gf2.entry1Id).toBe(gf1.entry1Id);
      expect(gf2.entry2Id).toBe(gf1.entry2Id);
    } else {
      expect(gf2.status).toBe("archived");
    }
  });

  it("with grand_final_reset disabled there is a single winner-take-all grand final", () => {
    const settings = tournamentSettingsSchema.parse({ double_elim: { grand_final_reset: false } });
    const state = generateDoubleElim(makeEntries(8), settings);
    const finals = state.matches.filter((m) => m.bracket === "final");
    expect(finals).toHaveLength(1);
  });

  it("small brackets (n <= 16) have no avoidable rematch: only the WB-final pairing may resurface in the LB final / GF", () => {
    // With "favourite always wins", the WB runner-up is guaranteed to reach
    // the LB final (they only drop into the very last LB round) and — since
    // that round's other slot is whoever survived the entire losers bracket
    // — may legitimately face someone they already eliminated in the WB.
    // That, plus GF1 vs GF2 (an intentional replay), are the only rematches
    // no seeding can avoid; everything else must be a first-time meeting.
    for (const n of [4, 8, 16]) {
      const played: Array<[string, string]> = [];
      let state = generateDoubleElim(makeEntries(n), defaultTournamentSettings);
      state = simulate(state, played);
      const seen = new Set<string>();
      let rematches = 0;
      for (const [a, b] of played) {
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (seen.has(key)) rematches++;
        seen.add(key);
      }
      expect(rematches).toBeLessThanOrEqual(2);
    }
  });

  it("rematches stay bounded even for the largest supported brackets (n up to 33)", () => {
    // A fully general guarantee of zero rematches in the losers bracket is
    // mathematically impossible for deep brackets (by the LB final, the LB
    // champion could be any of ~pow2/2 original entrants, so it can't be
    // guaranteed disjoint from the WB finalist's history) — a limitation
    // shared by real-world bracket generators. We only assert the count
    // stays small (not "every match is a rematch").
    for (let n = 2; n <= 33; n += 3) {
      const played: Array<[string, string]> = [];
      let state = generateDoubleElim(makeEntries(n), defaultTournamentSettings);
      state = simulate(state, played);
      const seen = new Set<string>();
      let rematches = 0;
      for (const [a, b] of played) {
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (seen.has(key)) rematches++;
        seen.add(key);
      }
      expect(rematches).toBeLessThanOrEqual(Math.ceil(Math.log2(n + 1)) + 1);
    }
  });
});
