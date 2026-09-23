// TournamentRepo: the only place lib/server/tournaments.ts talks to Postgres, mirroring the
// FinalizeRepo/finalize-repo.ts split (see lib/server/finalize-repo.ts) so the orchestration in
// tournaments.ts stays pure and synchronously testable against an in-memory fake
// (tournaments.test.ts) while createSupabaseTournamentRepo below does the real I/O.
//
// Read methods accept either the admin (service_role) client or a per-request session client
// (RLS applies) -- standings and bracket views are read through RLS from RSCs, while the
// finalizer's advancement hook and the dbint test use the admin client. Every write goes through
// a SECURITY DEFINER RPC (persist_bracket / save_tournament_entries / append_swiss_round /
// seed_knockout_from_groups), which re-checks admin/service_role authorization itself -- this repo
// never bypasses that.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type Entry,
  type Group,
  type Match,
  type QualifierRef,
  type Stage,
  type StageKind,
  type TournamentState,
} from "@/lib/brackets";
import { parseTournamentSettings, type TournamentSettings } from "@/lib/settings/tournament";
import type { Database, Json } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;
type TournamentStatus = Database["public"]["Enums"]["tournament_status"];
type TournamentFormatEnum = Database["public"]["Enums"]["tournament_format"];
type TournamentEntryMode = Database["public"]["Enums"]["tournament_entry_mode"];

export interface TournamentRow {
  id: string;
  groupId: string;
  name: string;
  format: TournamentFormatEnum;
  entryMode: TournamentEntryMode;
  teamSize: number;
  status: TournamentStatus;
  settings: TournamentSettings;
  organizerId: string;
}

export interface EntryRow {
  id: string;
  name: string;
  seed: number | null;
  playerIds: string[];
}

export interface BalanceInput {
  id: string;
  mu: number;
  ovr: number;
  isGk: boolean;
}

export interface NewEntry {
  name: string;
  seed: number | null;
  playerIds: string[];
}

export interface GroupQualifiers {
  group: string;
  /** Ranked best (index 0) to worst; null = vacant slot (resolves to a BYE). */
  entries: (string | null)[];
}

export interface TournamentRepo {
  loadTournament(tournamentId: string): Promise<TournamentRow | null>;
  loadEntries(tournamentId: string): Promise<EntryRow[]>;
  /** Registered player ids (individual entry_mode only). */
  loadRegistrations(tournamentId: string): Promise<string[]>;
  /** player_cards.ovr per player id; missing rows simply have no entry (caller defaults to 60). */
  loadPlayerOvrs(playerIds: string[]): Promise<Map<string, number>>;
  /** OpenSkill mu / OVR / goalkeeper flag per player id, for balanceTeams. */
  loadBalanceInputs(playerIds: string[]): Promise<Map<string, BalanceInput>>;
  /** True once a bracket has been persisted (stages exist) -- generation happens exactly once. */
  hasBracket(tournamentId: string): Promise<boolean>;
  /** Rebuilds the engine TournamentState from stages/groups/matches/entries; null pre-generation. */
  loadState(tournamentId: string): Promise<TournamentState | null>;
  /** Replaces the whole entry list (save_tournament_entries semantics: draft/registration only). */
  saveEntries(tournamentId: string, entries: NewEntry[]): Promise<void>;
  /** Persists a freshly generated bracket (persist_bracket: exactly once per tournament). */
  persistBracket(tournamentId: string, state: TournamentState): Promise<void>;
  /** Appends one already-generated swiss round (append_swiss_round). */
  appendSwissRound(tournamentId: string, stageEngineKey: string, matches: Match[]): Promise<void>;
  /** Resolves knockout qualifier placeholders from finished group standings (seed_knockout_from_groups). */
  seedKnockoutFromGroups(tournamentId: string, qualifiers: GroupQualifiers[]): Promise<void>;
}

const DEFAULT_MU = 25;
const DEFAULT_OVR = 60;
const GOALKEEPER_POSITION = "POR";

function parseQualifierRef(value: Json | null): QualifierRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.fromGroup !== "string" || typeof record.rank !== "number") return null;
  return { fromGroup: record.fromGroup, rank: record.rank };
}

/** Local re-derivation of lib/brackets/util.ts's sortMatches (not exported from the engine's
 * public surface): purely cosmetic ordering for the rebuilt TournamentState.matches array, no
 * engine function depends on this order for correctness. */
const BRACKET_ORDER: Record<Match["bracket"], number> = {
  group: 0,
  swiss: 0,
  winners: 1,
  losers: 2,
  final: 3,
  third: 4,
};

function sortMatches(a: Match, b: Match): number {
  if (a.stageId !== b.stageId) return a.stageId < b.stageId ? -1 : 1;
  const ag = a.groupId ?? "";
  const bg = b.groupId ?? "";
  if (ag !== bg) return ag < bg ? -1 : 1;
  if (BRACKET_ORDER[a.bracket] !== BRACKET_ORDER[b.bracket]) return BRACKET_ORDER[a.bracket] - BRACKET_ORDER[b.bracket];
  if (a.round !== b.round) return a.round - b.round;
  return a.number - b.number;
}

/** Standalone (not a repo method) so loadState can reuse it without relying on `this` binding. */
async function loadTournamentRow(client: Client, tournamentId: string): Promise<TournamentRow | null> {
  const { data, error } = await client
    .from("tournaments")
    .select("id, group_id, name, format, entry_mode, team_size, status, settings, organizer_id")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    groupId: data.group_id,
    name: data.name,
    format: data.format,
    entryMode: data.entry_mode,
    teamSize: data.team_size,
    status: data.status,
    settings: parseTournamentSettings(data.settings),
    organizerId: data.organizer_id,
  };
}

export function createSupabaseTournamentRepo(client: Client): TournamentRepo {
  return {
    async loadTournament(tournamentId) {
      return loadTournamentRow(client, tournamentId);
    },

    async loadEntries(tournamentId) {
      const { data, error } = await client
        .from("tournament_entries")
        .select("id, name, seed, player_ids")
        .eq("tournament_id", tournamentId);
      if (error) throw error;
      return (data ?? []).map((e) => ({ id: e.id, name: e.name, seed: e.seed, playerIds: e.player_ids }));
    },

    async loadRegistrations(tournamentId) {
      const { data, error } = await client
        .from("tournament_registrations")
        .select("player_id")
        .eq("tournament_id", tournamentId);
      if (error) throw error;
      return (data ?? []).map((r) => r.player_id);
    },

    async loadPlayerOvrs(playerIds) {
      const result = new Map<string, number>();
      if (playerIds.length === 0) return result;
      const { data, error } = await client.from("player_cards").select("player_id, ovr").in("player_id", playerIds);
      if (error) throw error;
      for (const row of data ?? []) result.set(row.player_id, row.ovr);
      return result;
    },

    async loadBalanceInputs(playerIds) {
      const result = new Map<string, BalanceInput>();
      if (playerIds.length === 0) return result;
      const [playersRes, cardsRes, skillsRes] = await Promise.all([
        client.from("players").select("id, primary_position").in("id", playerIds),
        client.from("player_cards").select("player_id, ovr").in("player_id", playerIds),
        client.from("openskill_ratings").select("player_id, mu").in("player_id", playerIds),
      ]);
      if (playersRes.error) throw playersRes.error;
      if (cardsRes.error) throw cardsRes.error;
      if (skillsRes.error) throw skillsRes.error;

      const ovrByPlayer = new Map((cardsRes.data ?? []).map((r) => [r.player_id, r.ovr]));
      const muByPlayer = new Map((skillsRes.data ?? []).map((r) => [r.player_id, r.mu]));
      for (const p of playersRes.data ?? []) {
        result.set(p.id, {
          id: p.id,
          mu: muByPlayer.get(p.id) ?? DEFAULT_MU,
          ovr: ovrByPlayer.get(p.id) ?? DEFAULT_OVR,
          isGk: p.primary_position === GOALKEEPER_POSITION,
        });
      }
      return result;
    },

    async hasBracket(tournamentId) {
      const { count, error } = await client
        .from("stages")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", tournamentId);
      if (error) throw error;
      return (count ?? 0) > 0;
    },

    async loadState(tournamentId) {
      const tournament = await loadTournamentRow(client, tournamentId);
      if (!tournament) return null;

      const [stagesRes, groupsRes, matchesRes, entriesRes] = await Promise.all([
        client.from("stages").select("id, kind, stage_order, engine_key").eq("tournament_id", tournamentId),
        client.from("stage_groups").select("id, stage_id, number, label, engine_key").eq("tournament_id", tournamentId),
        client
          .from("tournament_matches")
          .select(
            "id, stage_id, stage_group_id, bracket, round, number, entry1_id, entry2_id, entry1_from, entry2_from, status, winner_entry_id, loser_entry_id, score1, score2, pens1, pens2, decided_by, next_match_id, next_slot, next_loser_match_id, next_loser_slot, engine_key",
          )
          .eq("tournament_id", tournamentId),
        client.from("tournament_entries").select("id, name, seed").eq("tournament_id", tournamentId),
      ]);
      if (stagesRes.error) throw stagesRes.error;
      if (groupsRes.error) throw groupsRes.error;
      if (matchesRes.error) throw matchesRes.error;
      if (entriesRes.error) throw entriesRes.error;

      const stageRows = stagesRes.data ?? [];
      if (stageRows.length === 0) return null; // no bracket generated yet

      const stageKeyById = new Map(stageRows.map((s) => [s.id, s.engine_key]));
      const groupRows = groupsRes.data ?? [];
      const groupKeyById = new Map(groupRows.map((g) => [g.id, g.engine_key]));
      const matchRows = matchesRes.data ?? [];
      const matchKeyById = new Map(matchRows.map((m) => [m.id, m.engine_key]));

      const stages: Stage[] = stageRows.map((s) => ({
        id: s.engine_key,
        kind: s.kind as StageKind,
        order: s.stage_order,
      }));

      const groups: Group[] = groupRows.map((g) => ({
        id: g.engine_key,
        stageId: stageKeyById.get(g.stage_id) ?? g.stage_id,
        number: g.number,
        label: g.label,
      }));

      const matches: Match[] = matchRows
        .map((m) => ({
          id: m.engine_key,
          stageId: stageKeyById.get(m.stage_id) ?? m.stage_id,
          groupId: m.stage_group_id ? (groupKeyById.get(m.stage_group_id) ?? m.stage_group_id) : null,
          bracket: m.bracket,
          round: m.round,
          number: m.number,
          entry1Id: m.entry1_id,
          entry2Id: m.entry2_id,
          entry1From: parseQualifierRef(m.entry1_from),
          entry2From: parseQualifierRef(m.entry2_from),
          status: m.status,
          winnerEntryId: m.winner_entry_id,
          loserEntryId: m.loser_entry_id,
          score1: m.score1,
          score2: m.score2,
          pens1: m.pens1,
          pens2: m.pens2,
          decidedBy: m.decided_by,
          nextMatchId: m.next_match_id ? (matchKeyById.get(m.next_match_id) ?? null) : null,
          nextSlot: m.next_slot as 1 | 2 | null,
          nextLoserMatchId: m.next_loser_match_id ? (matchKeyById.get(m.next_loser_match_id) ?? null) : null,
          nextLoserSlot: m.next_loser_slot as 1 | 2 | null,
        }))
        .sort(sortMatches);

      const entries: Entry[] = (entriesRes.data ?? []).map((e) => ({ id: e.id, name: e.name, seed: e.seed ?? 0 }));

      const state: TournamentState = {
        format: tournament.format,
        settings: tournament.settings,
        entries,
        stages,
        groups,
        matches,
      };

      if (tournament.format === "swiss") {
        const maxRound = matches.reduce((max, m) => (m.bracket === "swiss" ? Math.max(max, m.round) : max), 0);
        state.swissRoundsGenerated = maxRound;
      }

      return state;
    },

    async saveEntries(tournamentId, entries) {
      const payload: Json = entries.map((e) => ({ name: e.name, seed: e.seed, player_ids: e.playerIds })) as Json;
      const { error } = await client.rpc("save_tournament_entries", { p_tournament_id: tournamentId, p_entries: payload });
      if (error) throw error;
    },

    async persistBracket(tournamentId, state) {
      const payload = { stages: state.stages, groups: state.groups, matches: state.matches } as unknown as Json;
      const { error } = await client.rpc("persist_bracket", { p_tournament_id: tournamentId, p_payload: payload });
      if (error) throw error;
    },

    async appendSwissRound(tournamentId, stageEngineKey, matches) {
      const { error } = await client.rpc("append_swiss_round", {
        p_tournament_id: tournamentId,
        p_stage_engine_key: stageEngineKey,
        p_matches: matches as unknown as Json,
      });
      if (error) throw error;
    },

    async seedKnockoutFromGroups(tournamentId, qualifiers) {
      const { error } = await client.rpc("seed_knockout_from_groups", {
        p_tournament_id: tournamentId,
        p_qualifiers: qualifiers as unknown as Json,
      });
      if (error) throw error;
    },
  };
}
