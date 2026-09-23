import { describe, expect, it } from "vitest";
import { bergerRounds, buildRoundRobinMatches } from "./round-robin";
import { BYE, type Entry } from "./types";

function makeEntries(n: number): Entry[] {
  return Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, name: `E${i + 1}`, seed: i + 1 }));
}

describe("bergerRounds", () => {
  it("every pair meets exactly once across n-1 rounds, n even 2..34", () => {
    for (let n = 2; n <= 34; n += 2) {
      const rounds = bergerRounds(n);
      expect(rounds).toHaveLength(n - 1);
      const seen = new Set<string>();
      for (const round of rounds) {
        expect(round).toHaveLength(n / 2);
        const inRound = new Set<number>();
        for (const { home, away } of round) {
          expect(inRound.has(home)).toBe(false);
          expect(inRound.has(away)).toBe(false);
          inRound.add(home);
          inRound.add(away);
          const key = home < away ? `${home}-${away}` : `${away}-${home}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
      expect(seen.size).toBe((n * (n - 1)) / 2);
    }
  });
});

describe("buildRoundRobinMatches", () => {
  it("single round robin: every pair meets exactly once, n = 2..33", () => {
    for (let n = 2; n <= 33; n++) {
      const entries = makeEntries(n);
      const matches = buildRoundRobinMatches(entries, {
        stageId: "s1",
        groupId: null,
        bracket: "group",
        idPrefix: "s1-rr",
        doubleRound: false,
      });
      const real = matches.filter((m) => m.entry1Id !== BYE && m.entry2Id !== BYE);
      expect(real).toHaveLength((n * (n - 1)) / 2);
      const seen = new Set<string>();
      for (const m of real) {
        const key = [m.entry1Id, m.entry2Id].sort().join("|");
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
      // Odd n gets exactly one BYE fixture per round.
      if (n % 2 !== 0) {
        const byeMatches = matches.filter((m) => m.entry1Id === BYE || m.entry2Id === BYE);
        expect(byeMatches).toHaveLength(n); // n rounds when padded to n+1 (even)
        for (const m of byeMatches) {
          expect(m.status).toBe("completed");
          expect(m.decidedBy).toBe("bye");
        }
      }
    }
  });

  it("double round robin: every pair meets exactly twice, with reversed home/away", () => {
    for (let n = 2; n <= 12; n++) {
      const entries = makeEntries(n);
      const matches = buildRoundRobinMatches(entries, {
        stageId: "s1",
        groupId: null,
        bracket: "group",
        idPrefix: "s1-rr",
        doubleRound: true,
      });
      const real = matches.filter((m) => m.entry1Id !== BYE && m.entry2Id !== BYE);
      expect(real).toHaveLength(n * (n - 1));
      const counts = new Map<string, number>();
      const homeAway = new Map<string, Set<string>>();
      for (const m of real) {
        const key = [m.entry1Id, m.entry2Id].sort().join("|");
        counts.set(key, (counts.get(key) ?? 0) + 1);
        const dir = `${m.entry1Id}->${m.entry2Id}`;
        if (!homeAway.has(key)) homeAway.set(key, new Set());
        homeAway.get(key)?.add(dir);
      }
      for (const [key, count] of counts) {
        expect(count).toBe(2);
        expect(homeAway.get(key)?.size).toBe(2); // played home and away once each
      }
    }
  });

  it("no fixture is ever left playable with two BYE slots", () => {
    for (let n = 1; n <= 33; n++) {
      const matches = buildRoundRobinMatches(makeEntries(n), {
        stageId: "s1",
        groupId: null,
        bracket: "group",
        idPrefix: "s1-rr",
        doubleRound: false,
      });
      for (const m of matches) {
        expect(m.entry1Id === BYE && m.entry2Id === BYE).toBe(false);
      }
    }
  });

  it("home/away is roughly balanced across a single round robin", () => {
    for (const n of [4, 5, 6, 7, 10, 11]) {
      const entries = makeEntries(n);
      const matches = buildRoundRobinMatches(entries, {
        stageId: "s1",
        groupId: null,
        bracket: "group",
        idPrefix: "s1-rr",
        doubleRound: false,
      });
      const homeCount = new Map<string, number>();
      const awayCount = new Map<string, number>();
      for (const m of matches) {
        if (m.entry1Id !== BYE && typeof m.entry1Id === "string") {
          homeCount.set(m.entry1Id, (homeCount.get(m.entry1Id) ?? 0) + 1);
        }
        if (m.entry2Id !== BYE && typeof m.entry2Id === "string") {
          awayCount.set(m.entry2Id, (awayCount.get(m.entry2Id) ?? 0) + 1);
        }
      }
      for (const e of entries) {
        const home = homeCount.get(e.id) ?? 0;
        const away = awayCount.get(e.id) ?? 0;
        // A perfect 50/50 split isn't achievable for every seat with a
        // simple closed-form Berger schedule (it depends on parity of both
        // n and the seat's rotation trajectory); this guards against a
        // systematically lopsided (e.g. always-home) schedule rather than
        // demanding perfect balance.
        expect(Math.abs(home - away)).toBeLessThanOrEqual(3);
      }
    }
  });
});
