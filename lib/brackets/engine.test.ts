import { describe, expect, it } from "vitest";
import { generate, applyResult, canEditResult, editResult } from "./engine";
import { seededRng } from "./rng";
import {
  InvalidMatchStateError,
  InvalidResultError,
  KoDrawRequiresDecisionError,
  MatchNotEditableError,
  MatchNotFoundError,
} from "./errors";
import { defaultTournamentSettings, tournamentSettingsSchema } from "@/lib/settings/tournament";
import type { Entry } from "./types";

function makeEntries(n: number): Entry[] {
  return Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, name: `E${i + 1}`, seed: i + 1 }));
}

describe("generate", () => {
  it("dispatches to every format", () => {
    const entries = makeEntries(6);
    for (const format of ["single_elim", "double_elim", "league", "groups_ko", "swiss"] as const) {
      const state = generate(format, entries, defaultTournamentSettings, seededRng(1));
      expect(state.format).toBe(format);
      expect(state.matches.length).toBeGreaterThan(0);
    }
  });

  it("random seeding mode reseeds entries deterministically from the rng", () => {
    const entries = makeEntries(8);
    const settings = tournamentSettingsSchema.parse({ seeding: "random" });
    const a = generate("single_elim", entries, settings, seededRng(42));
    const b = generate("single_elim", entries, settings, seededRng(42));
    expect(a.entries.map((e) => e.id)).toEqual(b.entries.map((e) => e.id));
    const c = generate("single_elim", entries, settings, seededRng(7));
    expect(a.entries.map((e) => e.id)).not.toEqual(c.entries.map((e) => e.id));
  });
});

describe("applyResult", () => {
  it("throws MatchNotFoundError for an unknown match id", () => {
    const state = generate("single_elim", makeEntries(4), defaultTournamentSettings, seededRng(1));
    expect(() => applyResult(state, "nope", { score1: 1, score2: 0 })).toThrow(MatchNotFoundError);
  });

  it("throws InvalidMatchStateError if entries aren't both resolved yet", () => {
    const state = generate("single_elim", makeEntries(4), defaultTournamentSettings, seededRng(1));
    const final = state.matches.find((m) => m.bracket === "final");
    expect(() => applyResult(state, final!.id, { score1: 1, score2: 0 })).toThrow(InvalidMatchStateError);
  });

  it("rejects a knockout draw without pens or a manual/walkover decision", () => {
    const state = generate("single_elim", makeEntries(4), defaultTournamentSettings, seededRng(1));
    const m = state.matches.find((x) => x.round === 1)!;
    expect(() => applyResult(state, m.id, { score1: 1, score2: 1 })).toThrow(KoDrawRequiresDecisionError);
  });

  it("accepts a knockout draw resolved by penalties", () => {
    const state = generate("single_elim", makeEntries(4), defaultTournamentSettings, seededRng(1));
    const m = state.matches.find((x) => x.round === 1)!;
    const next = applyResult(state, m.id, { score1: 1, score2: 1, pens1: 5, pens2: 4 });
    const updated = next.matches.find((x) => x.id === m.id);
    expect(updated?.decidedBy).toBe("pens");
    expect(updated?.winnerEntryId).toBe(m.entry1Id);
    // Pens never count as goals.
    expect(updated?.score1).toBe(1);
    expect(updated?.score2).toBe(1);
  });

  it("rejects equal pens (no shootout winner)", () => {
    const state = generate("single_elim", makeEntries(4), defaultTournamentSettings, seededRng(1));
    const m = state.matches.find((x) => x.round === 1)!;
    expect(() => applyResult(state, m.id, { score1: 1, score2: 1, pens1: 3, pens2: 3 })).toThrow(InvalidResultError);
  });

  it("accepts a manual decision on a tied knockout match with an explicit winner", () => {
    const state = generate("single_elim", makeEntries(4), defaultTournamentSettings, seededRng(1));
    const m = state.matches.find((x) => x.round === 1)!;
    const winner = m.entry2Id as string;
    const next = applyResult(state, m.id, { score1: 1, score2: 1, decidedBy: "manual", winnerEntryId: winner });
    const updated = next.matches.find((x) => x.id === m.id);
    expect(updated?.decidedBy).toBe("manual");
    expect(updated?.winnerEntryId).toBe(winner);
  });

  it("allows draws outright in non-knockout matches (league)", () => {
    const state = generate("league", makeEntries(4), defaultTournamentSettings, seededRng(1));
    const m = state.matches[0];
    const next = applyResult(state, m.id, { score1: 2, score2: 2 });
    const updated = next.matches.find((x) => x.id === m.id);
    expect(updated?.winnerEntryId).toBeNull();
    expect(updated?.status).toBe("completed");
  });

  it("rejects negative or non-integer scores", () => {
    const state = generate("league", makeEntries(4), defaultTournamentSettings, seededRng(1));
    const m = state.matches[0];
    expect(() => applyResult(state, m.id, { score1: -1, score2: 0 })).toThrow(InvalidResultError);
    expect(() => applyResult(state, m.id, { score1: 1.5, score2: 0 })).toThrow(InvalidResultError);
  });

  it("rejects re-applying a result to an already-completed match", () => {
    const state = generate("league", makeEntries(4), defaultTournamentSettings, seededRng(1));
    const m = state.matches[0];
    const next = applyResult(state, m.id, { score1: 1, score2: 0 });
    expect(() => applyResult(next, m.id, { score1: 2, score2: 0 })).toThrow(InvalidMatchStateError);
  });
});

describe("canEditResult / editResult", () => {
  it("allows editing a completed match with no downstream progress, and re-propagates", () => {
    const state = generate("single_elim", makeEntries(4), defaultTournamentSettings, seededRng(1));
    const m1 = state.matches.find((x) => x.round === 1 && x.number === 1)!;
    const m2 = state.matches.find((x) => x.round === 1 && x.number === 2)!;
    let s = applyResult(state, m1.id, { score1: 1, score2: 0 });
    s = applyResult(s, m2.id, { score1: 0, score2: 1 });
    expect(canEditResult(s, m1.id)).toBe(true);

    const final = s.matches.find((x) => x.bracket === "final")!;
    expect(final.entry1Id).toBe(m1.entry1Id); // winner of m1 propagated

    s = editResult(s, m1.id, { score1: 0, score2: 1 }); // flip the result
    const updatedFinal = s.matches.find((x) => x.id === final.id)!;
    expect(updatedFinal.entry1Id).toBe(m1.entry2Id); // re-propagated new winner
  });

  it("forbids editing once a downstream match has started", () => {
    const state = generate("single_elim", makeEntries(4), defaultTournamentSettings, seededRng(1));
    const m1 = state.matches.find((x) => x.round === 1 && x.number === 1)!;
    const m2 = state.matches.find((x) => x.round === 1 && x.number === 2)!;
    let s = applyResult(state, m1.id, { score1: 1, score2: 0 });
    s = applyResult(s, m2.id, { score1: 0, score2: 1 });
    const final = s.matches.find((x) => x.bracket === "final")!;
    s = applyResult(s, final.id, { score1: 1, score2: 0 });

    expect(canEditResult(s, m1.id)).toBe(false);
    expect(() => editResult(s, m1.id, { score1: 0, score2: 1 })).toThrow(MatchNotEditableError);
  });

  it("returns false for a match that hasn't been played yet, or doesn't exist", () => {
    const state = generate("single_elim", makeEntries(4), defaultTournamentSettings, seededRng(1));
    const final = state.matches.find((x) => x.bracket === "final")!;
    expect(canEditResult(state, final.id)).toBe(false);
    expect(canEditResult(state, "nope")).toBe(false);
  });

  it("editing GF1 correctly re-derives the reset match", () => {
    const settings = tournamentSettingsSchema.parse({ double_elim: { grand_final_reset: true } });
    let s = generate("double_elim", makeEntries(4), settings, seededRng(1));
    // Play it out with e1 always winning until GF1.
    for (let guard = 0; guard < 20; guard++) {
      const ready = s.matches.find((m) => m.status === "ready" && m.bracket !== "final");
      if (!ready) break;
      const e1 = ready.entry1Id as string;
      const e2 = ready.entry2Id as string;
      const winner = e1 === "e1" ? e1 : e1 < e2 ? e1 : e2; // arbitrary consistent winner
      const [score1, score2] = winner === e1 ? [1, 0] : [0, 1];
      s = applyResult(s, ready.id, { score1, score2 });
    }
    const gf1 = s.matches.find((m) => m.bracket === "final" && m.round === 1)!;
    // Force the LB-path (slot 2) to win GF1, activating the reset.
    s = applyResult(s, gf1.id, { score1: 0, score2: 1 });
    const gf2 = s.matches.find((m) => m.bracket === "final" && m.round === 2)!;
    expect(gf2.status).toBe("ready");
    expect(canEditResult(s, gf1.id)).toBe(true);

    // Now edit GF1 so the WB path wins instead: the reset must be archived again.
    s = editResult(s, gf1.id, { score1: 1, score2: 0 });
    const updatedGf2 = s.matches.find((m) => m.id === gf2.id)!;
    expect(updatedGf2.status).toBe("archived");
  });

  it("forbids editing GF1 once the reset match has started", () => {
    const settings = tournamentSettingsSchema.parse({ double_elim: { grand_final_reset: true } });
    let s = generate("double_elim", makeEntries(2), settings, seededRng(1));
    const wb1 = s.matches.find((m) => m.bracket === "winners")!;
    s = applyResult(s, wb1.id, { score1: 1, score2: 0 }); // e1 wins WB, e2 drops straight to GF as "LB champion"
    const gf1 = s.matches.find((m) => m.bracket === "final" && m.round === 1)!;
    s = applyResult(s, gf1.id, { score1: 0, score2: 1 }); // LB-path (slot2) wins GF1
    const gf2 = s.matches.find((m) => m.bracket === "final" && m.round === 2)!;
    expect(gf2.status).toBe("ready");
    s = applyResult(s, gf2.id, { score1: 1, score2: 0 });
    expect(canEditResult(s, gf1.id)).toBe(false);
  });
});
