"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { ok, fail, type ActionResult } from "@/lib/actions/result";
import { mapDbError } from "@/lib/actions/errors";
import { ALL_ATTRIBUTES } from "@/lib/rating/attributes";
import { POSITIONS, type PositionCode } from "@/lib/rating/positions";
import {
  awardAmendmentBadgesBestEffort,
  notifyMatchScheduledBestEffort,
  notifyReportingStartedBestEffort,
} from "@/lib/server/match-notify";
import type { Json } from "@/lib/supabase/database.types";

const uuid = z.uuid();
const teamSizeEnum = z.union([
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
  z.literal(9),
  z.literal(11),
]);
const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "invalid date" });
const positionEnum = z.enum(POSITIONS);

function uniqueBy<T>(items: T[], key: (item: T) => string): boolean {
  const seen = new Set(items.map(key));
  return seen.size === items.length;
}

// --- createMatch ----------------------------------------------------------------------------

const createMatchSchema = z.object({
  groupId: uuid,
  scheduledAt: isoDate,
  teamSize: teamSizeEnum,
  venue: z.string().trim().min(1).max(120).optional(),
});

export async function createMatch(input: {
  groupId: string;
  scheduledAt: string;
  teamSize: 5 | 6 | 7 | 8 | 9 | 11;
  venue?: string;
}): Promise<ActionResult<{ matchId: string }>> {
  const parsed = createMatchSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_match", {
    p_group_id: parsed.data.groupId,
    p_scheduled_at: parsed.data.scheduledAt,
    p_team_size: parsed.data.teamSize,
    p_venue: parsed.data.venue,
  });
  if (error || !data) return fail(mapDbError(error));

  await notifyMatchScheduledBestEffort(data, parsed.data.groupId, new Date(parsed.data.scheduledAt));

  revalidatePath(`/g/${parsed.data.groupId}/partidos`);
  return ok({ matchId: data });
}

// --- setMatchLineup ---------------------------------------------------------------------------

const lineupPlayerSchema = z.object({
  playerId: uuid,
  position: positionEnum.optional(),
});

const teamSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().trim().min(1).max(30).optional(),
  players: z.array(lineupPlayerSchema).min(1),
});

const setMatchLineupSchema = z
  .object({
    groupId: uuid,
    matchId: uuid,
    team1: teamSchema,
    team2: teamSchema,
    spectators: z.array(uuid).default([]),
  })
  .refine(
    (v) => {
      const ids = [
        ...v.team1.players.map((p) => p.playerId),
        ...v.team2.players.map((p) => p.playerId),
        ...v.spectators,
      ];
      return uniqueBy(ids, (id) => id);
    },
    { message: "a player cannot appear more than once in the lineup", path: ["team1"] },
  );

type TeamInput = z.infer<typeof teamSchema>;

function teamToJson(team: TeamInput): Json {
  return {
    name: team.name,
    color: team.color ?? null,
    players: team.players.map((p) => ({ player_id: p.playerId, position: p.position ?? null })),
  } as unknown as Json;
}

export async function setMatchLineup(input: {
  groupId: string;
  matchId: string;
  team1: { name: string; color?: string; players: { playerId: string; position?: PositionCode }[] };
  team2: { name: string; color?: string; players: { playerId: string; position?: PositionCode }[] };
  spectators: string[];
}): Promise<ActionResult<void>> {
  const parsed = setMatchLineupSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_match_lineup", {
    p_match_id: parsed.data.matchId,
    p_team1: teamToJson(parsed.data.team1),
    p_team2: teamToJson(parsed.data.team2),
    p_spectators: parsed.data.spectators,
  });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}/partidos`);
  revalidatePath(`/g/${parsed.data.groupId}/partidos/${parsed.data.matchId}`);
  return ok(undefined);
}

// --- startReporting -------------------------------------------------------------------------

const startReportingSchema = z.object({
  groupId: uuid,
  matchId: uuid,
  playedAt: isoDate.optional(),
});

export async function startReporting(input: {
  groupId: string;
  matchId: string;
  playedAt?: string;
}): Promise<ActionResult<void>> {
  const parsed = startReportingSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("start_reporting", {
    p_match_id: parsed.data.matchId,
    p_played_at: parsed.data.playedAt,
  });
  if (error) return fail(mapDbError(error));

  await notifyReportingStartedBestEffort(parsed.data.matchId, parsed.data.groupId);

  revalidatePath(`/g/${parsed.data.groupId}/partidos`);
  revalidatePath(`/g/${parsed.data.groupId}/partidos/${parsed.data.matchId}`);
  return ok(undefined);
}

// --- cancelMatch ------------------------------------------------------------------------------

const cancelMatchSchema = z.object({ groupId: uuid, matchId: uuid });

export async function cancelMatch(input: {
  groupId: string;
  matchId: string;
}): Promise<ActionResult<void>> {
  const parsed = cancelMatchSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_match", { p_match_id: parsed.data.matchId });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}/partidos`);
  revalidatePath(`/g/${parsed.data.groupId}/partidos/${parsed.data.matchId}`);
  return ok(undefined);
}

// --- submitScoreReport ------------------------------------------------------------------------

const submitScoreReportSchema = z.object({
  groupId: uuid,
  matchId: uuid,
  team1Goals: z.int().min(0).max(99),
  team2Goals: z.int().min(0).max(99),
});

export async function submitScoreReport(input: {
  groupId: string;
  matchId: string;
  team1Goals: number;
  team2Goals: number;
}): Promise<ActionResult<void>> {
  const parsed = submitScoreReportSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_score_report", {
    p_match_id: parsed.data.matchId,
    p_team1_goals: parsed.data.team1Goals,
    p_team2_goals: parsed.data.team2Goals,
  });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}/partidos/${parsed.data.matchId}`);
  return ok(undefined);
}

// --- submitStatReports ------------------------------------------------------------------------

const statReportSchema = z.object({
  subjectPlayerId: uuid,
  goals: z.int().min(0).max(30).default(0),
  assists: z.int().min(0).max(30).default(0),
  ownGoals: z.int().min(0).max(30).default(0),
  saves: z.int().min(0).max(99).default(0),
});

const submitStatReportsSchema = z
  .object({
    groupId: uuid,
    matchId: uuid,
    reports: z.array(statReportSchema).min(1),
  })
  .refine((v) => uniqueBy(v.reports, (r) => r.subjectPlayerId), {
    message: "subject_player_id must be unique within the batch",
    path: ["reports"],
  });

export async function submitStatReports(input: {
  groupId: string;
  matchId: string;
  reports: { subjectPlayerId: string; goals?: number; assists?: number; ownGoals?: number; saves?: number }[];
}): Promise<ActionResult<void>> {
  const parsed = submitStatReportsSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_stat_reports", {
    p_match_id: parsed.data.matchId,
    p_reports: parsed.data.reports.map((r) => ({
      subject_player_id: r.subjectPlayerId,
      goals: r.goals,
      assists: r.assists,
      own_goals: r.ownGoals,
      saves: r.saves,
    })) as unknown as Json,
  });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}/partidos/${parsed.data.matchId}`);
  return ok(undefined);
}

// --- submitMatchRatings -----------------------------------------------------------------------

const matchRatingSchema = z.object({
  targetPlayerId: uuid,
  rating: z.int().min(1).max(10),
  standoutAttributes: z.array(z.enum(ALL_ATTRIBUTES)).max(2).default([]),
});

const submitMatchRatingsSchema = z
  .object({
    groupId: uuid,
    matchId: uuid,
    ratings: z.array(matchRatingSchema).min(1),
  })
  .refine((v) => uniqueBy(v.ratings, (r) => r.targetPlayerId), {
    message: "target_player_id must be unique within the batch",
    path: ["ratings"],
  });

export async function submitMatchRatings(input: {
  groupId: string;
  matchId: string;
  ratings: { targetPlayerId: string; rating: number; standoutAttributes?: string[] }[];
}): Promise<ActionResult<void>> {
  const parsed = submitMatchRatingsSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_match_ratings", {
    p_match_id: parsed.data.matchId,
    p_ratings: parsed.data.ratings.map((r) => ({
      target_player_id: r.targetPlayerId,
      rating: r.rating,
      standout_attributes: r.standoutAttributes,
    })) as unknown as Json,
  });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}/partidos/${parsed.data.matchId}`);
  return ok(undefined);
}

// --- resolveDispute ---------------------------------------------------------------------------

const disputeStatSchema = z.object({
  subjectPlayerId: uuid,
  goals: z.int().min(0).max(30).optional(),
  assists: z.int().min(0).max(30).optional(),
  ownGoals: z.int().min(0).max(30).optional(),
  saves: z.int().min(0).max(99).optional(),
});

const resolveDisputeSchema = z
  .object({
    groupId: uuid,
    matchId: uuid,
    team1Goals: z.int().min(0).max(99),
    team2Goals: z.int().min(0).max(99),
    stats: z.array(disputeStatSchema).optional(),
  })
  .refine((v) => !v.stats || uniqueBy(v.stats, (s) => s.subjectPlayerId), {
    message: "subject_player_id must be unique within the batch",
    path: ["stats"],
  });

export async function resolveDispute(input: {
  groupId: string;
  matchId: string;
  team1Goals: number;
  team2Goals: number;
  stats?: { subjectPlayerId: string; goals?: number; assists?: number; ownGoals?: number; saves?: number }[];
}): Promise<ActionResult<void>> {
  const parsed = resolveDisputeSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_dispute", {
    p_match_id: parsed.data.matchId,
    p_team1_goals: parsed.data.team1Goals,
    p_team2_goals: parsed.data.team2Goals,
    p_stats: parsed.data.stats
      ? (parsed.data.stats.map((s) => ({
          subject_player_id: s.subjectPlayerId,
          goals: s.goals,
          assists: s.assists,
          own_goals: s.ownGoals,
          saves: s.saves,
        })) as unknown as Json)
      : undefined,
  });
  if (error) return fail(mapDbError(error));

  revalidatePath(`/g/${parsed.data.groupId}/partidos/${parsed.data.matchId}`);
  return ok(undefined);
}

// --- amendMatchStats (amend_match_stats) -----------------------------------------------------

const amendStatSchema = z.object({
  subjectPlayerId: uuid,
  goals: z.int().min(0).max(30).optional(),
  assists: z.int().min(0).max(30).optional(),
  ownGoals: z.int().min(0).max(30).optional(),
  saves: z.int().min(0).max(99).optional(),
});

const amendMatchStatsSchema = z
  .object({
    groupId: uuid,
    matchId: uuid,
    stats: z.array(amendStatSchema).min(1),
  })
  .refine((v) => uniqueBy(v.stats, (s) => s.subjectPlayerId), { message: "duplicate subject", path: ["stats"] });

/** Admin assigns previously unattributed goals (or fixes assists/own goals/saves) of a finalized
 * match. The RPC enforces admin + finalized + "never more than the official score"; newly earned
 * badges are awarded best-effort afterwards. */
export async function amendMatchStats(input: {
  groupId: string;
  matchId: string;
  stats: { subjectPlayerId: string; goals?: number; assists?: number; ownGoals?: number; saves?: number }[];
}): Promise<ActionResult<void>> {
  const parsed = amendMatchStatsSchema.safeParse(input);
  if (!parsed.success) return fail(es.errors.validation);

  const userId = await getUserId();
  if (!userId) return fail(es.errors.unauthenticated);

  const supabase = await createClient();
  const subjectIds = parsed.data.stats.map((s) => s.subjectPlayerId);
  // Snapshot before the change so badge evaluation knows what the amendment itself crossed.
  const { data: beforeRows } = await supabase
    .from("match_stats")
    .select("player_id, goals, assists")
    .eq("match_id", parsed.data.matchId)
    .in("player_id", subjectIds);
  const beforeByPlayer = new Map((beforeRows ?? []).map((r) => [r.player_id, { goals: r.goals, assists: r.assists }]));

  const { error } = await supabase.rpc("amend_match_stats", {
    p_match_id: parsed.data.matchId,
    p_stats: parsed.data.stats.map((s) => ({
      subject_player_id: s.subjectPlayerId,
      goals: s.goals,
      assists: s.assists,
      own_goals: s.ownGoals,
      saves: s.saves,
    })) as unknown as Json,
  });
  if (error) return fail(mapDbError(error));

  await awardAmendmentBadgesBestEffort(
    parsed.data.matchId,
    subjectIds.map((playerId) => ({ playerId, before: beforeByPlayer.get(playerId) ?? { goals: 0, assists: 0 } })),
  );

  revalidatePath(`/g/${parsed.data.groupId}/partidos/${parsed.data.matchId}`);
  for (const playerId of subjectIds) revalidatePath(`/g/${parsed.data.groupId}/jugadores/${playerId}`);
  return ok(undefined);
}
