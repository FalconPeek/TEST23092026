import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MatchResult, type MatchResultPlayerStat } from "./match-result";
import { es } from "@/messages/es";

afterEach(cleanup);

const STATS: MatchResultPlayerStat[] = [
  {
    playerId: "p1",
    displayName: "Juan",
    avatarUrl: null,
    side: 1,
    goals: 2,
    assists: 1,
    ownGoals: 0,
    saves: 0,
    cleanSheet: false,
    isMvp: true,
    medianRating: 8.5,
  },
  {
    playerId: "p2",
    displayName: "Pedro",
    avatarUrl: null,
    side: 2,
    goals: 0,
    assists: 0,
    ownGoals: 0,
    saves: 4,
    cleanSheet: true,
    isMvp: false,
    medianRating: 7,
  },
];

describe("MatchResult", () => {
  it("shows the scoreline and highlights the MVP with a star and label", () => {
    render(
      <MatchResult
        groupId="g1"
        team1Name="Blancos"
        team2Name="Negros"
        result={{ team1Goals: 2, team2Goals: 0, pens1: null, pens2: null }}
        stats={STATS}
      />,
    );

    expect(screen.getByText("2 - 0")).toBeInTheDocument();
    expect(screen.getByText(es.match.mvp)).toBeInTheDocument();
  });

  it("formats a penalty-shootout result", () => {
    render(
      <MatchResult
        groupId="g1"
        team1Name="Blancos"
        team2Name="Negros"
        result={{ team1Goals: 1, team2Goals: 1, pens1: 4, pens2: 3 }}
        stats={[]}
      />,
    );

    expect(screen.getByText("1 - 1 (4-3 pen.)")).toBeInTheDocument();
  });

  it("marks the clean-sheet player with a shield", () => {
    render(
      <MatchResult
        groupId="g1"
        team1Name="Blancos"
        team2Name="Negros"
        result={{ team1Goals: 2, team2Goals: 0, pens1: null, pens2: null }}
        stats={STATS}
      />,
    );

    expect(screen.getByLabelText(es.match.cleanSheet)).toBeInTheDocument();
  });

  it("shows unattributed goals for a side when the score doesn't fully add up", () => {
    render(
      <MatchResult
        groupId="g1"
        team1Name="Blancos"
        team2Name="Negros"
        result={{ team1Goals: 4, team2Goals: 0, pens1: null, pens2: null }}
        stats={STATS}
      />,
    );

    expect(screen.getByText(es.match.unattributed(2))).toBeInTheDocument();
  });

  it("shows no unattributed-goals line when every goal is accounted for", () => {
    render(
      <MatchResult
        groupId="g1"
        team1Name="Blancos"
        team2Name="Negros"
        result={{ team1Goals: 2, team2Goals: 0, pens1: null, pens2: null }}
        stats={STATS}
      />,
    );

    expect(screen.queryByText(/gol(es)? sin autor/)).not.toBeInTheDocument();
  });
});
