// Small numeric helpers shared by aggregate.ts and form.ts. Kept dependency-free and pure.

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Median absolute deviation from the median. */
export function mad(values: number[]): number {
  if (values.length === 0) return 0;
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

export function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/** Weighted median: smallest value where cumulative weight reaches half the total weight. */
export function weightedMedian(entries: { value: number; weight: number }[]): number {
  const positive = entries.filter((e) => e.weight > 0);
  if (positive.length === 0) return 0;
  const sorted = [...positive].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((a, b) => a + b.weight, 0);
  let cumulative = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    cumulative += sorted[i].weight;
    if (cumulative * 2 >= total) {
      // Average with the next entry when we land exactly on the halfway point (even split).
      if (cumulative * 2 === total && i + 1 < sorted.length) {
        return (sorted[i].value + sorted[i + 1].value) / 2;
      }
      return sorted[i].value;
    }
  }
  return sorted[sorted.length - 1].value;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/** Exponential recency decay: 0.5^(age_days / halfLifeDays). */
export function recencyWeight(ageDays: number, halfLifeDays: number): number {
  return Math.pow(0.5, ageDays / halfLifeDays);
}
