import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ClubCrest } from "./club-crest";

afterEach(cleanup);

describe("ClubCrest", () => {
  it("renders the crest image when a url is given", () => {
    render(
      <ClubCrest
        crestUrl="https://storage.example/club-crests/g1/c1.png?v=1"
        primaryColor="#112233"
        secondaryColor="#ffffff"
        shortName="RIV"
        name="River"
      />,
    );

    const img = screen.getByRole("img", { name: "River" });
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute("src", "https://storage.example/club-crests/g1/c1.png?v=1");
  });

  it("renders a colored shield fallback with the short name when there's no crest", () => {
    render(
      <ClubCrest crestUrl={null} primaryColor="#112233" secondaryColor="#ffffff" shortName="RIV" name="River" />,
    );

    const shield = screen.getByRole("img", { name: "River" });
    expect(shield.tagName).toBe("DIV");
    expect(shield).toHaveStyle({ backgroundColor: "#112233", color: "#ffffff" });
    expect(screen.getByText("RIV")).toBeInTheDocument();
  });
});
