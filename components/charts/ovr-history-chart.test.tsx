import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OvrHistoryChart } from "./ovr-history-chart";
import { es } from "@/messages/es";

afterEach(cleanup);

describe("OvrHistoryChart", () => {
  it("shows the empty state with zero points", () => {
    render(<OvrHistoryChart points={[]} />);
    expect(screen.getByText(es.dashboard.noHistory)).toBeInTheDocument();
  });

  it("shows the empty state with only one point (nothing to draw a line between)", () => {
    render(<OvrHistoryChart points={[{ snapshotAt: "2026-01-01T00:00:00Z", ovr: 65 }]} />);
    expect(screen.getByText(es.dashboard.noHistory)).toBeInTheDocument();
  });

  it("renders the chart (not the empty state) with 2 or more points", () => {
    render(
      <OvrHistoryChart
        points={[
          { snapshotAt: "2026-01-01T00:00:00Z", ovr: 60 },
          { snapshotAt: "2026-02-01T00:00:00Z", ovr: 65 },
        ]}
      />,
    );
    expect(screen.queryByText(es.dashboard.noHistory)).not.toBeInTheDocument();
  });
});
