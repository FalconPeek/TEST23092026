import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BYE } from "@/lib/brackets";
import { FixturesList, type FixtureEntryInfo, type FixtureMatch } from "./fixtures-list";
import { es } from "@/messages/es";

afterEach(cleanup);

vi.mock("@/lib/actions/tournaments", () => ({
  confirmTournamentResult: vi.fn(),
  editTournamentResult: vi.fn(),
  startTournamentMatch: vi.fn(),
}));

const ENTRIES: FixtureEntryInfo[] = [
  { id: "e1", name: "Los Pibes" },
  { id: "e2", name: "Otro Equipo" },
  { id: "e3", name: "Tercer Equipo" },
];

function baseMatch(overrides: Partial<FixtureMatch>): FixtureMatch {
  return {
    id: "m1",
    bracket: "group",
    round: 1,
    groupLabel: null,
    entry1Id: "e1",
    entry2Id: "e2",
    status: "completed",
    score1: 2,
    score2: 1,
    pens1: null,
    pens2: null,
    decidedBy: "regular",
    matchId: null,
    ...overrides,
  };
}

describe("FixturesList grouping", () => {
  it("groups league matches (no group label) by matchday", () => {
    const matches: FixtureMatch[] = [
      baseMatch({ id: "m1", round: 1 }),
      baseMatch({ id: "m2", round: 2, entry1Id: "e1", entry2Id: "e3" }),
    ];
    render(<FixturesList groupId="g1" tournamentId="t1" matches={matches} entries={ENTRIES} admin={false} />);

    expect(screen.getByText(es.standings.matchday(1))).toBeInTheDocument();
    expect(screen.getByText(es.standings.matchday(2))).toBeInTheDocument();
  });

  it("groups groups_ko matches by group label then round", () => {
    const matches: FixtureMatch[] = [
      baseMatch({ id: "m1", groupLabel: "A", round: 1 }),
      baseMatch({ id: "m2", groupLabel: "B", round: 1, entry1Id: "e1", entry2Id: "e3" }),
    ];
    render(<FixturesList groupId="g1" tournamentId="t1" matches={matches} entries={ENTRIES} admin={false} />);

    expect(screen.getByText(`${es.standings.group("A")} · ${es.standings.matchday(1)}`)).toBeInTheDocument();
    expect(screen.getByText(`${es.standings.group("B")} · ${es.standings.matchday(1)}`)).toBeInTheDocument();
  });

  it("groups swiss matches by round", () => {
    const matches: FixtureMatch[] = [baseMatch({ id: "m1", bracket: "swiss", round: 3 })];
    render(<FixturesList groupId="g1" tournamentId="t1" matches={matches} entries={ENTRIES} admin={false} />);

    expect(screen.getByText(es.standings.swissRound(3))).toBeInTheDocument();
  });

  it("falls back to a bracket-labeled section for pure knockout matches", () => {
    const matches: FixtureMatch[] = [baseMatch({ id: "m1", bracket: "winners", round: 1, status: "ready", score1: null, score2: null })];
    render(<FixturesList groupId="g1" tournamentId="t1" matches={matches} entries={ENTRIES} admin={false} />);

    expect(screen.getByText(es.bracket.winners)).toBeInTheDocument();
  });

  it("shows the empty state when there are no matches at all", () => {
    render(<FixturesList groupId="g1" tournamentId="t1" matches={[]} entries={ENTRIES} admin={false} />);
    expect(screen.getByText(es.standings.noMatches)).toBeInTheDocument();
  });
});

describe("FixturesList bye rows", () => {
  it("renders a bye slot as 'Libre' instead of a resolved entry name", () => {
    const matches: FixtureMatch[] = [
      baseMatch({ id: "m1", entry1Id: "e1", entry2Id: BYE, status: "completed", decidedBy: "bye", score1: null, score2: null }),
    ];
    render(<FixturesList groupId="g1" tournamentId="t1" matches={matches} entries={ENTRIES} admin={false} />);

    expect(screen.getByText(es.bracket.bye)).toBeInTheDocument();
    expect(screen.getByText("Los Pibes")).toBeInTheDocument();
  });
});
