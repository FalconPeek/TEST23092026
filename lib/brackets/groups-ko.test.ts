import { describe, expect, it } from "vitest";
import { generateGroupsKo, resolveGroupQualifiers } from "./groups-ko";
import { applyResult } from "./engine";
import { defaultTournamentSettings, tournamentSettingsSchema } from "@/lib/settings/tournament";
import { BYE, type Entry, type TournamentState } from "./types";

function makeEntries(n: number): Entry[] {
  return Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, name: `E${i + 1}`, seed: i + 1 }));
}

/** Plays every ready group match (lower seed wins), then resolves qualifiers, repeatedly. */
function playGroupsAndResolve(state: TournamentState): TournamentState {
  let s = state;
  for (let guard = 0; guard < 500; guard++) {
    const ready = s.matches.find((m) => m.status === "ready" && m.bracket === "group");
    if (!ready) break;
    const e1 = ready.entry1Id as string;
    const e2 = ready.entry2Id as string;
    const seedOf = (id: string) => Number(id.slice(1));
    const [score1, score2] = seedOf(e1) < seedOf(e2) ? [1, 0] : [0, 1];
    s = applyResult(s, ready.id, { score1, score2 });
  }
  return resolveGroupQualifiers(s);
}

function playKo(state: TournamentState): TournamentState {
  let s = state;
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

describe("generateGroupsKo", () => {
  it("snake-seeds entries into groups of near-equal size, n = 2..33", () => {
    for (let n = 2; n <= 33; n++) {
      const state = generateGroupsKo(makeEntries(n), defaultTournamentSettings);
      const seen = new Set<string>();
      for (const g of state.groups) {
        const groupMatches = state.matches.filter((m) => m.groupId === g.id);
        for (const m of groupMatches) {
          for (const slot of [m.entry1Id, m.entry2Id]) {
            if (typeof slot === "string" && slot !== BYE) seen.add(slot);
          }
        }
      }
      expect(seen.size).toBe(n);
      const sizes = state.groups.map(
        (g) => new Set(state.entries.filter((e) => isInGroup(state, g.id, e.id)).map((e) => e.id)).size,
      );
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });

  it("crossover: seed A1 faces B2 (not A2) in round 1 for the default 2-group / 2-qualifier config", () => {
    const settings = tournamentSettingsSchema.parse({ groups_ko: { group_count: 2, qualifiers_per_group: 2 } });
    const state = generateGroupsKo(makeEntries(8), settings);
    const round1 = state.matches.filter((m) => m.stageId === "s2" && m.round === 1);
    for (const m of round1) {
      if (m.entry1From && m.entry2From) {
        expect(m.entry1From.fromGroup).not.toBe(m.entry2From.fromGroup);
      }
    }
  });

  it("a group's rank1 and rank2 qualifiers land in opposite halves of the draw (even group counts, qualifiers=2)", () => {
    for (const groupCount of [2, 4, 6, 8]) {
      const settings = tournamentSettingsSchema.parse({
        groups_ko: { group_count: groupCount, qualifiers_per_group: 2 },
      });
      const n = groupCount * 4; // plenty of players per group
      const state = generateGroupsKo(makeEntries(n), settings);
      const round1 = state.matches
        .filter((m) => m.stageId === "s2" && m.round === 1)
        .sort((a, b) => a.number - b.number);
      const half = round1.length / 2;
      const halfOf = new Map<string, 0 | 1>(); // `${group}#${rank}` -> which half of round 1 it's in
      round1.forEach((m, idx) => {
        const side: 0 | 1 = idx < half ? 0 : 1;
        for (const ref of [m.entry1From, m.entry2From]) {
          if (ref) halfOf.set(`${ref.fromGroup}#${ref.rank}`, side);
        }
      });
      for (const g of state.groups) {
        const rank1Half = halfOf.get(`${g.label}#1`);
        const rank2Half = halfOf.get(`${g.label}#2`);
        if (rank1Half !== undefined && rank2Half !== undefined) {
          expect(rank1Half).not.toBe(rank2Half);
        }
      }
    }
  });

  it("resolveGroupQualifiers fills the KO stage once groups finish, and the whole thing is playable to a champion, n = 2..33", () => {
    for (let n = 2; n <= 33; n++) {
      let state = generateGroupsKo(makeEntries(n), defaultTournamentSettings);
      state = playGroupsAndResolve(state);
      state = playKo(state);
      const final = state.matches.find((m) => m.bracket === "final");
      expect(final?.status).toBe("completed");
      expect(final?.winnerEntryId).toBeTruthy();
    }
  });

  it("no match is ever left playable with two BYE/void slots", () => {
    for (let n = 2; n <= 33; n++) {
      let state = generateGroupsKo(makeEntries(n), defaultTournamentSettings);
      state = playGroupsAndResolve(state);
      for (const m of state.matches) {
        if (m.status !== "completed" && m.status !== "archived") {
          expect(m.entry1Id === BYE && m.entry2Id === BYE).toBe(false);
        }
      }
    }
  });

  it("optional third place is fed once semifinal losers are known", () => {
    const settings = tournamentSettingsSchema.parse({
      groups_ko: { group_count: 2, qualifiers_per_group: 4, third_place: true },
    });
    let state = generateGroupsKo(makeEntries(16), settings);
    state = playGroupsAndResolve(state);
    state = playKo(state);
    const third = state.matches.find((m) => m.bracket === "third");
    expect(third?.status).toBe("completed");
  });
});

function isInGroup(state: TournamentState, groupId: string, entryId: string): boolean {
  return state.matches.some((m) => m.groupId === groupId && (m.entry1Id === entryId || m.entry2Id === entryId));
}
