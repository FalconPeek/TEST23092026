import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BottomNav } from "./bottom-nav";
import { es } from "@/messages/es";

afterEach(cleanup);

const mockUsePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

describe("BottomNav", () => {
  it("marks the home item active on the group home route", () => {
    mockUsePathname.mockReturnValue("/g/group-1");
    render(<BottomNav groupId="group-1" />);

    expect(screen.getByRole("link", { name: new RegExp(es.nav.home) })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: new RegExp(es.nav.matches) })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marks the matches item active on a nested matches route", () => {
    mockUsePathname.mockReturnValue("/g/group-1/partidos/match-1");
    render(<BottomNav groupId="group-1" />);

    expect(screen.getByRole("link", { name: new RegExp(es.nav.matches) })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: new RegExp(es.nav.home) })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
