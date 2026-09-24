// Pure helpers for the rankings page: validating the `?metric=` query param before it ever
// reaches get_group_leaderboard, formatting a metric's value, and splitting a leaderboard into
// its podium (top 3 *positions*, which can hold more than 3 players on a tie) and the rest. No I/O.

export const METRICS = [
  "ovr",
  "impacto",
  "goals",
  "assists",
  "mvps",
  "clean_sheets",
  "avg_rating",
  "matches",
] as const;

export type Metric = (typeof METRICS)[number];

/** Falls back to "ovr" for anything not one of the 8 known metrics -- the RPC's `p_metric` is a
 * plain `text` param, so this is the only thing standing between a raw query string and it. */
export function parseMetric(value: string | string[] | undefined | null): Metric {
  const candidate = Array.isArray(value) ? value[0] : value;
  return (METRICS as readonly string[]).includes(candidate ?? "") ? (candidate as Metric) : "ovr";
}

/** avg_rating shows one decimal; every other metric is a whole number. */
export function formatMetricValue(metric: Metric, value: number): string {
  return metric === "avg_rating" ? value.toFixed(1) : String(Math.round(value));
}

export interface LeaderboardRow {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  value: number;
  rank: number;
  matchesPlayed: number;
}

/** One podium position (1st/2nd/3rd place) -- a `rows` array, not a single row, because a tie
 * means more than one player can share the same rank. */
export interface PodiumPosition {
  rank: number;
  rows: LeaderboardRow[];
}

export interface LeaderboardSplit {
  /** Up to 3 distinct rank values <= 3, ascending (1st, 2nd, 3rd place -- each possibly tied). */
  positions: PodiumPosition[];
  /** Every row whose rank is > 3. */
  rest: LeaderboardRow[];
}

export function splitPodium(rows: LeaderboardRow[]): LeaderboardSplit {
  const byRank = new Map<number, LeaderboardRow[]>();
  const rest: LeaderboardRow[] = [];

  for (const row of rows) {
    if (row.rank > 3) {
      rest.push(row);
      continue;
    }
    byRank.set(row.rank, [...(byRank.get(row.rank) ?? []), row]);
  }

  const positions = [...byRank.entries()]
    .sort(([a], [b]) => a - b)
    .slice(0, 3)
    .map(([rank, groupRows]) => ({ rank, rows: groupRows }));

  return { positions, rest };
}
