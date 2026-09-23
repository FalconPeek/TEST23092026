// RatingRepo: the only place lib/server/recompute.ts talks to Postgres. Keeping every query
// behind this interface is what lets recompute.ts stay a pure, synchronously-testable function
// over an in-memory fake (see recompute.test.ts) while createSupabaseRatingRepo below does the
// real I/O with the admin (service_role) client.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttributeKey } from "@/lib/rating";
import { GK_ATTRIBUTES, OUTFIELD_ATTRIBUTES } from "@/lib/rating";
import type { CollusionPair, RaterStat } from "@/lib/rating";
import { type GroupSettings, parseGroupSettings } from "@/lib/settings/group";
import type { Database } from "@/lib/supabase/database.types";

export type RaterRole = "player" | "spectator";
export type VoteMode = "quick" | "detailed";
export type HistoryReason = "scouting" | "match" | "manual";

export interface ScoutingVoteRecord {
  raterId: string;
  /** Sub-attribute key (detailed mode) or face-stat code (quick mode), as stored. */
  attribute: string;
  mode: VoteMode;
  value: number; // raw 1-10
  createdAt: Date;
  raterRole: RaterRole;
}

export interface GroupScoutingVote extends ScoutingVoteRecord {
  targetId: string;
}

export interface PlaystyleVoteRecord {
  raterId: string;
  code: string;
}

export interface TargetVotes {
  scouting: ScoutingVoteRecord[];
  playstyle: PlaystyleVoteRecord[];
  weakFootVotes: number[];
  skillMovesVotes: number[];
}

export interface PlayerInfo {
  id: string;
  groupId: string;
  primaryPosition: string | null;
}

export interface AttributeHistorySnapshot {
  snapshotAt: Date;
  attrs: Partial<Record<AttributeKey, number>>;
}

export interface PlayerRatingContext {
  /** Current attribute_ratings.value per attribute; {} if the player has never been rated. */
  previousAttributes: Partial<Record<AttributeKey, number>>;
  /** Current player_cards.ovr; undefined if no card exists yet. */
  previousOvr?: number;
  /** attribute_history rows with snapshot_at within the last 30 days, ascending by time. */
  history30d: AttributeHistorySnapshot[];
}

export interface AttributeSaveRow {
  attribute: AttributeKey;
  value: number;
  nVotes: number;
  nRaters: number;
}

export interface PlayerCardSave {
  position: string;
  ovr: number;
  ovrByPosition: Record<string, number>;
  tier: string;
  isProvisional: boolean;
  weakFoot: number;
  skillMoves: number;
  playStyles: { code: string; plus: boolean }[];
  faceStats: Record<string, number>;
}

export interface SavePlayerCardInput {
  playerId: string;
  groupId: string;
  attributes: AttributeSaveRow[];
  card: PlayerCardSave;
  nDistinctRaters: number;
  now: Date;
  /** Whether OVR or any attribute value changed since the previous snapshot (skip history insert if not). */
  changed: boolean;
  historyReason: HistoryReason;
}

export interface QueueEntry {
  playerId: string;
  groupId: string;
  reason: string;
}

export interface RatingRepo {
  loadGroupSettings(groupId: string): Promise<GroupSettings>;
  loadPlayer(playerId: string): Promise<PlayerInfo | null>;
  loadTargetVotes(groupId: string, targetId: string): Promise<TargetVotes>;
  /** All current (non-superseded) scouting votes for every target in the group. */
  loadGroupScoutingVotes(groupId: string): Promise<GroupScoutingVote[]>;
  /** Current attribute_ratings for every player in the group, keyed by player id. */
  loadGroupAttributeRatings(groupId: string): Promise<Map<string, Partial<Record<AttributeKey, number>>>>;
  loadRaterStats(groupId: string): Promise<Map<string, RaterStat>>;
  /** Set of collusionKey(raterId, targetId) strings currently flagged for the group. */
  loadCollusionFlags(groupId: string): Promise<Set<string>>;
  loadPlayerRatingContext(playerId: string, now: Date): Promise<PlayerRatingContext>;
  /** Stub until match_stats lands in M3 — always false for now. */
  wasMvpLastMatch(playerId: string): Promise<boolean>;

  saveRaterStats(groupId: string, stats: RaterStat[]): Promise<void>;
  replaceCollusionFlags(groupId: string, pairs: CollusionPair[]): Promise<void>;
  savePlayerCard(input: SavePlayerCardInput): Promise<void>;

  loadQueueBatch(limit: number): Promise<QueueEntry[]>;
  deleteFromQueue(playerIds: string[]): Promise<void>;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** attribute_history.attrs is untyped jsonb; keep only the numeric sub-attribute entries we know. */
function parseAttrsJson(json: unknown): Partial<Record<AttributeKey, number>> {
  const out: Partial<Record<AttributeKey, number>> = {};
  if (!isRecord(json)) return out;
  for (const key of [...OUTFIELD_ATTRIBUTES, ...GK_ATTRIBUTES]) {
    const v = json[key];
    if (typeof v === "number") out[key] = v;
  }
  return out;
}

/** Resolves each rater's role for weighting: group_members.role = spectator -> "spectator", else "player". Guests (no user_id) count as players. */
async function resolveRaterRoles(
  admin: SupabaseClient<Database>,
  groupId: string,
  raterPlayerIds: string[],
): Promise<Map<string, RaterRole>> {
  const roles = new Map<string, RaterRole>();
  const distinctIds = [...new Set(raterPlayerIds)];
  if (distinctIds.length === 0) return roles;

  const { data: players, error: playersError } = await admin
    .from("players")
    .select("id, user_id")
    .in("id", distinctIds);
  if (playersError) throw playersError;

  const userIds = (players ?? []).map((p) => p.user_id).filter((id): id is string => id !== null);
  const memberRoleByUser = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: members, error: membersError } = await admin
      .from("group_members")
      .select("user_id, role")
      .eq("group_id", groupId)
      .in("user_id", userIds);
    if (membersError) throw membersError;
    for (const m of members ?? []) memberRoleByUser.set(m.user_id, m.role);
  }

  for (const p of players ?? []) {
    const memberRole = p.user_id ? memberRoleByUser.get(p.user_id) : undefined;
    roles.set(p.id, memberRole === "spectator" ? "spectator" : "player");
  }
  return roles;
}

export function createSupabaseRatingRepo(admin: SupabaseClient<Database>): RatingRepo {
  return {
    async loadGroupSettings(groupId) {
      const { data, error } = await admin.from("groups").select("settings").eq("id", groupId).single();
      if (error) throw error;
      return parseGroupSettings(data.settings);
    },

    async loadPlayer(playerId) {
      const { data, error } = await admin
        .from("players")
        .select("id, group_id, primary_position")
        .eq("id", playerId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { id: data.id, groupId: data.group_id, primaryPosition: data.primary_position };
    },

    async loadTargetVotes(groupId, targetId) {
      const [scoutingRes, playstyleRes, starRes] = await Promise.all([
        admin
          .from("scouting_votes")
          .select("rater_player_id, attribute, mode, value, created_at")
          .eq("group_id", groupId)
          .eq("target_player_id", targetId)
          .is("superseded_at", null),
        admin.from("playstyle_votes").select("rater_player_id, playstyle").eq("target_player_id", targetId),
        admin.from("star_votes").select("rater_player_id, kind, value").eq("target_player_id", targetId),
      ]);
      if (scoutingRes.error) throw scoutingRes.error;
      if (playstyleRes.error) throw playstyleRes.error;
      if (starRes.error) throw starRes.error;

      const roles = await resolveRaterRoles(
        admin,
        groupId,
        (scoutingRes.data ?? []).map((v) => v.rater_player_id),
      );

      const scouting: ScoutingVoteRecord[] = (scoutingRes.data ?? []).map((v) => ({
        raterId: v.rater_player_id,
        attribute: v.attribute,
        mode: v.mode,
        value: v.value,
        createdAt: new Date(v.created_at),
        raterRole: roles.get(v.rater_player_id) ?? "player",
      }));
      const playstyle: PlaystyleVoteRecord[] = (playstyleRes.data ?? []).map((v) => ({
        raterId: v.rater_player_id,
        code: v.playstyle,
      }));
      const weakFootVotes = (starRes.data ?? []).filter((v) => v.kind === "weak_foot").map((v) => v.value);
      const skillMovesVotes = (starRes.data ?? []).filter((v) => v.kind === "skill_moves").map((v) => v.value);

      return { scouting, playstyle, weakFootVotes, skillMovesVotes };
    },

    async loadGroupScoutingVotes(groupId) {
      const { data, error } = await admin
        .from("scouting_votes")
        .select("rater_player_id, target_player_id, attribute, mode, value, created_at")
        .eq("group_id", groupId)
        .is("superseded_at", null);
      if (error) throw error;

      const roles = await resolveRaterRoles(
        admin,
        groupId,
        (data ?? []).map((v) => v.rater_player_id),
      );

      return (data ?? []).map((v) => ({
        raterId: v.rater_player_id,
        targetId: v.target_player_id,
        attribute: v.attribute,
        mode: v.mode,
        value: v.value,
        createdAt: new Date(v.created_at),
        raterRole: roles.get(v.rater_player_id) ?? "player",
      }));
    },

    async loadGroupAttributeRatings(groupId) {
      const { data: players, error: playersError } = await admin.from("players").select("id").eq("group_id", groupId);
      if (playersError) throw playersError;
      const ids = (players ?? []).map((p) => p.id);
      const result = new Map<string, Partial<Record<AttributeKey, number>>>();
      if (ids.length === 0) return result;

      const { data, error } = await admin.from("attribute_ratings").select("player_id, attribute, value").in("player_id", ids);
      if (error) throw error;
      for (const row of data ?? []) {
        const entry = result.get(row.player_id) ?? {};
        entry[row.attribute as AttributeKey] = row.value;
        result.set(row.player_id, entry);
      }
      return result;
    },

    async loadRaterStats(groupId) {
      const { data: players, error: playersError } = await admin.from("players").select("id").eq("group_id", groupId);
      if (playersError) throw playersError;
      const ids = (players ?? []).map((p) => p.id);
      const result = new Map<string, RaterStat>();
      if (ids.length === 0) return result;

      const { data, error } = await admin.from("rater_stats").select("*").in("player_id", ids);
      if (error) throw error;
      for (const row of data ?? []) {
        result.set(row.player_id, {
          raterId: row.player_id,
          bias: row.bias,
          rmse: row.rmse,
          reliability: row.reliability,
          nVotes: row.n_votes,
        });
      }
      return result;
    },

    async loadCollusionFlags(groupId) {
      const { data: players, error: playersError } = await admin.from("players").select("id").eq("group_id", groupId);
      if (playersError) throw playersError;
      const ids = (players ?? []).map((p) => p.id);
      const result = new Set<string>();
      if (ids.length === 0) return result;

      const { data, error } = await admin.from("collusion_flags").select("rater_player_id, target_player_id").in("rater_player_id", ids);
      if (error) throw error;
      for (const row of data ?? []) result.add(`${row.rater_player_id}|${row.target_player_id}`);
      return result;
    },

    async loadPlayerRatingContext(playerId, now) {
      const [ratingsRes, cardRes, historyRes] = await Promise.all([
        admin.from("attribute_ratings").select("attribute, value").eq("player_id", playerId),
        admin.from("player_cards").select("ovr").eq("player_id", playerId).maybeSingle(),
        admin
          .from("attribute_history")
          .select("snapshot_at, attrs")
          .eq("player_id", playerId)
          .gte("snapshot_at", new Date(now.getTime() - THIRTY_DAYS_MS).toISOString())
          .order("snapshot_at", { ascending: true }),
      ]);
      if (ratingsRes.error) throw ratingsRes.error;
      if (cardRes.error) throw cardRes.error;
      if (historyRes.error) throw historyRes.error;

      const previousAttributes: Partial<Record<AttributeKey, number>> = {};
      for (const row of ratingsRes.data ?? []) previousAttributes[row.attribute as AttributeKey] = row.value;

      const history30d: AttributeHistorySnapshot[] = (historyRes.data ?? []).map((row) => ({
        snapshotAt: new Date(row.snapshot_at),
        attrs: parseAttrsJson(row.attrs),
      }));

      return { previousAttributes, previousOvr: cardRes.data?.ovr, history30d };
    },

    async wasMvpLastMatch() {
      // match_stats arrives in M3; nothing to check yet.
      return false;
    },

    async saveRaterStats(_groupId, stats) {
      if (stats.length === 0) return;
      const rows = stats.map((s) => ({
        player_id: s.raterId,
        bias: s.bias,
        rmse: s.rmse,
        reliability: s.reliability,
        n_votes: s.nVotes,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await admin.from("rater_stats").upsert(rows, { onConflict: "player_id" });
      if (error) throw error;
    },

    async replaceCollusionFlags(groupId, pairs) {
      const { data: players, error: playersError } = await admin.from("players").select("id").eq("group_id", groupId);
      if (playersError) throw playersError;
      const ids = (players ?? []).map((p) => p.id);
      if (ids.length > 0) {
        const { error: deleteError } = await admin.from("collusion_flags").delete().in("rater_player_id", ids);
        if (deleteError) throw deleteError;
      }
      if (pairs.length === 0) return;
      const rows = pairs.map((p) => ({ rater_player_id: p.raterId, target_player_id: p.targetId, flagged_at: new Date().toISOString() }));
      const { error: insertError } = await admin.from("collusion_flags").insert(rows);
      if (insertError) throw insertError;
    },

    async savePlayerCard(input) {
      if (input.attributes.length > 0) {
        const rows = input.attributes.map((a) => ({
          player_id: input.playerId,
          attribute: a.attribute,
          value: a.value,
          n_votes: a.nVotes,
          n_raters: a.nRaters,
          updated_at: input.now.toISOString(),
        }));
        const { error } = await admin.from("attribute_ratings").upsert(rows, { onConflict: "player_id,attribute" });
        if (error) throw error;
      }

      const { error: cardError } = await admin.from("player_cards").upsert(
        {
          player_id: input.playerId,
          ovr: input.card.ovr,
          ovr_by_position: input.card.ovrByPosition,
          position: input.card.position,
          tier: input.card.tier as Database["public"]["Enums"]["card_tier"],
          is_provisional: input.card.isProvisional,
          weak_foot: input.card.weakFoot,
          skill_moves: input.card.skillMoves,
          playstyles: input.card.playStyles,
          face: input.card.faceStats,
          n_raters: input.nDistinctRaters,
          updated_at: input.now.toISOString(),
        },
        { onConflict: "player_id" },
      );
      if (cardError) throw cardError;

      if (input.changed) {
        const attrs: Record<string, number> = {};
        for (const a of input.attributes) attrs[a.attribute] = a.value;
        const { error: historyError } = await admin.from("attribute_history").insert({
          player_id: input.playerId,
          snapshot_at: input.now.toISOString(),
          ovr: input.card.ovr,
          attrs,
          reason: input.historyReason,
        });
        if (historyError) throw historyError;
      }

      const { error: dequeueError } = await admin.from("recompute_queue").delete().eq("player_id", input.playerId);
      if (dequeueError) throw dequeueError;
    },

    async loadQueueBatch(limit) {
      const { data, error } = await admin
        .from("recompute_queue")
        .select("player_id, reason, players(group_id)")
        .order("enqueued_at", { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? [])
        .filter((row): row is typeof row & { players: { group_id: string } } => row.players !== null)
        .map((row) => ({ playerId: row.player_id, groupId: row.players.group_id, reason: row.reason }));
    },

    async deleteFromQueue(playerIds) {
      if (playerIds.length === 0) return;
      const { error } = await admin.from("recompute_queue").delete().in("player_id", playerIds);
      if (error) throw error;
    },
  };
}
