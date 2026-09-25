// Zod schema for get_my_dashboard's jsonb result (supabase/migrations/20260923211743_dashboard_rpcs.sql).
// It's a hand-built jsonb object, not a typed table row, so we never trust its shape at the
// boundary. Every collection/scalar field uses `.catch(<empty default>)` (not just `.default()`,
// so a field that's present but the WRONG type is also caught, not just a missing key) --
// matching the RPC's own "every field defaults to an empty array/null" contract on the client
// side too. `player_id` is the one required field: if it's missing or malformed the whole
// response is unusable (something is fundamentally broken), so parsing rejects entirely rather
// than fabricating a fake id.

import { z } from "zod";

const ovrPointSchema = z.object({
  snapshot_at: z.string(),
  ovr: z.number(),
});

const recentMatchSchema = z.object({
  match_id: z.string(),
  played_at: z.string().nullable().catch(null),
  goals: z.number().catch(0),
  assists: z.number().catch(0),
  own_goals: z.number().catch(0),
  saves: z.number().catch(0),
  clean_sheet: z.boolean().catch(false),
  is_mvp: z.boolean().catch(false),
  median_rating: z.number().nullable().catch(null),
});

const totalsSchema = z
  .object({
    matches_played: z.number().catch(0),
    goals: z.number().catch(0),
    assists: z.number().catch(0),
    own_goals: z.number().catch(0),
    saves: z.number().catch(0),
    clean_sheets: z.number().catch(0),
    mvps: z.number().catch(0),
  })
  .catch({ matches_played: 0, goals: 0, assists: 0, own_goals: 0, saves: 0, clean_sheets: 0, mvps: 0 });

const badgeSchema = z.object({
  badge_code: z.string(),
  awarded_at: z.string(),
  count: z.number().catch(1),
});

export const dashboardSchema = z.object({
  player_id: z.uuid(),
  ovr_history: z.array(ovrPointSchema).catch([]),
  recent_matches: z.array(recentMatchSchema).catch([]),
  totals: totalsSchema,
  impacto: z.number().nullable().catch(null),
  // player_cards row minus player_id: lib/cards/to-card-props.ts's toCardProps does its own
  // defensive parsing (safeParse per field, returns null on any mismatch), so this only needs to
  // survive being handed something that isn't even an object.
  card: z.unknown().nullable().catch(null),
  badges: z.array(badgeSchema).catch([]),
});

export type Dashboard = z.infer<typeof dashboardSchema>;

/** Returns null if `raw` isn't a usable dashboard payload at all (missing/invalid player_id). */
export function parseDashboard(raw: unknown): Dashboard | null {
  const result = dashboardSchema.safeParse(raw);
  return result.success ? result.data : null;
}
