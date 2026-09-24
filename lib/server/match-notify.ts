// Best-effort match lifecycle notifications called directly from lib/actions/matches.ts (a Server
// Action, session-client only) right after its RPC succeeds -- mirrors
// lib/server/tournament-generated.ts's shape: each function makes its own admin client (writes to
// notifications/push_subscriptions only grant DML to service_role) and never throws.
import "server-only";
import { matchScheduledPayload, ratingPendingPayload, reportPendingPayload } from "@/lib/notifications/templates";
import { notify } from "@/lib/server/notifications";
import { createSupabaseNotificationsRepo } from "@/lib/server/notifications-repo";
import { loadUserIdsByPlayer } from "@/lib/server/player-users";
import { createAdminClient } from "@/lib/supabase/admin";

/** Notifies every current member of the group (not just team players -- there's no lineup yet at
 * creation time, and spectators are just as entitled to know a match got scheduled). */
export async function notifyMatchScheduledBestEffort(matchId: string, groupId: string, scheduledAt: Date): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: groupRow, error: groupError } = await admin.from("groups").select("name").eq("id", groupId).maybeSingle();
    if (groupError) throw groupError;
    if (!groupRow) return;

    const { data: memberRows, error: membersError } = await admin.from("group_members").select("user_id").eq("group_id", groupId);
    if (membersError) throw membersError;
    const userIds = (memberRows ?? []).map((m) => m.user_id);
    if (userIds.length === 0) return;

    const notificationsRepo = createSupabaseNotificationsRepo(admin);
    await notify(notificationsRepo, {
      userIds,
      groupId,
      kind: "match_scheduled",
      payload: matchScheduledPayload({ groupName: groupRow.name, scheduledAt, url: `/g/${groupId}/partidos/${matchId}` }),
    });
  } catch {
    // best-effort -- see doc comment above.
  }
}

/** Notifies every roster entry (players + spectators, per match_participants -- everyone who can
 * submit a stat report or a match rating) that the report/rating windows just opened. Two separate
 * notification kinds (both windows open at once, see CLAUDE.md's "Match flow" section), so a user
 * who disabled one but not the other still gets exactly the one they want. */
export async function notifyReportingStartedBestEffort(matchId: string, groupId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: participantRows, error } = await admin.from("match_participants").select("player_id").eq("match_id", matchId);
    if (error) throw error;
    const playerIds = (participantRows ?? []).map((p) => p.player_id);
    if (playerIds.length === 0) return;

    const userIdByPlayer = await loadUserIdsByPlayer(admin, playerIds);
    const userIds = [...new Set(playerIds.map((id) => userIdByPlayer.get(id)).filter((id): id is string => id !== undefined))];
    if (userIds.length === 0) return;

    const notificationsRepo = createSupabaseNotificationsRepo(admin);
    const url = `/g/${groupId}/partidos/${matchId}`;
    await notify(notificationsRepo, { userIds, groupId, kind: "report_pending", payload: reportPendingPayload({ url }) });
    await notify(notificationsRepo, { userIds, groupId, kind: "rating_pending", payload: ratingPendingPayload({ url }) });
  } catch {
    // best-effort -- see doc comment above.
  }
}
