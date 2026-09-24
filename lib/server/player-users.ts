// Shared by every best-effort notifier that needs to turn a list of player ids (badge awards, a
// match roster, a tournament entry's roster, ...) into auth user ids to notify.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** player_id -> user_id for players with a live auth account. Guests (players.user_id null) are
 * simply absent from the result, not an error -- callers filter with `.get(id)` returning
 * undefined and skip notifying them. */
export async function loadUserIdsByPlayer(admin: SupabaseClient<Database>, playerIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const distinctIds = [...new Set(playerIds)];
  if (distinctIds.length === 0) return result;
  const { data, error } = await admin.from("players").select("id, user_id").in("id", distinctIds);
  if (error) throw error;
  for (const row of data ?? []) {
    if (row.user_id) result.set(row.id, row.user_id);
  }
  return result;
}
