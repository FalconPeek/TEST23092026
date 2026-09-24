"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { ok, fail, type ActionResult } from "@/lib/actions/result";
import { mapDbError } from "@/lib/actions/errors";
import type { Json } from "@/lib/supabase/database.types";

const uuid = z.uuid();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const clubFields = {
  name: z.string().trim().min(1).max(40),
  shortName: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{2,4}$/)),
  primaryColor: color,
  secondaryColor: color,
};

function clubsPath(groupId: string) {
  return `/g/${groupId}/clubes`;
}

const createClubSchema = z.object({ groupId: uuid, ...clubFields });

export async function createClub(input: {
  groupId: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
}): Promise<ActionResult<{ clubId: string }>> {
  const parsed = createClubSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);
  if (!(await getUserId())) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_club", {
    p_group_id: parsed.data.groupId,
    p_name: parsed.data.name,
    p_short_name: parsed.data.shortName,
    p_primary_color: parsed.data.primaryColor,
    p_secondary_color: parsed.data.secondaryColor,
  });
  if (error || !data) return fail(mapDbError(error));

  revalidatePath(clubsPath(parsed.data.groupId));
  return ok({ clubId: data });
}

// The crest file is uploaded by the browser straight to the `club-crests` bucket (storage RLS only
// lets group admins write `<groupId>/<clubId>.<ext>`); this action then records its path.
const updateClubSchema = z.object({
  groupId: uuid,
  clubId: uuid,
  ...clubFields,
  crestPath: z
    .string()
    .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$/)
    .nullable(),
});

export async function updateClub(input: {
  groupId: string;
  clubId: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  crestPath: string | null;
}): Promise<ActionResult<void>> {
  const parsed = updateClubSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);
  if (!(await getUserId())) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_club", {
    p_club_id: parsed.data.clubId,
    p_name: parsed.data.name,
    p_short_name: parsed.data.shortName,
    p_primary_color: parsed.data.primaryColor,
    p_secondary_color: parsed.data.secondaryColor,
    // Explicit null clears the crest; the generated Args type only knows it has a SQL default.
    p_crest_path: parsed.data.crestPath as unknown as string | undefined,
  });
  if (error) return fail(mapDbError(error));

  revalidatePath(clubsPath(parsed.data.groupId));
  return ok(undefined);
}

const clubRefSchema = z.object({ groupId: uuid, clubId: uuid });

export async function deleteClub(input: { groupId: string; clubId: string }): Promise<ActionResult<void>> {
  const parsed = clubRefSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);
  if (!(await getUserId())) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_club", { p_club_id: parsed.data.clubId });
  if (error) return fail(mapDbError(error));

  revalidatePath(clubsPath(parsed.data.groupId));
  return ok(undefined);
}

const setClubPlayersSchema = z
  .object({
    groupId: uuid,
    clubId: uuid,
    players: z.array(z.object({ playerId: uuid, shirtNumber: z.int().min(1).max(99).nullable() })).max(60),
  })
  .refine((v) => new Set(v.players.map((p) => p.playerId)).size === v.players.length, { path: ["players"] })
  .refine(
    (v) => {
      const numbers = v.players.flatMap((p) => (p.shirtNumber === null ? [] : [p.shirtNumber]));
      return new Set(numbers).size === numbers.length;
    },
    { path: ["players"] },
  );

export async function setClubPlayers(input: {
  groupId: string;
  clubId: string;
  players: { playerId: string; shirtNumber: number | null }[];
}): Promise<ActionResult<void>> {
  const parsed = setClubPlayersSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);
  if (!(await getUserId())) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_club_players", {
    p_club_id: parsed.data.clubId,
    p_players: parsed.data.players.map((p) => ({ player_id: p.playerId, shirt_number: p.shirtNumber })) as unknown as Json,
  });
  if (error) return fail(mapDbError(error));

  revalidatePath(clubsPath(parsed.data.groupId));
  return ok(undefined);
}
