// Server-side card recompute pipeline: turns stored votes (via RatingRepo) into derived rows,
// using the pure functions in lib/rating. No I/O happens here directly — everything goes
// through the injected repo, which is what makes this file testable with an in-memory fake.
import {
  GK_ATTRIBUTES,
  OUTFIELD_ATTRIBUTES,
  OUTFIELD_FACE_STATS,
  POSITIONS,
  aggregateAttribute,
  buildPlayerCard,
  collusionPairs as computeCollusionPairsPure,
  computeFormAdjustments,
  expandScoutingVotes,
  finalizeAttributeValue,
  isGoalkeeperPosition,
  mean,
  raterStats as computeRaterStatsPure,
  stdDev,
  subAttributesOfFaceStat,
} from "@/lib/rating";
import type {
  AttributeKey,
  CollusionPair,
  MatchFormInput,
  OutfieldFaceStat,
  PositionCode,
  RaterOverallResidual,
  RaterPairResidual,
  RaterStat,
} from "@/lib/rating";
import type { RatingSettings } from "@/lib/settings/group";
import type {
  AttributeHistorySnapshot,
  AttributeSaveRow,
  GroupScoutingVote,
  HistoryReason,
  RatingRepo,
} from "./rating-repo";

const DEFAULT_POSITION: PositionCode = "MC"; // fallback when a player has no (valid) primary_position yet

function normalizePosition(raw: string | null): PositionCode {
  return (POSITIONS as readonly string[]).includes(raw ?? "") ? (raw as PositionCode) : DEFAULT_POSITION;
}

function isFaceStatCode(attribute: string): attribute is OutfieldFaceStat {
  return (OUTFIELD_FACE_STATS as readonly string[]).includes(attribute);
}

/** Group-wide mean per attribute, from every player's current attribute_ratings row. Used as
 * the Bayesian shrinkage target C (falls back to settings.default_mean when nobody has a value
 * for that attribute yet, e.g. a brand-new group). */
function computeGroupMeans(ratings: Map<string, Partial<Record<AttributeKey, number>>>): Partial<Record<AttributeKey, number>> {
  const sums = new Map<AttributeKey, { sum: number; n: number }>();
  for (const attrs of ratings.values()) {
    for (const [attr, value] of Object.entries(attrs) as [AttributeKey, number][]) {
      const agg = sums.get(attr) ?? { sum: 0, n: 0 };
      agg.sum += value;
      agg.n += 1;
      sums.set(attr, agg);
    }
  }
  const out: Partial<Record<AttributeKey, number>> = {};
  for (const [attr, agg] of sums) out[attr] = agg.sum / agg.n;
  return out;
}

interface ExpandedGroupVote {
  raterId: string;
  targetId: string;
  attribute: AttributeKey;
  value: number;
}

/** Quick-mode face-stat votes expand to every sub-attribute they feed, same rule as
 * expandScoutingVotes in lib/rating/aggregate.ts, but keeping targetId around for group-wide
 * residual computation (that pure function only tracks rater/value/attribute). */
function expandGroupVotes(votes: GroupScoutingVote[]): ExpandedGroupVote[] {
  const out: ExpandedGroupVote[] = [];
  for (const v of votes) {
    const attrs = isFaceStatCode(v.attribute) ? subAttributesOfFaceStat(v.attribute) : [v.attribute as AttributeKey];
    for (const attr of attrs) out.push({ raterId: v.raterId, targetId: v.targetId, attribute: attr, value: v.value });
  }
  return out;
}

/** Sum of absolute changes already applied to `attr` within the supplied window (ascending
 * snapshots), used as the "already applied" side of the rolling 30-day rate limit. Summing
 * consecutive deltas (rather than just endpoint-to-endpoint) counts genuine back-and-forth
 * movement, not just net displacement. */
function sumRecentChange(attr: AttributeKey, history: AttributeHistorySnapshot[]): number {
  const values = history.map((h) => h.attrs[attr]).filter((v): v is number => v !== undefined);
  let total = 0;
  for (let i = 1; i < values.length; i += 1) total += Math.abs(values[i] - values[i - 1]);
  return total;
}

export interface GroupRaterStatsResult {
  raterStats: RaterStat[];
  collusionPairs: CollusionPair[];
}

/**
 * Residual for a vote = scaled value − the leave-one-out mean of every OTHER rater's current
 * scaled vote on the same (target, attribute). Deliberately has no dependency on stored
 * consensus (attribute_ratings) or the group default mean: comparing a brand-new group's
 * first-ever votes against a meaningless fallback (e.g. the 60 default) would manufacture a
 * "bias" out of nothing but genuine, agreeing opinions. Skipped when fewer than 2 OTHER raters voted
 * the same pair (i.e. fewer than 3 raters total) — with that few peers, "the others' mean" is
 * not a trustworthy reference either way, for either side of the comparison.
 */
function computeLeaveOneOutResiduals(
  votes: GroupScoutingVote[],
  settings: RatingSettings,
): { raterId: string; targetId: string; residual: number }[] {
  const groups = new Map<string, { raterId: string; scaled: number }[]>();
  for (const v of expandGroupVotes(votes)) {
    const scaled = settings.scale_offset + settings.scale_factor * v.value;
    const key = `${v.targetId}|${v.attribute}`;
    const list = groups.get(key) ?? [];
    list.push({ raterId: v.raterId, scaled });
    groups.set(key, list);
  }

  const residuals: { raterId: string; targetId: string; residual: number }[] = [];
  for (const [key, entries] of groups) {
    if (entries.length < 3) continue;
    const targetId = key.slice(0, key.indexOf("|"));
    const total = entries.reduce((sum, e) => sum + e.scaled, 0);
    for (const entry of entries) {
      const othersMean = (total - entry.scaled) / (entries.length - 1);
      residuals.push({ raterId: entry.raterId, targetId, residual: entry.scaled - othersMean });
    }
  }
  return residuals;
}

/**
 * Recomputes bias/reliability for every rater active in the group and detects colluding pairs.
 * Persists rater_stats + collusion_flags. Must run before recomputePlayer for the same group so
 * the latter reads fresh values.
 */
export async function recomputeGroupRaterStats(repo: RatingRepo, groupId: string, now: Date): Promise<GroupRaterStatsResult> {
  void now; // kept for signature symmetry with recomputePlayer/drainRecomputeQueue; rater bias/
  // reliability (lib/rating/rater-stats.ts) has no recency term today, unlike vote aggregation.
  const settings = await repo.loadGroupSettings(groupId);
  const votes = await repo.loadGroupScoutingVotes(groupId);

  // Gate bias_min_votes on raw ballots cast (one scouting_votes row = one raw ballot, whether
  // detailed or quick), NOT on the expanded sub-attribute count — a single quick vote must not
  // look like 6-29 votes just because it fans out to that many sub-attributes.
  const rawVoteCounts = new Map<string, number>();
  for (const v of votes) rawVoteCounts.set(v.raterId, (rawVoteCounts.get(v.raterId) ?? 0) + 1);

  const residuals = computeLeaveOneOutResiduals(votes, settings.rating);

  const statsMap = computeRaterStatsPure(
    residuals.map((r) => ({ raterId: r.raterId, residual: r.residual })),
    settings.rating,
    undefined,
    rawVoteCounts,
  );

  const pairSums = new Map<string, { sum: number; n: number }>();
  const overallResiduals = new Map<string, number[]>();
  for (const r of residuals) {
    const pairKey = `${r.raterId}|${r.targetId}`;
    const pair = pairSums.get(pairKey) ?? { sum: 0, n: 0 };
    pair.sum += r.residual;
    pair.n += 1;
    pairSums.set(pairKey, pair);

    const list = overallResiduals.get(r.raterId) ?? [];
    list.push(r.residual);
    overallResiduals.set(r.raterId, list);
  }

  const pairResiduals: RaterPairResidual[] = [...pairSums.entries()].map(([key, agg]) => {
    const [raterId, targetId] = key.split("|");
    return { raterId, targetId, meanResidual: agg.sum / agg.n };
  });
  const overall = new Map<string, RaterOverallResidual>();
  for (const [raterId, values] of overallResiduals) {
    overall.set(raterId, { raterId, meanResidual: mean(values), stdResidual: stdDev(values) });
  }

  const flaggedPairs = computeCollusionPairsPure(pairResiduals, overall, settings.rating);
  const statsList = [...statsMap.values()];

  await repo.saveRaterStats(groupId, statsList);
  await repo.replaceCollusionFlags(groupId, flaggedPairs);

  return { raterStats: statsList, collusionPairs: flaggedPairs };
}

/**
 * Recomputes one player's full card: expands quick votes, aggregates every sub-attribute of
 * their category (outfield vs GK) with bias/reliability/collusion/group-mean shrinkage, applies
 * match form and rate limiting, builds the FUT card, and persists everything. Reads rater
 * bias/reliability/collusion from what recomputeGroupRaterStats last persisted for this group —
 * run that first (drainRecomputeQueue does).
 */
export async function recomputePlayer(
  repo: RatingRepo,
  playerId: string,
  now: Date,
  formMatches: MatchFormInput[] = [],
  reason: HistoryReason = "scouting",
): Promise<void> {
  const player = await repo.loadPlayer(playerId);
  if (!player) throw new Error(`recomputePlayer: unknown player ${playerId}`);

  const settings = await repo.loadGroupSettings(player.groupId);
  const position = normalizePosition(player.primaryPosition);
  // A player's category never mixes: GK sub-attributes and outfield sub-attributes are tracked
  // separately so a group's outfield players don't dilute the GK attribute means (and vice
  // versa) with default-mean filler rows they were never actually rated on.
  const categoryAttributes: AttributeKey[] = isGoalkeeperPosition(position) ? [...GK_ATTRIBUTES] : [...OUTFIELD_ATTRIBUTES];

  const [targetVotes, groupRatings, raterStatsMap, collusionSet, context, wasMvp] = await Promise.all([
    repo.loadTargetVotes(player.groupId, playerId),
    repo.loadGroupAttributeRatings(player.groupId),
    repo.loadRaterStats(player.groupId),
    repo.loadCollusionFlags(player.groupId),
    repo.loadPlayerRatingContext(playerId, now),
    repo.wasMvpLastMatch(playerId),
  ]);

  const groupMeans = computeGroupMeans(groupRatings);
  const raterBias = new Map<string, number>();
  const raterReliability = new Map<string, number>();
  for (const [id, stat] of raterStatsMap) {
    // rater-stats.ts already zeroes bias / neutralizes reliability below bias_min_votes, so it
    // is safe to always include every known rater here.
    raterBias.set(id, stat.bias);
    raterReliability.set(id, stat.reliability);
  }

  const expandedVotes = expandScoutingVotes(
    targetVotes.scouting.map((v) => ({
      raterId: v.raterId,
      attribute: v.attribute as AttributeKey | OutfieldFaceStat,
      value: v.value,
      createdAt: v.createdAt,
      raterRole: v.raterRole,
    })),
  );

  const formAdjustments = computeFormAdjustments(now, position, formMatches, settings.rating);

  const attributes: Partial<Record<AttributeKey, number>> = {};
  const saveRows: AttributeSaveRow[] = [];
  for (const attr of categoryAttributes) {
    const votesForAttr = expandedVotes.get(attr) ?? [];
    const aggregate = aggregateAttribute(votesForAttr, {
      now,
      settings: settings.rating,
      targetId: playerId,
      raterBias,
      raterReliability,
      collusionPairs: collusionSet,
      groupMean: groupMeans[attr] ?? settings.rating.default_mean,
    });

    const finalValue = finalizeAttributeValue(
      {
        base: aggregate.value,
        form: formAdjustments[attr] ?? 0,
        previousValue: context.previousAttributes[attr],
        changeInLast30Days: sumRecentChange(attr, context.history30d),
      },
      settings.rating,
    );

    attributes[attr] = finalValue;
    saveRows.push({ attribute: attr, value: finalValue, nVotes: aggregate.nVotes, nRaters: aggregate.nRaters });
  }

  const nDistinctRaters = new Set(targetVotes.scouting.map((v) => v.raterId)).size;

  const card = buildPlayerCard(
    {
      attributes,
      primaryPosition: position,
      nDistinctRaters,
      weakFootVotes: targetVotes.weakFootVotes,
      skillMovesVotes: targetVotes.skillMovesVotes,
      playStyleVotes: targetVotes.playstyle.map((p) => ({ code: p.code, raterId: p.raterId })),
      totalPlaystyleRaters: nDistinctRaters,
      wasMvpLastMatch: wasMvp,
    },
    settings,
  );

  const changed =
    card.ovr !== context.previousOvr || saveRows.some((row) => context.previousAttributes[row.attribute] !== row.value);

  await repo.savePlayerCard({
    playerId,
    groupId: player.groupId,
    attributes: saveRows,
    card: {
      position: card.position,
      ovr: card.ovr,
      ovrByPosition: card.ovrByPosition,
      tier: card.tier,
      isProvisional: card.isProvisional,
      weakFoot: card.weakFoot,
      skillMoves: card.skillMoves,
      playStyles: card.playStyles,
      faceStats: card.faceStats,
    },
    nDistinctRaters,
    now,
    changed,
    historyReason: reason,
  });
}

export interface DrainOptions {
  limit: number;
  now: Date;
}

export interface DrainFailure {
  playerId: string;
  error: string;
}

export interface DrainResult {
  groupsProcessed: number;
  playersProcessed: number;
  playersSucceeded: number;
  playersFailed: number;
  failures: DrainFailure[];
}

/**
 * Processes up to `limit` queued players: rater stats are refreshed once per distinct group
 * (cheaper, and recomputePlayer depends on the result), then each player is recomputed. A
 * player-level failure is collected and does not stop the rest of the batch or other groups;
 * it is left in the queue (savePlayerCard only dequeues on success) so the next drain retries it.
 */
export async function drainRecomputeQueue(repo: RatingRepo, options: DrainOptions): Promise<DrainResult> {
  const batch = await repo.loadQueueBatch(options.limit);

  const byGroup = new Map<string, string[]>();
  for (const entry of batch) {
    const list = byGroup.get(entry.groupId) ?? [];
    list.push(entry.playerId);
    byGroup.set(entry.groupId, list);
  }

  const failures: DrainFailure[] = [];
  let succeeded = 0;

  for (const [groupId, playerIds] of byGroup) {
    await recomputeGroupRaterStats(repo, groupId, options.now);
    for (const playerId of playerIds) {
      try {
        await recomputePlayer(repo, playerId, options.now);
        succeeded += 1;
      } catch (err) {
        failures.push({ playerId, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return {
    groupsProcessed: byGroup.size,
    playersProcessed: batch.length,
    playersSucceeded: succeeded,
    playersFailed: failures.length,
    failures,
  };
}
