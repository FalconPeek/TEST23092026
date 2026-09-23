import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateLong,
  formatDateTime,
  formatDecimal,
  formatNumber,
  formatPercent,
  formatRelative,
  formatTime,
  toArgentinaIso,
} from "./format";
import { es } from "@/messages/es";

// Intl sometimes emits NBSP (U+00A0) or narrow-NBSP (U+202F) instead of a plain space.
function normalizeSpaces(s: string): string {
  return s.replace(/[  ]/g, " ");
}

describe("format helpers (es-AR / America/Argentina/Buenos_Aires)", () => {
  // 2026-09-24T01:30:00Z is 2026-09-23T22:30:00 in Buenos Aires (UTC-3).
  const instant = "2026-09-24T01:30:00Z";

  it("formatDate applies the Buenos Aires timezone", () => {
    expect(formatDate(instant)).toBe("23/9/2026");
  });

  it("formatDateLong applies the Buenos Aires timezone", () => {
    expect(normalizeSpaces(formatDateLong(instant))).toBe("miércoles, 23 de septiembre");
  });

  it("formatTime applies the Buenos Aires timezone (24h)", () => {
    expect(formatTime(instant)).toBe("22:30");
  });

  it("formatDateTime combines the long date and time", () => {
    expect(normalizeSpaces(formatDateTime(instant))).toBe("miércoles, 23 de septiembre, 22:30");
  });

  it("accepts a Date instance as well as an ISO string", () => {
    expect(formatDate(new Date(instant))).toBe(formatDate(instant));
  });

  it("throws RangeError on an invalid date string", () => {
    expect(() => formatDate("not-a-date")).toThrow(RangeError);
  });

  it("throws RangeError on an invalid Date instance", () => {
    expect(() => formatDate(new Date("not-a-date"))).toThrow(RangeError);
  });

  describe("formatRelative", () => {
    const now = new Date("2026-09-23T12:00:00Z");

    it("formats past minutes", () => {
      const d = new Date(now.getTime() - 5 * 60 * 1000);
      expect(formatRelative(d, now)).toBe("hace 5 minutos");
    });

    it("formats future minutes", () => {
      const d = new Date(now.getTime() + 5 * 60 * 1000);
      expect(formatRelative(d, now)).toBe("dentro de 5 minutos");
    });

    it("formats past hours", () => {
      const d = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      expect(formatRelative(d, now)).toBe("hace 3 horas");
    });

    it("formats yesterday", () => {
      const d = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      expect(formatRelative(d, now)).toBe("ayer");
    });

    it("formats tomorrow", () => {
      const d = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      expect(formatRelative(d, now)).toBe("mañana");
    });

    it("formats future days", () => {
      const d = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
      expect(formatRelative(d, now)).toBe("pasado mañana");
    });

    it("rounds sub-minute differences to the current minute", () => {
      const d = new Date(now.getTime() + 10 * 1000);
      expect(formatRelative(d, now)).toBe("este minuto");
    });
  });

  it("formatNumber groups with es-AR thousands separator", () => {
    expect(formatNumber(1234)).toBe("1.234");
  });

  it("formatNumber respects maxFractionDigits", () => {
    expect(normalizeSpaces(formatNumber(1234.5678, 2))).toBe("1.234,57");
  });

  it("formatDecimal pads/truncates to the requested digits with a comma", () => {
    expect(formatDecimal(7.5)).toBe("7,5");
    expect(formatDecimal(7)).toBe("7,0");
    expect(formatDecimal(7.456, 2)).toBe("7,46");
  });

  it("formatPercent renders a percent sign", () => {
    expect(normalizeSpaces(formatPercent(0.4))).toBe("40%");
  });

  describe("toArgentinaIso", () => {
    it("interprets a datetime-local value as Buenos Aires time (UTC-3)", () => {
      expect(toArgentinaIso("2026-10-01T20:00")).toBe("2026-10-01T23:00:00.000Z");
    });

    it("accepts a value that already includes seconds", () => {
      expect(toArgentinaIso("2026-10-01T20:00:15")).toBe("2026-10-01T23:00:15.000Z");
    });

    it("round-trips through formatDateTime back to the same wall-clock time", () => {
      const iso = toArgentinaIso("2026-10-01T20:00");
      expect(formatTime(iso)).toBe("20:00");
    });

    it("throws RangeError on a malformed value", () => {
      expect(() => toArgentinaIso("not-a-datetime")).toThrow(RangeError);
      expect(() => toArgentinaIso("2026-10-01")).toThrow(RangeError);
    });
  });
});

describe("messages/es.ts shape", () => {
  it("has exactly 15 position keys", () => {
    expect(Object.keys(es.positions)).toHaveLength(15);
  });

  it("has exactly 34 attribute keys", () => {
    expect(Object.keys(es.attributes)).toHaveLength(34);
  });
});
