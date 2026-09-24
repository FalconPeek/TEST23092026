import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RatingForm, type RatingFormPlayer } from "./rating-form";
import { es } from "@/messages/es";

afterEach(cleanup);

const mockSubmitMatchRatings = vi.fn();

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/actions/matches", () => ({
  submitMatchRatings: (...args: unknown[]) => mockSubmitMatchRatings(...args),
}));

// The page never includes the rater themselves in this list -- excluding "self" is the
// page's job (it simply never passes the rater's own player through), exercised here by a
// roster that only ever contains teammates.
const TEAMMATES: RatingFormPlayer[] = [
  { id: "p1", displayName: "Juan", avatarUrl: null, isGk: false },
  { id: "p2", displayName: "Pedro", avatarUrl: null, isGk: false },
];

function rowFor(name: string): HTMLElement {
  return screen.getByText(name).closest("div")!.parentElement!;
}

describe("RatingForm", () => {
  it("disables submit until every listed player is rated", async () => {
    const user = userEvent.setup();
    render(<RatingForm groupId="g1" matchId="m1" players={TEAMMATES} prefill={{}} />);

    expect(screen.getByRole("button", { name: es.match.saveRatings })).toBeDisabled();

    await user.click(within(rowFor("Juan")).getByRole("button", { name: "8" }));
    expect(screen.getByRole("button", { name: es.match.saveRatings })).toBeDisabled();

    await user.click(within(rowFor("Pedro")).getByRole("button", { name: "6" }));
    expect(screen.getByRole("button", { name: es.match.saveRatings })).not.toBeDisabled();
  });

  it("submits ratings for every player once all are rated", async () => {
    mockSubmitMatchRatings.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    render(<RatingForm groupId="g1" matchId="m1" players={TEAMMATES} prefill={{}} />);

    await user.click(within(rowFor("Juan")).getByRole("button", { name: "8" }));
    await user.click(within(rowFor("Pedro")).getByRole("button", { name: "6" }));
    await user.click(screen.getByRole("button", { name: es.match.saveRatings }));

    expect(mockSubmitMatchRatings).toHaveBeenCalledWith({
      groupId: "g1",
      matchId: "m1",
      ratings: [
        { targetPlayerId: "p1", rating: 8, standoutAttributes: [] },
        { targetPlayerId: "p2", rating: 6, standoutAttributes: [] },
      ],
    });
  });

  it("enforces a max of 2 standout attributes per player", async () => {
    const user = userEvent.setup();
    render(<RatingForm groupId="g1" matchId="m1" players={TEAMMATES} prefill={{}} />);

    const juanRow = rowFor("Juan");
    const search = within(juanRow).getByPlaceholderText(es.match.standout);
    await user.type(search, es.attributes.finishing);
    await user.click(within(juanRow).getByRole("button", { name: es.attributes.finishing }));

    await user.clear(search);
    await user.type(search, es.attributes.vision);
    await user.click(within(juanRow).getByRole("button", { name: es.attributes.vision }));

    await user.clear(search);
    await user.type(search, es.attributes.dribbling);
    expect(within(juanRow).getByRole("button", { name: es.attributes.dribbling })).toBeDisabled();

    // both previously-picked ones show as removable chips
    expect(within(juanRow).getByText(new RegExp(es.attributes.finishing))).toBeInTheDocument();
    expect(within(juanRow).getByText(new RegExp(es.attributes.vision))).toBeInTheDocument();
  });

  it("renders the standout search input at >=44px (T-021 tap-target regression)", () => {
    render(<RatingForm groupId="g1" matchId="m1" players={TEAMMATES} prefill={{}} />);

    const search = within(rowFor("Juan")).getByPlaceholderText(es.match.standout);
    expect(search.className).toContain("h-11");
  });

  it("renders every rating button at >=44px (h-11)", () => {
    render(<RatingForm groupId="g1" matchId="m1" players={TEAMMATES} prefill={{}} />);

    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(within(rowFor("Juan")).getByRole("button", { name: String(n) }).className).toContain("h-11");
    }
  });

  it("renders standout chips (picked and pickable) at >=44px (min-h-11, T-022 regression)", async () => {
    const user = userEvent.setup();
    render(
      <RatingForm
        groupId="g1"
        matchId="m1"
        players={TEAMMATES}
        prefill={{ p1: { rating: 9, standoutAttributes: ["finishing"] } }}
      />,
    );

    const juanRow = rowFor("Juan");
    expect(within(juanRow).getByText(new RegExp(es.attributes.finishing)).className).toContain("min-h-11");

    await user.type(within(juanRow).getByPlaceholderText(es.match.standout), es.attributes.vision);
    expect(within(juanRow).getByRole("button", { name: es.attributes.vision }).className).toContain("min-h-11");
  });

  it("renders the save-ratings submit button at >=44px (h-11, T-022 regression)", () => {
    render(<RatingForm groupId="g1" matchId="m1" players={TEAMMATES} prefill={{}} />);

    expect(screen.getByRole("button", { name: es.match.saveRatings }).className).toContain("h-11");
  });

  it("prefills a previous rating and standout attributes", () => {
    render(
      <RatingForm
        groupId="g1"
        matchId="m1"
        players={TEAMMATES}
        prefill={{ p1: { rating: 9, standoutAttributes: ["finishing"] } }}
      />,
    );

    expect(within(rowFor("Juan")).getByRole("button", { name: "9" })).toHaveAttribute("aria-pressed", "true");
    expect(within(rowFor("Juan")).getByText(new RegExp(es.attributes.finishing))).toBeInTheDocument();
  });
});
