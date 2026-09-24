// NotificationsRepo: the only place lib/server/notifications.ts talks to Postgres/web push,
// mirroring the FinalizeRepo/BadgesRepo split. notifications + the notification_prefs column only
// grant DML to service_role (see 20260923211711_notifications_tables.sql /
// 20260923211723_push_subscriptions_tables.sql), so this is always built with the admin client.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationPayload } from "@/lib/notifications/templates";
import { type PushSendResult, sendPush } from "./push";
import type { Database, Json } from "@/lib/supabase/database.types";

export interface NotificationInsert {
  userId: string;
  groupId: string | null;
  kind: string;
  payload: NotificationPayload;
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface NotificationsRepo {
  /** Per-kind prefs (missing key = enabled, per profiles.notification_prefs' documented
   * convention -- see 20260923211711_notifications_tables.sql). Users with no profiles row at all
   * (shouldn't happen, but defensively) are simply absent from the map, treated as "everything on". */
  loadNotificationPrefs(userIds: string[]): Promise<Map<string, Record<string, boolean>>>;
  insertNotifications(rows: NotificationInsert[]): Promise<void>;
  loadPushSubscriptions(userIds: string[]): Promise<Map<string, PushSubscriptionRow[]>>;
  sendPush(subscription: PushSubscriptionRow, payload: NotificationPayload): Promise<PushSendResult>;
  touchPushSubscription(id: string): Promise<void>;
  deletePushSubscription(id: string): Promise<void>;
}

function isPrefsRecord(value: unknown): value is Record<string, boolean> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createSupabaseNotificationsRepo(admin: SupabaseClient<Database>): NotificationsRepo {
  return {
    async loadNotificationPrefs(userIds) {
      const result = new Map<string, Record<string, boolean>>();
      if (userIds.length === 0) return result;
      const { data, error } = await admin.from("profiles").select("id, notification_prefs").in("id", userIds);
      if (error) throw error;
      for (const row of data ?? []) {
        result.set(row.id, isPrefsRecord(row.notification_prefs) ? (row.notification_prefs as Record<string, boolean>) : {});
      }
      return result;
    },

    async insertNotifications(rows) {
      if (rows.length === 0) return;
      const { error } = await admin.from("notifications").insert(
        rows.map((r) => ({
          user_id: r.userId,
          group_id: r.groupId,
          kind: r.kind,
          payload: r.payload as unknown as Json,
        })),
      );
      if (error) throw error;
    },

    async loadPushSubscriptions(userIds) {
      const result = new Map<string, PushSubscriptionRow[]>();
      if (userIds.length === 0) return result;
      const { data, error } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds);
      if (error) throw error;
      for (const row of data ?? []) {
        const list = result.get(row.user_id) ?? [];
        list.push({ id: row.id, endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth });
        result.set(row.user_id, list);
      }
      return result;
    },

    async sendPush(subscription, payload) {
      return sendPush(subscription, payload);
    },

    async touchPushSubscription(id) {
      const { error } = await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },

    async deletePushSubscription(id) {
      const { error } = await admin.from("push_subscriptions").delete().eq("id", id);
      if (error) throw error;
    },
  };
}
