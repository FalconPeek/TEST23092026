"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { ok, fail, type ActionResult } from "@/lib/actions/result";
import { mapDbError } from "@/lib/actions/errors";
import { NOTIFICATION_KINDS, type NotificationKind } from "@/lib/notifications/templates";
import type { Json } from "@/lib/supabase/database.types";

const uuid = z.uuid();

// --- getLeaderboard ---------------------------------------------------------------------------
// Matches public.get_group_leaderboard's p_metric check constraint (20260923211739_leaderboard_rpcs.sql).
const leaderboardMetricEnum = z.enum(["ovr", "impacto", "goals", "assists", "mvps", "clean_sheets", "avg_rating", "matches"]);
export type LeaderboardMetric = z.infer<typeof leaderboardMetricEnum>;

export interface LeaderboardRow {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  value: number;
  rank: number;
  matchesPlayed: number;
}

const getLeaderboardSchema = z.object({
  groupId: uuid,
  metric: leaderboardMetricEnum,
  limit: z.int().min(1).max(100).optional(),
});

/** Read-only, but exposed as an action (not just an RSC query) for client components -- e.g. a
 * metric switcher that re-fetches without a full page navigation. RSCs can keep calling the RPC
 * directly through their own session client instead, per the module doc comment in CLAUDE.md. */
export async function getLeaderboard(input: {
  groupId: string;
  metric: LeaderboardMetric;
  limit?: number;
}): Promise<ActionResult<LeaderboardRow[]>> {
  const parsed = getLeaderboardSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_group_leaderboard", {
    p_group_id: parsed.data.groupId,
    p_metric: parsed.data.metric,
    p_limit: parsed.data.limit,
  });
  if (error) return fail(mapDbError(error));

  return ok(
    (data ?? []).map((row) => ({
      playerId: row.player_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      value: row.value,
      rank: row.rank,
      matchesPlayed: row.matches_played,
    })),
  );
}

// --- markNotificationsRead --------------------------------------------------------------------

const markNotificationsReadSchema = z.object({ ids: z.array(uuid).optional() });

/** ids omitted (or undefined) marks every one of the caller's unread notifications as read, per
 * public.mark_notifications_read's own documented default. */
export async function markNotificationsRead(input: { ids?: string[] } = {}): Promise<ActionResult<{ count: number }>> {
  const parsed = markNotificationsReadSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_notifications_read", { p_ids: parsed.data.ids });
  if (error) return fail(mapDbError(error));

  return ok({ count: data ?? 0 });
}

// --- updateNotificationPrefs ------------------------------------------------------------------

const notificationPrefsSchema = z
  .record(z.string(), z.boolean())
  .refine((prefs) => Object.keys(prefs).every((key) => (NOTIFICATION_KINDS as readonly string[]).includes(key)), {
    message: "unknown notification kind",
  });

const updateNotificationPrefsSchema = z.object({ prefs: notificationPrefsSchema });

/** `prefs` is merged (only the keys sent are changed), matching public.update_notification_prefs'
 * own semantics -- callers send just the toggle(s) the user flipped, not the whole prefs object. */
export async function updateNotificationPrefs(input: { prefs: Partial<Record<NotificationKind, boolean>> }): Promise<ActionResult<void>> {
  const parsed = updateNotificationPrefsSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_notification_prefs", { p_prefs: parsed.data.prefs as unknown as Json });
  if (error) return fail(mapDbError(error));

  revalidatePath("/yo");
  return ok(undefined);
}

// --- savePushSubscription -----------------------------------------------------------------------

const savePushSubscriptionSchema = z.object({
  endpoint: z.string().trim().min(1),
  p256dh: z.string().trim().min(1),
  auth: z.string().trim().min(1),
  userAgent: z.string().trim().max(300).optional(),
});

export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = savePushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.p256dh,
    p_auth: parsed.data.auth,
    p_user_agent: parsed.data.userAgent,
  });
  if (error || !data) return fail(mapDbError(error));

  return ok({ id: data });
}

// --- deletePushSubscription ---------------------------------------------------------------------

const deletePushSubscriptionSchema = z.object({ endpoint: z.string().trim().min(1) });

/** Idempotent unsubscribe (deleting an endpoint that doesn't exist, or belongs to someone else in
 * a way the RPC itself forbids, both resolve without surfacing a confusing error to a user who
 * just wants push notifications off on this device -- see public.delete_push_subscription's own
 * doc comment for the "someone else's endpoint" case, which IS still mapped to an error here). */
export async function deletePushSubscription(input: { endpoint: string }): Promise<ActionResult<void>> {
  const parsed = deletePushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_push_subscription", { p_endpoint: parsed.data.endpoint });
  if (error) return fail(mapDbError(error));

  return ok(undefined);
}
