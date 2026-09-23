import { describe, expect, it } from "vitest";
import { standings } from "./standings";
import { seededRng } from "./rng";
import { newMatch } from "./propagation";
import { BracketError } from "./errors";
import { tournamentSettingsSchema } from "@/lib/settings/tournament";
import type { Match } from "./types";

function completed(overrides: Partial<Match> & { id: string; entry1Id: string; entry2Id: string }): Match {
  const m = newMatch({
    id: overrides.id,
    stageId: "s1",
    bracket: "group",
    round: overrides.round ?? 1,
    number: 1,
    entry1Id: overrides.entry1Id,
    entry2Id: overrides.entry2Id,
  });
  return {
    ...m,
    status: "completed",
    score1: overrides.score1 ?? 0,
    score2: overrides.score2 ?? 0,
    winnerEntryId: overrides.winnerEntryId ?? null,
    decidedBy: "regular",
  };
}

describe("standings", () => {
  it("ranks by points, then goal difference", () => {
    const settings = tournamentSettingsSchema.parse({});
    const matches = [
      completed({ id: "m1", entry1Id: "A", entry2Id: "B", score1: 3, score2: 0, winnerEntryId: "A" }),
      completed({ id: "m2", entry1Id: "C", entry2Id: "D", score1: 1, score2: 1 }),
      completed({ id: "m3", entry1Id: "A", entry2Id: "C", score1: 1, score2: 1 }),
      completed({ id: "m4", entry1Id: "B", entry2Id: "D", score1: 0, score2: 2, winnerEntryId: "D" }),
    ];
    const table = standings(matches, settings);
    expect(table.map((r) => r.entryId)[0]).toBe("A"); // 4 pts, best GD among top scorers
  });

  it("head-to-head is recomputed on the tied subset only", () => {
    const settings = tournamentSettingsSchema.parse({
      tiebreakers: ["points", "head_to_head", "goal_diff"],
    });
    // A, B, C all finish level on points; A beat B, B beat C, C beat A (a
    // perfect cycle) — head-to-head among the trio alone stays tied (each
    // has 1 win + 1 loss within the subset), so goal_diff must decide.
    const matches = [
      completed({ id: "m1", entry1Id: "A", entry2Id: "B", score1: 2, score2: 0, winnerEntryId: "A" }),
      completed({ id: "m2", entry1Id: "B", entry2Id: "C", score1: 3, score2: 0, winnerEntryId: "B" }),
      completed({ id: "m3", entry1Id: "C", entry2Id: "A", score1: 5, score2: 0, winnerEntryId: "C" }),
    ];
    const table = standings(matches, settings);
    // Points: A=3,B=3,C=3 (each 1 win). GD: A=2-5=-3, B=3-2=1, C=5-3=2 -> C,B,A
    expect(table.map((r) => r.entryId)).toEqual(["C", "B", "A"]);
  });

  it("falls back to lots (rng) when every tiebreaker is exhausted", () => {
    const settings = tournamentSettingsSchema.parse({ tiebreakers: ["points", "lots"] });
    // A cyclic set of draws: everyone finishes with 2 draws = 2 points, a
    // full tie with no way to separate them except 'lots'.
    const stub = [
      completed({ id: "m1", entry1Id: "A", entry2Id: "B", score1: 0, score2: 0 }),
      completed({ id: "m2", entry1Id: "B", entry2Id: "C", score1: 0, score2: 0 }),
      completed({ id: "m3", entry1Id: "C", entry2Id: "A", score1: 0, score2: 0 }),
    ];
    const table1 = standings(stub, settings, seededRng(1));
    const table2 = standings(stub, settings, seededRng(1));
    expect(table1.map((r) => r.entryId)).toEqual(table2.map((r) => r.entryId)); // deterministic given the seed
    expect(table1.every((r) => r.lot !== null)).toBe(true);
  });

  it("throws a typed error if lots is needed but no rng was provided", () => {
    const settings = tournamentSettingsSchema.parse({ tiebreakers: ["points", "lots"] });
    const matches = [completed({ id: "m1", entry1Id: "A", entry2Id: "B", score1: 0, score2: 0 })];
    expect(() => standings(matches, settings)).toThrow(BracketError);
  });

  it("bye counts as a win when points.bye_counts_as_win is true (default)", () => {
    const settings = tournamentSettingsSchema.parse({});
    const bye = { ...completed({ id: "m1", entry1Id: "A", entry2Id: "__bye__", winnerEntryId: "A" }), decidedBy: "bye" as const };
    const table = standings([bye], settings);
    const a = table.find((r) => r.entryId === "A");
    expect(a?.wins).toBe(1);
    expect(a?.points).toBe(3);
    expect(a?.played).toBe(1);
  });

  it("bye is not credited as a win/points when bye_counts_as_win is false (entry still listed, 0 played)", () => {
    const settings = tournamentSettingsSchema.parse({ points: { bye_counts_as_win: false } });
    const bye = { ...completed({ id: "m1", entry1Id: "A", entry2Id: "__bye__", winnerEntryId: "A" }), decidedBy: "bye" as const };
    const table = standings([bye], settings);
    const a = table.find((r) => r.entryId === "A");
    expect(a?.played).toBe(0);
    expect(a?.wins).toBe(0);
    expect(a?.points).toBe(0);
  });
});
