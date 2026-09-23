export const LOCALE = "es-AR";
export const TIME_ZONE = "America/Argentina/Buenos_Aires";

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "numeric",
  year: "numeric",
});

const dateLongFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const integerFormat = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 0,
});

const percentFormat = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  maximumFractionDigits: 0,
});

const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

function toDate(d: Date | string): Date {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid date: ${String(d)}`);
  }
  return date;
}

export function formatDate(d: Date | string): string {
  return dateFormat.format(toDate(d));
}

export function formatDateLong(d: Date | string): string {
  return dateLongFormat.format(toDate(d));
}

export function formatTime(d: Date | string): string {
  return timeFormat.format(toDate(d));
}

export function formatDateTime(d: Date | string): string {
  const date = toDate(d);
  return `${formatDateLong(date)}, ${formatTime(date)}`;
}

const RELATIVE_UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: "year", ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: "month", ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: "week", ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: "day", ms: 24 * 60 * 60 * 1000 },
  { unit: "hour", ms: 60 * 60 * 1000 },
  { unit: "minute", ms: 60 * 1000 },
];

export function formatRelative(d: Date | string, now: Date = new Date()): string {
  const date = toDate(d);
  const diffMs = date.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);

  for (const { unit, ms } of RELATIVE_UNITS) {
    if (absMs >= ms) {
      const value = Math.round(diffMs / ms);
      return relativeFormat.format(value, unit);
    }
  }

  // Under a minute: still expressed in minutes (rounds to 0 → "este minuto").
  return relativeFormat.format(0, "minute");
}

export function formatNumber(n: number, maxFractionDigits = 0): string {
  const format =
    maxFractionDigits === 0
      ? integerFormat
      : new Intl.NumberFormat(LOCALE, { maximumFractionDigits: maxFractionDigits });
  return format.format(n);
}

export function formatDecimal(n: number, digits = 1): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatPercent(ratio: number): string {
  return percentFormat.format(ratio);
}
