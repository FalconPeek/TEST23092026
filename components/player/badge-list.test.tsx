import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BadgeList, type EarnedBadge } from "./badge-list";
import { es } from "@/messages/es";

afterEach(cleanup);

describe("BadgeList", () => {
  it("shows the empty state when no badges were earned", () => {
    render(<BadgeList badges={[]} />);
    expect(screen.getByText(es.badges.none)).toBeInTheDocument();
  });

  it("shows the badge name and description", () => {
    const badges: EarnedBadge[] = [{ code: "mvp", icon: "star", count: 1 }];
    render(<BadgeList badges={badges} />);

    expect(screen.getByText(es.badges.mvp.name)).toBeInTheDocument();
    expect(screen.getByText(es.badges.mvp.description)).toBeInTheDocument();
  });

  it("shows a ×n count for a repeatable badge earned more than once", () => {
    const badges: EarnedBadge[] = [{ code: "mvp", icon: "star", count: 5 }];
    render(<BadgeList badges={badges} />);
    expect(screen.getByText(es.badges.count(5))).toBeInTheDocument();
  });

  it("hides the count for a badge earned only once", () => {
    const badges: EarnedBadge[] = [{ code: "first_match", icon: "whistle", count: 1 }];
    render(<BadgeList badges={badges} />);
    expect(screen.queryByText(es.badges.count(1))).not.toBeInTheDocument();
  });

  it("falls back to a generic icon for an unrecognized icon name", () => {
    const badges: EarnedBadge[] = [{ code: "mvp", icon: "some-unknown-icon", count: 1 }];
    const { container } = render(<BadgeList badges={badges} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
