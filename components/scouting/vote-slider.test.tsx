import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VoteSlider } from "./vote-slider";
import { es } from "@/messages/es";

afterEach(cleanup);

describe("VoteSlider", () => {
  it("shows the unset label until touched", () => {
    render(<VoteSlider label="Definición" value={undefined} onChange={vi.fn()} />);
    expect(screen.getByText(es.scouting.unset)).toBeInTheDocument();
  });

  it("shows the numeric value once set", () => {
    render(<VoteSlider label="Definición" value={7} onChange={vi.fn()} />);
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.queryByText(es.scouting.unset)).not.toBeInTheDocument();
  });

  it("calls onChange when the slider thumb is moved via keyboard", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<VoteSlider label="Definición" value={undefined} onChange={onChange} />);

    screen.getByRole("slider").focus();
    await user.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenCalled();
  });

  it("marks the slider disabled when disabled is true", () => {
    const { container } = render(<VoteSlider label="Definición" value={5} onChange={vi.fn()} disabled />);
    expect(container.querySelector('[data-slot="slider"]')).toHaveAttribute("data-disabled");
  });
});
