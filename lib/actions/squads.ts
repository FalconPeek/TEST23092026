"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { ok, fail, type ActionResult } from "@/lib/actions/result";
import { mapDbError } from "@/lib/actions/errors";
import { findFormation } from "@/lib/squads/formations";
import type { Json } from "@/lib/supabase/database.types";

const uuid = z.uuid();
const teamSize = z.union([z.literal(5), z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(11)]);

function squadsPath(groupId: string) {
  return `/g/${groupId}/plantillas`;
}

const saveSquadSchema = z
  .object({
    squadId: uuid.nullable(),
    groupId: uuid,
    kind: z.enum(["dream", "lineup"]),
    name: z.string().trim().min(1).max(40),
    teamSize,
    formation: z.string(),
    slots: z.array(z.object({ slot: z.int().min(0).max(10), playerId: uuid })).max(11),
    clubId: uuid.nullable(),
    matchId: uuid.nullable(),
    side: z.union([z.literal(1), z.literal(2)]).nullable(),
  })
  .refine((v) => findFormation(v.teamSize, v.formation) !== undefined, { path: ["formation"] })
  .refine((v) => new Set(v.slots.map((s) => s.slot)).size === v.slots.length, { path: ["slots"] })
  .refine((v) => new Set(v.slots.map((s) => s.playerId)).size === v.slots.length, { path: ["slots"] })
  .refine((v) => (v.kind === "lineup") === (v.matchId !== null && v.side !== null), { path: ["matchId"] });

export type SaveSquadInput = z.input<typeof saveSquadSchema>;

/** Positions come from the formation catalog, never from the client. */
export async function saveSquad(input: SaveSquadInput): Promise<ActionResult<{ squadId: string }>> {
  const parsed = saveSquadSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);
  if (!(await getUserId())) return fail(es.errors.unauthenticated);

  const formation = findFormation(parsed.data.teamSize, parsed.data.formation)!;
  const positionBySlot = new Map(formation.slots.map((s) => [s.slot, s.position]));
  if (parsed.data.slots.some((s) => !positionBySlot.has(s.slot))) return fail(es.errors.validation);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_squad", {
    p_squad_id: parsed.data.squadId as unknown as string,
    p_group_id: parsed.data.groupId,
    p_kind: parsed.data.kind,
    p_name: parsed.data.name,
    p_team_size: parsed.data.teamSize,
    p_formation: parsed.data.formation,
    p_slots: parsed.data.slots.map((s) => ({
      slot: s.slot,
      position: positionBySlot.get(s.slot),
      player_id: s.playerId,
    })) as unknown as Json,
    p_club_id: (parsed.data.clubId ?? undefined) as string | undefined,
    p_match_id: (parsed.data.matchId ?? undefined) as string | undefined,
    p_side: (parsed.data.side ?? undefined) as number | undefined,
  });
  if (error || !data) return fail(mapDbError(error));

  revalidatePath(squadsPath(parsed.data.groupId));
  if (parsed.data.matchId) revalidatePath(`/g/${parsed.data.groupId}/partidos/${parsed.data.matchId}`);
  return ok({ squadId: data });
}

const squadRefSchema = z.object({ groupId: uuid, squadId: uuid });

export async function deleteSquad(input: { groupId: string; squadId: string }): Promise<ActionResult<void>> {
  const parsed = squadRefSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);
  if (!(await getUserId())) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_squad", { p_squad_id: parsed.data.squadId });
  if (error) return fail(mapDbError(error));

  revalidatePath(squadsPath(parsed.data.groupId));
  return ok(undefined);
}

const publishSchema = squadRefSchema.extend({ published: z.boolean() });

export async function setSquadPublished(input: {
  groupId: string;
  squadId: string;
  published: boolean;
}): Promise<ActionResult<void>> {
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);
  if (!(await getUserId())) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_squad_published", {
    p_squad_id: parsed.data.squadId,
    p_published: parsed.data.published,
  });
  if (error) return fail(mapDbError(error));

  revalidatePath(squadsPath(parsed.data.groupId));
  return ok(undefined);
}

const likeSchema = squadRefSchema.extend({ like: z.boolean() });

export async function likeSquad(input: { groupId: string; squadId: string; like: boolean }): Promise<ActionResult<void>> {
  const parsed = likeSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);
  if (!(await getUserId())) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("like_squad", { p_squad_id: parsed.data.squadId, p_like: parsed.data.like });
  if (error) return fail(mapDbError(error));

  revalidatePath(squadsPath(parsed.data.groupId));
  return ok(undefined);
}

const applySchema = z.object({ groupId: uuid, matchId: uuid });

/**
 * Turns the match's two lineup squads (side 1 and 2) into the real lineup via set_match_lineup:
 * players keep the position of their slot, teams take the club's name/colors when a club is set.
 * Players of the group not placed on either side are left out (no spectators are added here).
 */
export async function applyLineupSquads(input: { groupId: string; matchId: string }): Promise<ActionResult<void>> {
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);
  if (!(await getUserId())) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { data: squads, error: loadError } = await supabase
    .from("squads")
    .select("id, side, name, club_id, clubs(name, primary_color), squad_slots(slot, position, player_id)")
    .eq("match_id", parsed.data.matchId)
    .eq("kind", "lineup");
  if (loadError) return fail(mapDbError(loadError));

  const bySide = new Map((squads ?? []).map((s) => [s.side, s]));
  const side1 = bySide.get(1);
  const side2 = bySide.get(2);
  if (!side1 || !side2) return fail(es.errors.validation);

  const team = (squad: NonNullable<typeof side1>) => ({
    name: squad.clubs?.name ?? squad.name,
    color: squad.clubs?.primary_color ?? undefined,
    players: [...squad.squad_slots].sort((a, b) => a.slot - b.slot).map((s) => ({ player_id: s.player_id, position: s.position })),
  });

  const { error } = await supabase.rpc("set_match_lineup", {
    p_match_id: parsed.data.matchId,
    p_team1: team(side1) as unknown as Json,
    p_team2: team(side2) as unknown as Json,
    p_spectators: [],
  });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}/partidos/${parsed.data.matchId}`);
  return ok(undefined);
}
