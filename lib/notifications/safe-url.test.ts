import { describe, expect, it } from "vitest";
import { safeInternalUrl } from "./safe-url";

describe("safeInternalUrl", () => {
  it("accepts a plain relative path", () => {
    expect(safeInternalUrl("/g/1/partidos/2")).toBe("/g/1/partidos/2");
  });

  it("keeps the query string and hash", () => {
    expect(safeInternalUrl("/yo?group=1#top")).toBe("/yo?group=1#top");
  });

  it("rejects a protocol-relative url", () => {
    expect(safeInternalUrl("//evil.com")).toBeNull();
    expect(safeInternalUrl("//evil.com/path")).toBeNull();
  });

  it("rejects an absolute url", () => {
    expect(safeInternalUrl("https://evil.com")).toBeNull();
    expect(safeInternalUrl("http://evil.com/g/1")).toBeNull();
  });

  it("rejects a javascript: url", () => {
    expect(safeInternalUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects a path with control characters or backslashes that could normalize off-origin", () => {
    expect(safeInternalUrl("/\\evil.com")).toBeNull();
    expect(safeInternalUrl("/\t/evil.com")).toBeNull();
  });

  it("rejects null, undefined and empty string", () => {
    expect(safeInternalUrl(null)).toBeNull();
    expect(safeInternalUrl(undefined)).toBeNull();
    expect(safeInternalUrl("")).toBeNull();
  });

  it("rejects a path that doesn't start with a slash", () => {
    expect(safeInternalUrl("g/1/partidos/2")).toBeNull();
  });
});
