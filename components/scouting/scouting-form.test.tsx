import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScoutingForm } from "./scouting-form";
import { es } from "@/messages/es";

afterEach(cleanup);

// jsdom doesn't implement ResizeObserver, which Radix Slider uses to measure its track.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const mockSubmitScoutingVotes = vi.fn();
const mockSubmitPlaystyleVotes = vi.fn();
const mockSubmitStarVotes = vi.fn();

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/actions/scouting", () => ({
  submitScoutingVotes: (...args: unknown[]) => mockSubmitScoutingVotes(...args),
  submitPlaystyleVotes: (...args: unknown[]) => mockSubmitPlaystyleVotes(...args),
  submitStarVotes: (...args: unknown[]) => mockSubmitStarVotes(...args),
}));

const BASE_PROPS = {
  groupId: "g1",
  targetPlayerId: "p1",
  targetName: "Juan",
  isGk: false,
  canVote: true,
  reason: "ok" as const,
  nextVoteAt: null,
  initialTab: "quick" as const,
  prefillQuickVotes: {},
  prefillDetailedVotes: {},
};

describe("ScoutingForm", () => {
  it("sends all 6 quick keys even when untouched", async () => {
    mockSubmitScoutingVotes.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    render(<ScoutingForm {...BASE_PROPS} />);

    await user.click(screen.getByRole("button", { name: es.scouting.save }));

    expect(mockSubmitScoutingVotes).toHaveBeenCalledWith({
      groupId: "g1",
      targetPlayerId: "p1",
      mode: "quick",
      votes: { pac: 5, sho: 5, pas: 5, dri: 5, def: 5, phy: 5 },
    });
  });

  it("sends only the touched key(s) in detailed mode", async () => {
    mockSubmitScoutingVotes.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    render(<ScoutingForm {...BASE_PROPS} initialTab="detailed" />);

    const label = screen.getByText(es.attributes.finishing);
    const wrapper = label.closest("div")!.parentElement!;
    within(wrapper).getByRole("slider").focus();
    await user.keyboard("{ArrowRight}");

    await user.click(screen.getByRole("button", { name: es.scouting.save }));

    expect(mockSubmitScoutingVotes).toHaveBeenCalledWith({
      groupId: "g1",
      targetPlayerId: "p1",
      mode: "detailed",
      votes: { finishing: 6 },
    });
  });

  it("hides GK attributes and GK playstyles for a non-GK target", () => {
    render(<ScoutingForm {...BASE_PROPS} initialTab="detailed" isGk={false} />);

    expect(screen.queryByText(es.attributes.gk_diving)).not.toBeInTheDocument();
    expect(screen.queryByText(es.profile.goalkeeper)).not.toBeInTheDocument();
    expect(screen.queryByText(es.playstyles.far_reach)).not.toBeInTheDocument();
  });

  it("shows GK attributes and GK playstyles for a GK target", () => {
    render(<ScoutingForm {...BASE_PROPS} initialTab="detailed" isGk={true} />);

    expect(screen.getByText(es.attributes.gk_diving)).toBeInTheDocument();
    expect(screen.getByText(es.profile.goalkeeper)).toBeInTheDocument();
    expect(screen.getByText(es.playstyles.far_reach)).toBeInTheDocument();
  });

  it("enforces a max of 5 selected playstyles", async () => {
    const user = userEvent.setup();
    render(<ScoutingForm {...BASE_PROPS} />);

    const codes = ["rapid", "flair", "technical", "trickster", "intercept", "block"] as const;
    for (const code of codes) {
      await user.click(screen.getByRole("button", { name: es.playstyles[code] }));
    }

    const pressed = codes.map((code) => screen.getByRole("button", { name: es.playstyles[code] }));
    expect(pressed.filter((btn) => btn.getAttribute("aria-pressed") === "true")).toHaveLength(5);
    expect(screen.getByRole("button", { name: es.playstyles.block })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows the disabled reason and disables the vote button when canVote is false", () => {
    render(<ScoutingForm {...BASE_PROPS} canVote={false} reason="no_shared_match" />);

    expect(screen.getByText(es.scouting.reasons.no_shared_match)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: es.scouting.save })).toBeDisabled();
  });

  it("shows the formatted cooldown date when the reason is cooldown", () => {
    render(
      <ScoutingForm {...BASE_PROPS} canVote={false} reason="cooldown" nextVoteAt="2026-12-01T00:00:00.000Z" />,
    );

    expect(screen.getByText(es.scouting.reasons.cooldown("2026-12-01T00:00:00.000Z"))).toBeInTheDocument();
  });
});
