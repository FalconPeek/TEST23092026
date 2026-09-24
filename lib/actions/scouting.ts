"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { ok, fail, type ActionResult } from "@/lib/actions/result";
import { mapDbError } from "@/lib/actions/errors";
import { recomputeNow } from "@/lib/server/recompute-now";
import { ALL_ATTRIBUTES, QUICK_VOTE_KEYS } from "@/lib/rating/attributes";
import { PLAYSTYLES } from "@/lib/rating/playstyles";
import type { Json } from "@/lib/supabase/database.types";

const uuid = z.uuid();
const voteValue = z.int().min(1).max(10);

/**
 * DB triggers also enqueue the target in `recompute_queue`, so a `recomputeNow` failure here
 * just means the cron drain catches up later instead of the card refreshing immediately.
 */
async function recomputeQuietly(playerId: string): Promise<void> {
  try {
    await recomputeNow([playerId]);
  } catch {
    // ignored — see comment above
  }
}

// --- submitScoutingVotes ------------------------------------------------------------------

const submitScoutingVotesSchema = z
  .union([
    z.object({
      groupId: uuid,
      targetPlayerId: uuid,
      mode: z.literal("quick"),
      // GK quick keys are only valid for keeper targets; the RPC enforces that per target.
      votes: z.partialRecord(z.enum(QUICK_VOTE_KEYS), voteValue),
    }),
    z.object({
      groupId: uuid,
      targetPlayerId: uuid,
      mode: z.literal("detailed"),
      votes: z.partialRecord(z.enum(ALL_ATTRIBUTES), voteValue),
    }),
  ])
  .refine((v) => Object.keys(v.votes).length >= 1, {
    message: "at least one vote is required",
    path: ["votes"],
  });

export async function submitScoutingVotes(input: {
  groupId: string;
  targetPlayerId: string;
  mode: "quick" | "detailed";
  votes: Record<string, number>;
}): Promise<ActionResult<void>> {
  const parsed = submitScoutingVotesSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_scouting_votes", {
    p_target_player_id: parsed.data.targetPlayerId,
    p_mode: parsed.data.mode,
    p_votes: parsed.data.votes as unknown as Json,
  });
  if (error) return fail(mapDbError(error));

  await recomputeQuietly(parsed.data.targetPlayerId);

  revalidatePath(`/g/${parsed.data.groupId}/jugadores/${parsed.data.targetPlayerId}`);
  return ok(undefined);
}

// --- submitPlaystyleVotes -----------------------------------------------------------------

const playstylesFieldSchema = z
  .array(z.enum(PLAYSTYLES))
  .max(5)
  .refine((arr) => new Set(arr).size === arr.length, { message: "duplicate playstyle in selection" });

const submitPlaystyleVotesSchema = z.object({
  groupId: uuid,
  targetPlayerId: uuid,
  playstyles: playstylesFieldSchema,
});

export async function submitPlaystyleVotes(input: {
  groupId: string;
  targetPlayerId: string;
  playstyles: string[];
}): Promise<ActionResult<void>> {
  const parsed = submitPlaystyleVotesSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_playstyle_votes", {
    p_target_player_id: parsed.data.targetPlayerId,
    p_playstyles: parsed.data.playstyles,
  });
  if (error) return fail(mapDbError(error));

  await recomputeQuietly(parsed.data.targetPlayerId);

  revalidatePath(`/g/${parsed.data.groupId}/jugadores/${parsed.data.targetPlayerId}`);
  return ok(undefined);
}

// --- submitStarVotes ------------------------------------------------------------------------

const submitStarVotesSchema = z
  .object({
    groupId: uuid,
    targetPlayerId: uuid,
    weakFoot: z.int().min(1).max(5).optional(),
    skillMoves: z.int().min(1).max(5).optional(),
  })
  .refine((v) => v.weakFoot !== undefined || v.skillMoves !== undefined, {
    message: "provide at least one of weakFoot or skillMoves",
  });

export async function submitStarVotes(input: {
  groupId: string;
  targetPlayerId: string;
  weakFoot?: number;
  skillMoves?: number;
}): Promise<ActionResult<void>> {
  const parsed = submitStarVotesSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_star_votes", {
    p_target_player_id: parsed.data.targetPlayerId,
    p_weak_foot: (parsed.data.weakFoot ?? null) as unknown as number,
    p_skill_moves: (parsed.data.skillMoves ?? null) as unknown as number,
  });
  if (error) return fail(mapDbError(error));

  await recomputeQuietly(parsed.data.targetPlayerId);

  revalidatePath(`/g/${parsed.data.groupId}/jugadores/${parsed.data.targetPlayerId}`);
  return ok(undefined);
}
