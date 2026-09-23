import { describe, expect, it } from "vitest";
import { safeNextPath } from "./env";

describe("safeNextPath", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNextPath("/g/abc?tab=1")).toBe("/g/abc?tab=1");
  });
  it.each([null, undefined, "", "https://evil.com", "//evil.com", "/\\evil.com", "g/abc"])(
    "falls back to / for %s",
    (value) => {
      expect(safeNextPath(value)).toBe("/");
    },
  );
});
