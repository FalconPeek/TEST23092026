"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { es } from "@/messages/es";
import { seededRng } from "@/lib/brackets";
import { createClient, getUserId } from "@/lib/supabase/server";
import { ok, fail, type ActionResult } from "@/lib/actions/result";
import { mapDbError } from "@/lib/actions/errors";
import { createSupabaseTournamentRepo } from "@/lib/server/tournament-repo";
import { afterTournamentMatchCompleted, buildIndividualEntries, generateBracket } from "@/lib/server/tournaments";
import { tournamentFormats, tournamentSettingsSchema, type TournamentFormat } from "@/lib/settings/tournament";
import type { Json } from "@/lib/supabase/database.types";

const uuid = z.uuid();
const nameField = z.string().trim().min(1).max(60);
const tournamentFormatEnum = z.enum(tournamentFormats);
const entryModeEnum = z.enum(["teams", "individual"]);
const tournamentStatusEnum = z.enum(["draft", "registration", "in_progress", "finished"]);
const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "invalid date" });
// Only 'manual'/'walkover' are ever chosen by an organizer; 'regular'/'pens'/'bye' are always
// derived server-side from the scores/pens (see private.tm_apply_result).
const manualDecisionEnum = z.enum(["manual", "walkover"]);

/** Turns any caught error (a thrown PostgrestError-like `{message}` from an RPC, or a
 * lib/brackets/lib/server/tournaments.ts Error) into Spanish UI copy via the shared mapper --
 * mapDbError already falls back to es.common.error for anything it doesn't recognize (including
 * new M4 PICADO_* codes it hasn't been taught yet), so this never leaks a raw error message. */
function mapCaughtError(err: unknown): string {
  return mapDbError(err instanceof Error ? { message: err.message } : null);
}

// --- createTournament -----------------------------------------------------------------------

const createTournamentSchema = z.object({
  groupId: uuid,
  name: nameField,
  format: tournamentFormatEnum,
  teamSize: z.int().min(3).max(11),
  entryMode: entryModeEnum.default("teams"),
  settings: z.unknown().optional(),
});

export async function createTournament(input: {
  groupId: string;
  name: string;
  format: TournamentFormat;
  teamSize: number;
  entryMode?: "teams" | "individual";
  settings?: unknown;
}): Promise<ActionResult<{ tournamentId: string }>> {
  const parsed = createTournamentSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const settingsResult = tournamentSettingsSchema.safeParse(parsed.data.settings ?? {});
  if (!settingsResult.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_tournament", {
    p_group_id: parsed.data.groupId,
    p_name: parsed.data.name,
    p_format: parsed.data.format,
    p_team_size: parsed.data.teamSize,
    p_entry_mode: parsed.data.entryMode,
    p_settings: settingsResult.data as unknown as Json,
  });
  if (error || !data) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}/torneos`);
  return ok({ tournamentId: data });
}

// --- updateTournament ------------------------------------------------------------------------

const updateTournamentSchema = z.object({
  tournamentId: uuid,
  groupId: uuid,
  name: nameField,
  settings: z.unknown(),
});

export async function updateTournament(input: {
  tournamentId: string;
  groupId: string;
  name: string;
  settings: unknown;
}): Promise<ActionResult<void>> {
  const parsed = updateTournamentSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const settingsResult = tournamentSettingsSchema.safeParse(parsed.data.settings);
  if (!settingsResult.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_tournament", {
    p_tournament_id: parsed.data.tournamentId,
    p_name: parsed.data.name,
    p_settings: settingsResult.data as unknown as Json,
  });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}/torneos`);
  revalidatePath(`/g/${parsed.data.groupId}/torneos/${parsed.data.tournamentId}`);
  return ok(undefined);
}

// --- setTournamentStatus ---------------------------------------------------------------------

const setTournamentStatusSchema = z.object({ tournamentId: uuid, groupId: uuid, status: tournamentStatusEnum });

export async function setTournamentStatus(input: {
  tournamentId: string;
  groupId: string;
  status: "draft" | "registration" | "in_progress" | "finished";
}): Promise<ActionResult<void>> {
  const parsed = setTournamentStatusSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_tournament_status", {
    p_tournament_id: parsed.data.tournamentId,
    p_status: parsed.data.status,
  });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}/torneos`);
  revalidatePath(`/g/${parsed.data.groupId}/torneos/${parsed.data.tournamentId}`);
  return ok(undefined);
}

// --- registerForTournament / unregisterFromTournament ----------------------------------------

const tournamentIdWithGroupSchema = z.object({ tournamentId: uuid, groupId: uuid });

export async function registerForTournament(input: {
  tournamentId: string;
  groupId: string;
}): Promise<ActionResult<void>> {
  const parsed = tournamentIdWithGroupSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_for_tournament", { p_tournament_id: parsed.data.tournamentId });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}/torneos`);
  revalidatePath(`/g/${parsed.data.groupId}/torneos/${parsed.data.tournamentId}`);
  return ok(undefined);
}

export async function unregisterFromTournament(input: {
  tournamentId: string;
  groupId: string;
}): Promise<ActionResult<void>> {
  const parsed = tournamentIdWithGroupSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("unregister_from_tournament", { p_tournament_id: parsed.data.tournamentId });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}/torneos`);
  revalidatePath(`/g/${parsed.data.groupId}/torneos/${parsed.data.tournamentId}`);
  return ok(undefined);
}

// --- saveTournamentEntries -------------------------------------------------------------------

const entryInputSchema = z.object({
  name: nameField,
  seed: z.union([z.int().min(1), z.null()]).optional(),
  playerIds: z.array(uuid).default([]),
});

const saveTournamentEntriesSchema = z.object({
  tournamentId: uuid,
  groupId: uuid,
  entries: z.array(entryInputSchema).min(1),
});

export async function saveTournamentEntries(input: {
  tournamentId: string;
  groupId: string;
  entries: { name: string; seed?: number | null; playerIds: string[] }[];
}): Promise<ActionResult<void>> {
  const parsed = saveTournamentEntriesSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const payload: Json = parsed.data.entries.map((e) => ({
    name: e.name,
    seed: e.seed ?? null,
    player_ids: e.playerIds,
  })) as Json;

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_tournament_entries", {
    p_tournament_id: parsed.data.tournamentId,
    p_entries: payload,
  });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}/torneos`);
  revalidatePath(`/g/${parsed.data.groupId}/torneos/${parsed.data.tournamentId}`);
  return ok(undefined);
}

// --- generateTournamentBracket ---------------------------------------------------------------

const generateTournamentBracketSchema = z.object({ tournamentId: uuid, groupId: uuid });

/**
 * Admin-only. Uses the session client for both the admin check (enforced by persist_bracket /
 * save_tournament_entries themselves via private.is_group_admin) and every RPC -- the orchestration
 * (lib/server/tournaments.ts's generateBracket/buildIndividualEntries) just drives the pure engine
 * and those RPCs through a TournamentRepo built on that same client, no admin client involved.
 */
export async function generateTournamentBracket(input: {
  tournamentId: string;
  groupId: string;
}): Promise<ActionResult<void>> {
  const parsed = generateTournamentBracketSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const repo = createSupabaseTournamentRepo(supabase);
  const rng = seededRng(Date.now());

  try {
    const tournament = await repo.loadTournament(parsed.data.tournamentId);
    if (!tournament) return fail(es.errors.validation);
    if (tournament.entryMode === "individual") {
      await buildIndividualEntries(repo, parsed.data.tournamentId, rng);
    }
    await generateBracket(repo, parsed.data.tournamentId, rng);
  } catch (err) {
    return fail(mapCaughtError(err));
  }

  revalidatePath(`/g/${parsed.data.groupId}/torneos`);
  revalidatePath(`/g/${parsed.data.groupId}/torneos/${parsed.data.tournamentId}`);
  return ok(undefined);
}

// --- startTournamentMatch (link_tournament_match) ---------------------------------------------

const startTournamentMatchSchema = z.object({
  tournamentMatchId: uuid,
  tournamentId: uuid,
  groupId: uuid,
  scheduledAt: isoDate,
  venue: z.string().trim().min(1).max(120).optional(),
});

export async function startTournamentMatch(input: {
  tournamentMatchId: string;
  tournamentId: string;
  groupId: string;
  scheduledAt: string;
  venue?: string;
}): Promise<ActionResult<{ matchId: string }>> {
  const parsed = startTournamentMatchSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("link_tournament_match", {
    p_tournament_match_id: parsed.data.tournamentMatchId,
    p_scheduled_at: parsed.data.scheduledAt,
    p_venue: parsed.data.venue,
  });
  if (error || !data) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}/torneos`);
  revalidatePath(`/g/${parsed.data.groupId}/torneos/${parsed.data.tournamentId}`);
  return ok({ matchId: data });
}

// --- confirmTournamentResult / editTournamentResult --------------------------------------------

const resultInputShape = {
  tournamentMatchId: uuid,
  tournamentId: uuid,
  groupId: uuid,
  score1: z.int().min(0),
  score2: z.int().min(0),
  pens1: z.int().min(0).optional(),
  pens2: z.int().min(0).optional(),
  decidedBy: manualDecisionEnum.optional(),
  winnerEntryId: uuid.optional(),
};
const confirmTournamentResultSchema = z.object(resultInputShape);
const editTournamentResultSchema = z.object(resultInputShape);

interface ResultInput {
  tournamentMatchId: string;
  tournamentId: string;
  groupId: string;
  score1: number;
  score2: number;
  pens1?: number;
  pens2?: number;
  decidedBy?: "manual" | "walkover";
  winnerEntryId?: string;
}

/** Best-effort bracket advancement (groups_ko group seeding / next swiss round) after a manual
 * confirm/edit; a failure here (e.g. a swiss pairing dead end) must not undo the result the RPC
 * above already durably recorded -- the organizer can retry by re-opening the tournament page. */
async function tryAdvance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tournamentId: string,
): Promise<void> {
  try {
    const repo = createSupabaseTournamentRepo(supabase);
    await afterTournamentMatchCompleted(repo, tournamentId, seededRng(Date.now()));
  } catch {
    // Swallowed deliberately -- see doc comment above.
  }
}

export async function confirmTournamentResult(input: ResultInput): Promise<ActionResult<void>> {
  const parsed = confirmTournamentResultSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_match_result", {
    p_tournament_match_id: parsed.data.tournamentMatchId,
    p_score1: parsed.data.score1,
    p_score2: parsed.data.score2,
    p_pens1: parsed.data.pens1,
    p_pens2: parsed.data.pens2,
    p_decided_by: parsed.data.decidedBy,
    p_winner_entry_id: parsed.data.winnerEntryId,
  });
  if (error) return fail(mapDbError(error));

  await tryAdvance(supabase, parsed.data.tournamentId);

  revalidatePath(`/g/${parsed.data.groupId}/torneos`);
  revalidatePath(`/g/${parsed.data.groupId}/torneos/${parsed.data.tournamentId}`);
  return ok(undefined);
}

export async function editTournamentResult(input: ResultInput): Promise<ActionResult<void>> {
  const parsed = editTournamentResultSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("edit_match_result", {
    p_tournament_match_id: parsed.data.tournamentMatchId,
    p_score1: parsed.data.score1,
    p_score2: parsed.data.score2,
    p_pens1: parsed.data.pens1,
    p_pens2: parsed.data.pens2,
    p_decided_by: parsed.data.decidedBy,
    p_winner_entry_id: parsed.data.winnerEntryId,
  });
  if (error) return fail(mapDbError(error));

  await tryAdvance(supabase, parsed.data.tournamentId);

  revalidatePath(`/g/${parsed.data.groupId}/torneos`);
  revalidatePath(`/g/${parsed.data.groupId}/torneos/${parsed.data.tournamentId}`);
  return ok(undefined);
}
