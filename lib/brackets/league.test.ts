import { describe, expect, it } from "vitest";
import { generateLeague } from "./league";
import { applyResult } from "./engine";
import { standings } from "./standings";
import { defaultTournamentSettings, tournamentSettingsSchema } from "@/lib/settings/tournament";
import { BYE, type Entry } from "./types";

function makeEntries(n: number): Entry[] {
  return Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, name: `E${i + 1}`, seed: i + 1 }));
}

describe("generateLeague", () => {
  it("every entry appears and matches allow draws", () => {
    const entries = makeEntries(4);
    const state = generateLeague(entries, defaultTournamentSettings);
    expect(state.matches).toHaveLength(6);
    const m = state.matches[0];
    const applied = applyResult(state, m.id, { score1: 1, score2: 1 });
    const updated = applied.matches.find((x) => x.id === m.id);
    expect(updated?.status).toBe("completed");
    expect(updated?.winnerEntryId).toBeNull();
    expect(updated?.decidedBy).toBe("regular");
  });

  it("double_round_robin doubles every fixture, n = 2..33", () => {
    for (let n = 2; n <= 33; n++) {
      const settings = tournamentSettingsSchema.parse({ league: { double_round_robin: true } });
      const single = generateLeague(makeEntries(n), { ...settings, league: { double_round_robin: false } });
      const double = generateLeague(makeEntries(n), settings);
      const realSingle = single.matches.filter((m) => m.entry1Id !== BYE && m.entry2Id !== BYE);
      const realDouble = double.matches.filter((m) => m.entry1Id !== BYE && m.entry2Id !== BYE);
      expect(realDouble).toHaveLength(realSingle.length * 2);
    }
  });

  it("standings rank a clean-sweep winner first", () => {
    const entries = makeEntries(4);
    let state = generateLeague(entries, defaultTournamentSettings);
    for (const m of state.matches) {
      const e1 = m.entry1Id as string;
      const e2 = m.entry2Id as string;
      const winner = e1 === "e1" || e2 === "e1" ? "e1" : e1;
      const [score1, score2] = winner === e1 ? [2, 0] : [0, 2];
      state = applyResult(state, m.id, { score1, score2 });
    }
    const table = standings(state.matches, state.settings);
    expect(table[0].entryId).toBe("e1");
    expect(table[0].points).toBe(9); // 3 wins * 3 points
  });
});
