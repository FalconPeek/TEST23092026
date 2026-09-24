// Notification dispatcher: inserts notifications rows (honoring per-kind prefs) and best-effort
// fans out web push. Pure orchestration over NotificationsRepo (see lib/server/notifications-repo.ts)
// so it's synchronously testable against an in-memory fake (notifications.test.ts), mirroring
// lib/server/badges.ts / lib/server/tournaments.ts.
import "server-only";
import type { NotificationKind, NotificationPayload } from "@/lib/notifications/templates";
import type { NotificationsRepo } from "./notifications-repo";

export interface NotifyInput {
  /** auth.users ids (NOT player ids) -- resolved by the caller, e.g. from players.user_id,
   * filtering out guests (user_id null) before calling notify. Deduplicated internally. */
  userIds: string[];
  groupId: string | null;
  kind: NotificationKind;
  payload: NotificationPayload;
}

/** Absent key in notification_prefs = enabled (see profiles.notification_prefs' doc comment in
 * 20260923211711_notifications_tables.sql); only an explicit `false` opts a user out. */
function isEnabled(prefs: Record<string, boolean> | undefined, kind: NotificationKind): boolean {
  return prefs?.[kind] !== false;
}

/**
 * Inserts one notifications row per opted-in user and best-effort sends web push to each of their
 * subscriptions. A single subscription's send failure (dead endpoint, network error, VAPID unset)
 * never throws out of notify() and never blocks another user/subscription -- this always runs
 * after the thing it's notifying about already durably succeeded (a finalized match, an awarded
 * badge, ...), so it must not be able to undo that by throwing.
 */
export async function notify(repo: NotificationsRepo, input: NotifyInput): Promise<void> {
  const distinctUserIds = [...new Set(input.userIds)];
  if (distinctUserIds.length === 0) return;

  const prefs = await repo.loadNotificationPrefs(distinctUserIds);
  const enabledUserIds = distinctUserIds.filter((userId) => isEnabled(prefs.get(userId), input.kind));
  if (enabledUserIds.length === 0) return;

  await repo.insertNotifications(
    enabledUserIds.map((userId) => ({ userId, groupId: input.groupId, kind: input.kind, payload: input.payload })),
  );

  const subscriptionsByUser = await repo.loadPushSubscriptions(enabledUserIds);
  for (const userId of enabledUserIds) {
    for (const subscription of subscriptionsByUser.get(userId) ?? []) {
      let result;
      try {
        result = await repo.sendPush(subscription, input.payload);
      } catch {
        continue; // best-effort: a transport throwing (vs. returning ok:false) is still not fatal
      }
      if (result.ok) {
        await repo.touchPushSubscription(subscription.id).catch(() => undefined);
      } else if (result.expired) {
        await repo.deletePushSubscription(subscription.id).catch(() => undefined);
      }
    }
  }
}
