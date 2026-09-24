import { describe, expect, it } from "vitest";
import { applyResult, generateDoubleElim, generateSingleElim, type Entry, type Match, type TournamentState } from "@/lib/brackets";
import { defaultTournamentSettings } from "@/lib/settings/tournament";
import { buildBracketLayout, type BracketEntryInfo, type BracketMatchInput } from "./bracket-layout";
import { es } from "@/messages/es";

function makeEntries(n: number): Entry[] {
  return Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, name: `Equipo ${i + 1}`, seed: i + 1 }));
}

function toInput(m: Match): BracketMatchInput {
  return {
    id: m.id,
    bracket: m.bracket,
    round: m.round,
    number: m.number,
    entry1Id: m.entry1Id,
    entry2Id: m.entry2Id,
    entry1From: m.entry1From,
    entry2From: m.entry2From,
    status: m.status,
    winnerEntryId: m.winnerEntryId,
    score1: m.score1,
    score2: m.score2,
    pens1: m.pens1,
    pens2: m.pens2,
    decidedBy: m.decidedBy,
    matchId: null,
  };
}

function toEntryInfo(entries: Entry[]): BracketEntryInfo[] {
  return entries.map((e) => ({ id: e.id, name: e.name }));
}

const seedOf = (id: string) => Number(id.slice(1));

/** Plays every ready match (excluding the grand final), lower numeric seed always wins. */
function simulateUntilFinal(state: TournamentState): TournamentState {
  let s = state;
  for (let guard = 0; guard < 200; guard++) {
    const ready = s.matches.find((m) => m.status === "ready" && m.bracket !== "final");
    if (!ready) break;
    const e1 = ready.entry1Id as string;
    const e2 = ready.entry2Id as string;
    const [score1, score2] = seedOf(e1) < seedOf(e2) ? [1, 0] : [0, 1];
    s = applyResult(s, ready.id, { score1, score2 });
  }
  return s;
}

describe("buildBracketLayout: single_elim (8-slot bracket with byes, n=5)", () => {
  const state = generateSingleElim(makeEntries(5), defaultTournamentSettings);
  const layout = buildBracketLayout(state.matches.map(toInput), toEntryInfo(state.entries));

  it("labels the winners-bracket rounds by distance to the final (Cuartos, Semifinal)", () => {
    const winnersSection = layout.sections.find((s) => s.bracket === "winners")!;
    expect(winnersSection.label).toBe(es.bracket.winners);
    const round1 = winnersSection.rounds.find((r) => r.round === 1)!;
    const round2 = winnersSection.rounds.find((r) => r.round === 2)!;
    expect(round1.label).toBe("Cuartos de final");
    expect(round2.label).toBe("Semifinal");
  });

  it("labels the last round 'Final' in its own section (continuing the ladder's numbering)", () => {
    const finalSection = layout.sections.find((s) => s.bracket === "final")!;
    expect(finalSection.rounds).toHaveLength(1);
    expect(finalSection.rounds[0]!.label).toBe(es.bracket.final);
  });

  it("shows a bye slot as 'Libre' and resolves a known entry's name", () => {
    const winnersSection = layout.sections.find((s) => s.bracket === "winners")!;
    const round1Matches = winnersSection.rounds.find((r) => r.round === 1)!.matches;
    const byeMatch = round1Matches.find((m) => m.slot1.kind === "bye" || m.slot2.kind === "bye")!;
    expect(byeMatch).toBeDefined();
    const byeSlot = byeMatch.slot1.kind === "bye" ? byeMatch.slot1 : byeMatch.slot2;
    expect(byeSlot.label).toBe(es.bracket.bye);
    const entrySlot = byeMatch.slot1.kind === "bye" ? byeMatch.slot2 : byeMatch.slot1;
    expect(entrySlot.kind).toBe("entry");
    expect(entrySlot.label).toMatch(/^Equipo \d$/);
  });

  it("shows an unresolved round-2 slot as 'A definir'", () => {
    const winnersSection = layout.sections.find((s) => s.bracket === "winners")!;
    const round2Matches = winnersSection.rounds.find((r) => r.round === 2)!.matches;
    const hasTbd = round2Matches.some((m) => m.slot1.kind === "tbd" || m.slot2.kind === "tbd");
    expect(hasTbd).toBe(true);
  });

  it("has no championEntryId before the final is played", () => {
    expect(layout.championEntryId).toBeNull();
  });
});

describe("buildBracketLayout: single_elim with a third-place match (n=4)", () => {
  const settings = { ...defaultTournamentSettings, single_elim: { third_place: true } };
  const state = generateSingleElim(makeEntries(4), settings);
  const layout = buildBracketLayout(state.matches.map(toInput), toEntryInfo(state.entries));

  it("renders a separate third-place section", () => {
    const thirdSection = layout.sections.find((s) => s.bracket === "third")!;
    expect(thirdSection).toBeDefined();
    expect(thirdSection.label).toBe(es.bracket.third);
    expect(thirdSection.rounds).toHaveLength(1);
    expect(thirdSection.rounds[0]!.matches).toHaveLength(1);
  });
});

describe("buildBracketLayout: double_elim with a grand-final reset (n=4)", () => {
  it("labels GF1 'Gran final' and GF2 'Final (desempate)', and the champion comes from GF2", () => {
    let state = generateDoubleElim(makeEntries(4), defaultTournamentSettings);
    state = simulateUntilFinal(state);
    const gf1 = state.matches.find((m) => m.bracket === "final" && m.round === 1)!;
    // Slot 2 is always the losers-bracket path by construction; forcing it to win GF1 activates
    // the reset match (see lib/brackets/engine.ts's applyGrandFinalReset).
    state = applyResult(state, gf1.id, { score1: 0, score2: 1 });
    const gf2 = state.matches.find((m) => m.bracket === "final" && m.round === 2 && m.status === "ready")!;
    expect(gf2).toBeDefined();
    state = applyResult(state, gf2.id, { score1: 1, score2: 0 });

    const layout = buildBracketLayout(state.matches.map(toInput), toEntryInfo(state.entries));
    const finalSection = layout.sections.find((s) => s.bracket === "final")!;
    const round1 = finalSection.rounds.find((r) => r.round === 1)!;
    const round2 = finalSection.rounds.find((r) => r.round === 2)!;
    expect(round1.label).toBe(es.bracket.grandFinal);
    expect(round2.label).toBe(es.bracket.reset);

    const finalGf2 = state.matches.find((m) => m.bracket === "final" && m.round === 2)!;
    expect(layout.championEntryId).toBe(finalGf2.winnerEntryId);
  });

  it("has separate winners and losers sections", () => {
    const state = generateDoubleElim(makeEntries(4), defaultTournamentSettings);
    const layout = buildBracketLayout(state.matches.map(toInput), toEntryInfo(state.entries));
    expect(layout.sections.find((s) => s.bracket === "winners")).toBeDefined();
    expect(layout.sections.find((s) => s.bracket === "losers")).toBeDefined();
  });
});

// T-028: the champion must never be shown before every `final`-bracket match is resolved.
describe("buildBracketLayout: champion resolution", () => {
  it("double_elim: no champion while GF2 is pending after the losers-bracket team wins GF1", () => {
    let state = generateDoubleElim(makeEntries(4), defaultTournamentSettings);
    state = simulateUntilFinal(state);
    const gf1 = state.matches.find((m) => m.bracket === "final" && m.round === 1)!;
    // Slot 2 (LB path) wins GF1, which activates GF2 -- but GF2 hasn't been played yet.
    state = applyResult(state, gf1.id, { score1: 0, score2: 1 });
    const gf2 = state.matches.find((m) => m.bracket === "final" && m.round === 2)!;
    expect(gf2.status).toBe("ready");

    const layout = buildBracketLayout(state.matches.map(toInput), toEntryInfo(state.entries));
    expect(layout.championEntryId).toBeNull();
  });

  it("double_elim: the GF2 winner is champion once the reset is completed", () => {
    let state = generateDoubleElim(makeEntries(4), defaultTournamentSettings);
    state = simulateUntilFinal(state);
    const gf1 = state.matches.find((m) => m.bracket === "final" && m.round === 1)!;
    state = applyResult(state, gf1.id, { score1: 0, score2: 1 });
    const gf2 = state.matches.find((m) => m.bracket === "final" && m.round === 2 && m.status === "ready")!;
    state = applyResult(state, gf2.id, { score1: 1, score2: 0 });

    const layout = buildBracketLayout(state.matches.map(toInput), toEntryInfo(state.entries));
    const finalGf2 = state.matches.find((m) => m.bracket === "final" && m.round === 2)!;
    expect(layout.championEntryId).toBe(finalGf2.winnerEntryId);
  });

  it("double_elim: the GF1 winner is champion when the winners-bracket team wins it outright (GF2 archived)", () => {
    let state = generateDoubleElim(makeEntries(4), defaultTournamentSettings);
    state = simulateUntilFinal(state);
    const gf1 = state.matches.find((m) => m.bracket === "final" && m.round === 1)!;
    // Slot 1 (WB path) wins GF1 outright -- no reset needed.
    state = applyResult(state, gf1.id, { score1: 1, score2: 0 });
    const gf2 = state.matches.find((m) => m.bracket === "final" && m.round === 2)!;
    expect(gf2.status).toBe("archived");

    const layout = buildBracketLayout(state.matches.map(toInput), toEntryInfo(state.entries));
    const finalGf1 = state.matches.find((m) => m.id === gf1.id)!;
    expect(layout.championEntryId).toBe(finalGf1.winnerEntryId);
  });

  it("single_elim: no champion while the final hasn't been played", () => {
    const state = simulateUntilFinal(generateSingleElim(makeEntries(4), defaultTournamentSettings));
    const finalMatch = state.matches.find((m) => m.bracket === "final")!;
    expect(finalMatch.status).toBe("ready");

    const layout = buildBracketLayout(state.matches.map(toInput), toEntryInfo(state.entries));
    expect(layout.championEntryId).toBeNull();
  });
});
