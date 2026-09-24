// Orchestrates lib/badges/engine.ts (pure) against a BadgesRepo -- mirrors the
// lib/server/tournaments.ts / lib/server/recompute.ts split so every function here is
// synchronously testable against an in-memory fake (badges.test.ts) and never touches Postgres
// itself. Call sites: lib/server/finalize-repo.ts (per finalized match), lib/server/tournaments.ts
// (tournament champion), lib/server/recompute-now.ts and finalize-repo.ts's recomputeCard (card
// badges) -- see the final report for exactly where each is wired and why.
import "server-only";
import {
  type BadgeCode,
  type CardTier,
  evaluateAmendmentBadges,
  evaluateCardBadges,
  evaluateMatchBadges,
  evaluateTournamentBadges,
} from "@/lib/badges/engine";
import type { BadgesRepo } from "./badges-repo";

export interface PlayerBadgeAward {
  playerId: string;
  code: BadgeCode;
  matchId?: string;
  tournamentId?: string;
}

/** Evaluates and persists match-triggered badges for one player, assuming their match_stats row
 * for `matchId` (and every prior finalized match) is already saved. Returns whatever was newly
 * awarded, for the caller to fan out `badge_awarded` notifications from. */
export async function awardMatchBadgesForPlayer(
  repo: BadgesRepo,
  playerId: string,
  badgesEnabled: boolean,
): Promise<PlayerBadgeAward[]> {
  if (!badgesEnabled) return [];
  const [history, existingBadges] = await Promise.all([
    repo.loadPlayerMatchHistory(playerId),
    repo.loadExistingBadgeCodes(playerId),
  ]);
  if (history.length === 0) return [];

  const awards = evaluateMatchBadges({ badgesEnabled, history, existingBadges });
  if (awards.length === 0) return [];

  await repo.saveAwards(playerId, awards);
  return awards.map((a) => ({ playerId, code: a.code, matchId: a.matchId, tournamentId: a.tournamentId }));
}

/** Same as awardMatchBadgesForPlayer, for every team player (role = 'player') on the finalized
 * match's roster -- spectators never earn match badges (they have no match_stats row either). */
export async function awardMatchBadges(repo: BadgesRepo, playerIds: readonly string[], badgesEnabled: boolean): Promise<PlayerBadgeAward[]> {
  const out: PlayerBadgeAward[] = [];
  for (const playerId of playerIds) {
    out.push(...(await awardMatchBadgesForPlayer(repo, playerId, badgesEnabled)));
  }
  return out;
}

/** Awards tournament_champion to every player on the winning entry's roster. */
export async function awardTournamentBadges(
  repo: BadgesRepo,
  championPlayerIds: readonly string[],
  tournamentId: string,
  badgesEnabled: boolean,
): Promise<PlayerBadgeAward[]> {
  const evaluated = evaluateTournamentBadges({ badgesEnabled, tournamentId, championPlayerIds });
  const out: PlayerBadgeAward[] = [];
  for (const { playerId, award } of evaluated) {
    await repo.saveAwards(playerId, [award]);
    out.push({ playerId, code: award.code, tournamentId: award.tournamentId });
  }
  return out;
}

/** gold_card / scout_10: evaluated against the player's CURRENT card tier + scouting-vote count,
 * independent of match history -- called after every card recompute (see the doc comment on
 * lib/server/recompute-now.ts and finalize-repo.ts's recomputeCard for exactly where). */
export async function awardCardBadges(
  repo: BadgesRepo,
  playerId: string,
  tier: CardTier,
  isProvisional: boolean,
  badgesEnabled: boolean,
): Promise<PlayerBadgeAward[]> {
  if (!badgesEnabled) return [];
  const [existingBadges, scoutingTargetCount] = await Promise.all([
    repo.loadExistingBadgeCodes(playerId),
    repo.loadScoutingTargetCount(playerId),
  ]);

  const awards = evaluateCardBadges({ badgesEnabled, tier, isProvisional, scoutingTargetCount, existingBadges });
  if (awards.length === 0) return [];

  await repo.saveAwards(playerId, awards);
  return awards.map((a) => ({ playerId, code: a.code }));
}

export interface StatAmendment {
  playerId: string;
  /** Goals/assists in the amended match before the amendment. */
  before: { goals: number; assists: number };
}

/** Awards badges newly earned because an admin assigned goals/assists of a finalized match
 * (see evaluateAmendmentBadges). Assumes the amendment is already persisted. */
export async function awardAmendmentBadges(
  repo: BadgesRepo,
  matchId: string,
  amendments: readonly StatAmendment[],
  badgesEnabled: boolean,
): Promise<PlayerBadgeAward[]> {
  if (!badgesEnabled) return [];
  const out: PlayerBadgeAward[] = [];
  for (const { playerId, before } of amendments) {
    const [history, existingBadges] = await Promise.all([
      repo.loadPlayerMatchHistory(playerId),
      repo.loadExistingBadgeCodes(playerId),
    ]);
    const awards = evaluateAmendmentBadges({ badgesEnabled, matchId, history, before, existingBadges });
    if (awards.length === 0) continue;
    await repo.saveAwards(playerId, awards);
    out.push(...awards.map((a) => ({ playerId, code: a.code, matchId })));
  }
  return out;
}
