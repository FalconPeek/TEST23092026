import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StandingsTable, type StandingsClub, type StandingsRowDisplay } from "./standings-table";
import { es } from "@/messages/es";

afterEach(cleanup);

function row(overrides: Partial<StandingsRowDisplay> = {}): StandingsRowDisplay {
  return {
    entryId: "e1",
    entryName: "Los Pibes",
    clubId: null,
    played: 3,
    wins: 2,
    draws: 1,
    losses: 0,
    goalsFor: 5,
    goalsAgainst: 2,
    goalDiff: 3,
    points: 7,
    buchholz: 0,
    sonnebornBerger: 0,
    lot: null,
    rank: 1,
    qualifies: false,
    ...overrides,
  };
}

describe("StandingsTable", () => {
  it("shows the empty state when there are no rows", () => {
    render(<StandingsTable rows={[]} showSwissColumns={false} />);
    expect(screen.getByText(es.standings.noMatches)).toBeInTheDocument();
  });

  it("highlights a qualifying row with a left accent border", () => {
    render(<StandingsTable rows={[row({ qualifies: true })]} showSwissColumns={false} />);
    const dataRow = screen.getByText("Los Pibes").closest("tr")!;
    expect(dataRow.className).toContain("border-l-primary");
  });

  it("doesn't highlight a non-qualifying row", () => {
    render(<StandingsTable rows={[row({ qualifies: false })]} showSwissColumns={false} />);
    const dataRow = screen.getByText("Los Pibes").closest("tr")!;
    expect(dataRow.className).not.toContain("border-l-primary");
  });

  it("shows Buchholz/Sonneborn-Berger columns only for swiss", () => {
    const { rerender } = render(<StandingsTable rows={[row()]} showSwissColumns={false} />);
    expect(screen.queryByText(es.standings.buchholz)).not.toBeInTheDocument();
    expect(screen.queryByText(es.standings.sonnebornBerger)).not.toBeInTheDocument();

    rerender(<StandingsTable rows={[row()]} showSwissColumns={true} />);
    expect(screen.getByText(es.standings.buchholz)).toBeInTheDocument();
    expect(screen.getByText(es.standings.sonnebornBerger)).toBeInTheDocument();
  });

  it("shows a lot marker only when the position was decided by a draw", () => {
    render(<StandingsTable rows={[row({ lot: 1 })]} showSwissColumns={false} />);
    expect(screen.getByTitle(es.standings.lot)).toBeInTheDocument();
  });

  it("shows no lot marker when the position wasn't decided by a draw", () => {
    render(<StandingsTable rows={[row({ lot: null })]} showSwissColumns={false} />);
    expect(screen.queryByTitle(es.standings.lot)).not.toBeInTheDocument();
  });

  it("shows the group label heading when given one", () => {
    render(<StandingsTable rows={[row()]} showSwissColumns={false} groupLabel="A" />);
    expect(screen.getByText(es.standings.group("A"))).toBeInTheDocument();
  });

  it("shows a crest when the row's entry has a club", () => {
    const club: StandingsClub = {
      name: "River",
      shortName: "RIV",
      primaryColor: "#112233",
      secondaryColor: "#ffffff",
      crestUrl: null,
    };
    render(
      <StandingsTable
        rows={[row({ clubId: "c1" })]}
        showSwissColumns={false}
        clubsById={new Map([["c1", club]])}
      />,
    );
    expect(screen.getByRole("img", { name: "River" })).toBeInTheDocument();
  });

  it("shows no crest when the row's entry has no club", () => {
    render(<StandingsTable rows={[row({ clubId: null })]} showSwissColumns={false} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
