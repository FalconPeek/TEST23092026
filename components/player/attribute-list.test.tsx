import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AttributeList } from "./attribute-list";
import { es } from "@/messages/es";

afterEach(cleanup);

const RATINGS = [
  { attribute: "sprint_speed", value: 45, nRaters: 2 },
  { attribute: "acceleration", value: 60, nRaters: 3 },
  { attribute: "finishing", value: 70, nRaters: 4 },
  { attribute: "shot_power", value: 80, nRaters: 5 },
  { attribute: "gk_diving", value: 55, nRaters: 1 },
];

describe("AttributeList", () => {
  it("groups outfield attributes under their face-stat heading", () => {
    render(<AttributeList position="DC" ratings={RATINGS} />);

    expect(screen.getByText(es.card.faceStats.pac)).toBeInTheDocument();
    expect(screen.getByText(es.attributes.sprint_speed)).toBeInTheDocument();
    expect(screen.getByText(es.attributes.acceleration)).toBeInTheDocument();
  });

  it("only shows the goalkeeper group for a GK position", () => {
    const { rerender } = render(<AttributeList position="DC" ratings={RATINGS} />);
    expect(screen.queryByText(es.profile.goalkeeper)).not.toBeInTheDocument();
    expect(screen.queryByText(es.attributes.gk_diving)).not.toBeInTheDocument();

    rerender(<AttributeList position="POR" ratings={RATINGS} />);
    expect(screen.getByText(es.profile.goalkeeper)).toBeInTheDocument();
    expect(screen.getByText(es.attributes.gk_diving)).toBeInTheDocument();
  });

  it("colors bars by threshold: <50 low, <65 mid, <75 good, else great", () => {
    const { container } = render(
      <AttributeList
        position="DC"
        ratings={[
          { attribute: "sprint_speed", value: 45, nRaters: 1 },
          { attribute: "acceleration", value: 60, nRaters: 1 },
          { attribute: "finishing", value: 70, nRaters: 1 },
          { attribute: "shot_power", value: 90, nRaters: 1 },
        ]}
      />,
    );

    const bars = container.querySelectorAll<HTMLDivElement>("[style*='width']");
    const colorOf = (value: number) =>
      Array.from(bars).find((b) => b.style.width === `${value}%`)?.className;

    expect(colorOf(45)).toContain("bg-stat-low");
    expect(colorOf(60)).toContain("bg-stat-mid");
    expect(colorOf(70)).toContain("bg-stat-good");
    expect(colorOf(90)).toContain("bg-stat-great");
  });

  it("skips an attribute with no rating row instead of crashing", () => {
    render(<AttributeList position="DC" ratings={[]} />);
    expect(screen.getByText(es.card.faceStats.pac)).toBeInTheDocument();
    expect(screen.queryByText(es.attributes.sprint_speed)).not.toBeInTheDocument();
  });
});
