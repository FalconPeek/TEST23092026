// Pure badge-award engine: given a player's match history / card state / tournament outcome,
// decides which badges to award. No I/O -- lib/server/badges.ts loads state through BadgesRepo
// and persists whatever this returns. Mirrors lib/rating and lib/reconcile's "pure engine, I/O at
// the edges" split.

export const BADGE_CODES = [
  "first_match",
  "matches_10",
  "matches_50",
  "first_goal",
  "hat_trick",
  "goals_25",
  "assist_king",
  "mvp",
  "mvp_5",
  "clean_sheet",
  "clean_sheets_10",
  "streak_3_wins",
  "tournament_champion",
  "scout_10",
  "gold_card",
] as const;

export type BadgeCode = (typeof BADGE_CODES)[number];

const BADGE_CODE_SET: ReadonlySet<string> = new Set(BADGE_CODES);

export function isBadgeCode(value: string): value is BadgeCode {
  return BADGE_CODE_SET.has(value);
}

export interface BadgeAward {
  code: BadgeCode;
  matchId?: string;
  tournamentId?: string;
  /** true = repeatable badge: bump count/awarded_at/match_id on every occurrence (see
   * player_badges' doc comment in 20260923211703_badges_tables.sql). false = one-time: inserted
   * once, a no-op if the player already has it. */
  increment: boolean;
}

export type MatchOutcome = "win" | "draw" | "loss";

export interface MatchBadgeHistoryEntry {
  matchId: string;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  isMvp: boolean;
  result: MatchOutcome;
}

// Thresholds below are a fixed product/content decision (the badge catalog itself, seeded once in
// 20260923211703_badges_tables.sql), not a per-group tuning knob like rating weights or report
// windows: every group sees the same "first goal" / "25 goals" milestones, the same way a real
// trophy cabinet doesn't change shape per league. Group settings already carry a single on/off
// switch for the whole feature (`badges_enabled`, checked by every evaluate* function below); if
// a genuine need for per-group thresholds ever appears, add a `badges` block to
// lib/settings/group.ts then -- don't smuggle it in here as a silent default.
const MATCHES_10 = 10;
const MATCHES_50 = 50;
const GOALS_25 = 25;
// "assist_king" is a single-match feat (like hat_trick), per the badge catalog spec.
const ASSIST_KING_ASSISTS = 3;
const MVP_5 = 5;
const CLEAN_SHEETS_10 = 10;
const STREAK_LENGTH = 3;
const HAT_TRICK_GOALS = 3;
const SCOUT_10 = 10;

function sumBy(entries: readonly MatchBadgeHistoryEntry[], selector: (e: MatchBadgeHistoryEntry) => number): number {
  return entries.reduce((acc, e) => acc + selector(e), 0);
}

export interface EvaluateMatchBadgesInput {
  badgesEnabled: boolean;
  /** This player's finalized-match history, ascending by playedAt, with the just-finalized match
   * as the LAST entry (the one being evaluated "now"). */
  history: readonly MatchBadgeHistoryEntry[];
  /** Badge codes this player already holds -- guards one-time badges against re-award if this is
   * ever re-evaluated (e.g. a replay/backfill). */
  existingBadges: ReadonlySet<BadgeCode>;
}

/**
 * Awards are decided by comparing "before this match" vs "after this match" cumulative totals, so
 * a milestone fires exactly once, at the match where it's crossed -- calling this again for the
 * same history (idempotent replay) recomputes the identical crossing and, for one-time badges,
 * is additionally guarded by `existingBadges`.
 */
export function evaluateMatchBadges(input: EvaluateMatchBadgesInput): BadgeAward[] {
  const { badgesEnabled, history, existingBadges } = input;
  if (!badgesEnabled || history.length === 0) return [];

  const current = history[history.length - 1]!;
  const before = history.slice(0, -1);
  const notYetHeld = (code: BadgeCode) => !existingBadges.has(code);

  const goalsBefore = sumBy(before, (e) => e.goals);
  const goalsAfter = goalsBefore + current.goals;
  const mvpBefore = before.filter((e) => e.isMvp).length;
  const mvpAfter = mvpBefore + (current.isMvp ? 1 : 0);
  const cleanSheetsBefore = before.filter((e) => e.cleanSheet).length;
  const cleanSheetsAfter = cleanSheetsBefore + (current.cleanSheet ? 1 : 0);
  const matchesAfter = history.length;

  const awards: BadgeAward[] = [];
  const award = (code: BadgeCode, increment: boolean) => awards.push({ code, matchId: current.matchId, increment });

  if (matchesAfter === 1 && notYetHeld("first_match")) award("first_match", false);
  if (matchesAfter === MATCHES_10 && notYetHeld("matches_10")) award("matches_10", false);
  if (matchesAfter === MATCHES_50 && notYetHeld("matches_50")) award("matches_50", false);

  if (goalsBefore === 0 && goalsAfter > 0 && notYetHeld("first_goal")) award("first_goal", false);
  if (goalsBefore < GOALS_25 && goalsAfter >= GOALS_25 && notYetHeld("goals_25")) award("goals_25", false);
  if (current.goals >= HAT_TRICK_GOALS) award("hat_trick", true);

  if (current.assists >= ASSIST_KING_ASSISTS) award("assist_king", true);

  if (current.isMvp) award("mvp", true);
  if (mvpBefore < MVP_5 && mvpAfter >= MVP_5 && notYetHeld("mvp_5")) award("mvp_5", false);

  if (current.cleanSheet) award("clean_sheet", true);
  if (cleanSheetsBefore < CLEAN_SHEETS_10 && cleanSheetsAfter >= CLEAN_SHEETS_10 && notYetHeld("clean_sheets_10")) {
    award("clean_sheets_10", false);
  }

  // Consecutive wins ending at the CURRENT match; a draw or loss resets the streak to 0.
  // Repeatable: fires again every time a fresh multiple of STREAK_LENGTH is reached (3, 6, 9, ...)
  // so a long unbeaten run keeps paying out instead of only once.
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]!.result !== "win") break;
    streak += 1;
  }
  if (streak > 0 && streak % STREAK_LENGTH === 0) award("streak_3_wins", true);

  return awards;
}

export interface EvaluateTournamentBadgesInput {
  badgesEnabled: boolean;
  tournamentId: string;
  /** player_ids of the winning entry (tournament_entries.player_ids). */
  championPlayerIds: readonly string[];
}

export interface TournamentBadgeAward {
  playerId: string;
  award: BadgeAward;
}

/** tournament_champion is repeatable (a player who wins multiple tournaments keeps bumping the
 * same row's count), so every champion always gets an award here -- there is no "already holds
 * it" guard, unlike the one-time badges in evaluateMatchBadges/evaluateCardBadges. */
export function evaluateTournamentBadges(input: EvaluateTournamentBadgesInput): TournamentBadgeAward[] {
  if (!input.badgesEnabled) return [];
  return input.championPlayerIds.map((playerId) => ({
    playerId,
    award: { code: "tournament_champion", tournamentId: input.tournamentId, increment: true },
  }));
}

export interface EvaluateAmendmentBadgesInput {
  badgesEnabled: boolean;
  /** The amended match. */
  matchId: string;
  /** The player's finalized-match history AFTER the amendment (any order). */
  history: readonly MatchBadgeHistoryEntry[];
  /** The player's goals/assists in the amended match BEFORE the amendment. */
  before: { goals: number; assists: number };
  existingBadges: ReadonlySet<BadgeCode>;
}

/**
 * An admin assigned previously unattributed goals/assists of a finalized match. Career milestones
 * are checked against the new totals (a one-time badge can't be double-awarded thanks to
 * `existingBadges`), and the single-match feats fire only if the amendment is what crossed the
 * threshold. Badges are never revoked here: amendments only fill in the record.
 */
export function evaluateAmendmentBadges(input: EvaluateAmendmentBadgesInput): BadgeAward[] {
  const { badgesEnabled, matchId, history, before, existingBadges } = input;
  if (!badgesEnabled) return [];
  const amended = history.find((e) => e.matchId === matchId);
  if (!amended) return [];

  const awards: BadgeAward[] = [];
  const award = (code: BadgeCode, increment: boolean) => awards.push({ code, matchId, increment });
  const totalGoals = sumBy(history, (e) => e.goals);

  if (totalGoals > 0 && !existingBadges.has("first_goal")) award("first_goal", false);
  if (totalGoals >= GOALS_25 && !existingBadges.has("goals_25")) award("goals_25", false);
  if (before.goals < HAT_TRICK_GOALS && amended.goals >= HAT_TRICK_GOALS) award("hat_trick", true);
  if (before.assists < ASSIST_KING_ASSISTS && amended.assists >= ASSIST_KING_ASSISTS) award("assist_king", true);

  return awards;
}

export type CardTier = "bronze" | "silver" | "gold" | "special";

export interface EvaluateCardBadgesInput {
  badgesEnabled: boolean;
  tier: CardTier;
  /** Provisional (grey, < min_raters) cards never count as a real "gold card" yet. */
  isProvisional: boolean;
  /** Distinct players this player has cast a scouting vote for, ever. */
  scoutingTargetCount: number;
  existingBadges: ReadonlySet<BadgeCode>;
}

/** gold_card and scout_10 don't depend on match history, only on the player's current card/vote
 * state, so they're evaluated separately from evaluateMatchBadges (see lib/server/recompute.ts's
 * call site for why: they're checked on every card recompute, not only on match finalize). */
export function evaluateCardBadges(input: EvaluateCardBadgesInput): BadgeAward[] {
  if (!input.badgesEnabled) return [];
  const awards: BadgeAward[] = [];

  if (!input.isProvisional && (input.tier === "gold" || input.tier === "special") && !input.existingBadges.has("gold_card")) {
    awards.push({ code: "gold_card", increment: false });
  }
  if (input.scoutingTargetCount >= SCOUT_10 && !input.existingBadges.has("scout_10")) {
    awards.push({ code: "scout_10", increment: false });
  }

  return awards;
}
