import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL only auto-cleans when vitest globals are on; we keep globals off, so unmount explicitly.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement these; Radix Slider (ResizeObserver, to measure its track) and Radix
// Select/RadioGroup (pointer capture) need them for their interactions to work in tests.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};
