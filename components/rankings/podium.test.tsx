import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Podium } from "./podium";
import { splitPodium, type LeaderboardRow } from "@/lib/rankings/format";
import { es } from "@/messages/es";

afterEach(cleanup);

function row(overrides: Partial<LeaderboardRow>): LeaderboardRow {
  return {
    playerId: "p1",
    displayName: "Juan",
    avatarUrl: null,
    value: 10,
    rank: 1,
    matchesPlayed: 5,
    ...overrides,
  };
}

describe("Podium", () => {
  it("renders nothing when there are no podium positions", () => {
    const { container } = render(<Podium groupId="g1" metric="goals" positions={[]} myPlayerId={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders each of the 3 places with a linked player", () => {
    const rows = [
      row({ playerId: "a", displayName: "Ana", rank: 1, value: 20 }),
      row({ playerId: "b", displayName: "Beto", rank: 2, value: 15 }),
      row({ playerId: "c", displayName: "Caro", rank: 3, value: 10 }),
    ];
    const { positions } = splitPodium(rows);
    render(<Podium groupId="g1" metric="goals" positions={positions} myPlayerId={null} />);

    for (const name of ["Ana", "Beto", "Caro"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /Ana/ })).toHaveAttribute("href", "/g/g1/jugadores/a");
  });

  it("renders every tied player at 1st place, all in the same slot", () => {
    const rows = [
      row({ playerId: "a", displayName: "Ana", rank: 1, value: 20 }),
      row({ playerId: "b", displayName: "Beto", rank: 1, value: 20 }),
      row({ playerId: "c", displayName: "Caro", rank: 2, value: 10 }),
    ];
    const { positions } = splitPodium(rows);
    render(<Podium groupId="g1" metric="goals" positions={positions} myPlayerId={null} />);

    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Beto")).toBeInTheDocument();
    expect(screen.getByText("Caro")).toBeInTheDocument();
  });

  it("labels my own row 'Vos' instead of my display name", () => {
    const rows = [row({ playerId: "me", displayName: "Yo Mismo", rank: 1, value: 20 })];
    const { positions } = splitPodium(rows);
    render(<Podium groupId="g1" metric="goals" positions={positions} myPlayerId="me" />);

    expect(screen.getByText(es.rankings.you)).toBeInTheDocument();
    expect(screen.queryByText("Yo Mismo")).not.toBeInTheDocument();
  });

  it("formats avg_rating with one decimal on the podium", () => {
    const rows = [row({ playerId: "a", rank: 1, value: 8 })];
    const { positions } = splitPodium(rows);
    render(<Podium groupId="g1" metric="avg_rating" positions={positions} myPlayerId={null} />);

    expect(screen.getByText("8,0")).toBeInTheDocument();
  });
});
