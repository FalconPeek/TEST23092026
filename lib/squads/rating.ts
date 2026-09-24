import type { PositionCode } from "@/lib/rating/positions";
import type { SquadSettings } from "@/lib/settings/group";
import type { Formation } from "./formations";

/** What the squad engine needs to know about a player placed in a slot. */
export interface SquadPlayer {
  playerId: string;
  primaryPosition: PositionCode | null;
  altPositions: readonly PositionCode[];
  /** OVR per position from player_cards.ovr_by_position; empty when the player has no card yet. */
  ovrByPosition: Partial<Record<PositionCode, number>>;
  /** Card OVR at the primary position, used when a position is missing from ovrByPosition. */
  ovr: number | null;
  clubIds: readonly string[];
}

/** slot index → player (unfilled slots are simply absent). */
export type SquadAssignment = ReadonlyMap<number, SquadPlayer>;

/** Rating a card-less player counts with (same neutral prior the rating engine starts from). */
export const DEFAULT_SLOT_OVR = 60;

export function slotOvr(player: SquadPlayer, position: PositionCode): number {
  return player.ovrByPosition[position] ?? player.ovr ?? DEFAULT_SLOT_OVR;
}

export interface TeamRating {
  /** FUT-style team rating over the filled slots (0 when empty). */
  rating: number;
  filled: number;
  complete: boolean;
}

/**
 * FUT-style team rating: every player counts at the OVR of the position they occupy, and players
 * above the squad average add their surplus once more, so a couple of stars lift the team a bit
 * more than a plain mean would. Computed over filled slots so a half-built squad still shows a
 * meaningful number; `complete` tells the UI whether every slot is filled.
 */
export function teamRating(formation: Formation, assignment: SquadAssignment): TeamRating {
  const ovrs = formation.slots.flatMap((s) => {
    const player = assignment.get(s.slot);
    return player ? [slotOvr(player, s.position)] : [];
  });
  if (ovrs.length === 0) return { rating: 0, filled: 0, complete: false };

  const sum = ovrs.reduce((a, b) => a + b, 0);
  const mean = sum / ovrs.length;
  const surplus = ovrs.reduce((a, r) => a + Math.max(0, r - mean), 0);
  return {
    rating: Math.min(99, Math.round((sum + surplus) / ovrs.length)),
    filled: ovrs.length,
    complete: ovrs.length === formation.slots.length,
  };
}

export interface PlayerChemistry {
  slot: number;
  playerId: string;
  position: number;
  link: number;
  club: number;
  total: number;
}

export interface SquadChemistry {
  players: PlayerChemistry[];
  total: number;
  max: number;
}

/** Order-independent key for a pair of players. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Per-player chemistry (0..chem_max_per_player), adapted from FUT to real football among friends:
 * - position: playing their primary position, or one of their alternates;
 * - link: having played at least `link_min_matches` finalized matches on the same side as another
 *   squad member (the friends' version of "same club/league");
 * - club: at least `club_min` squad members (including the player) share one of their clubs.
 * `sharedAppearances` maps pairKey(a, b) → number of finalized matches a and b played together.
 */
export function squadChemistry(
  formation: Formation,
  assignment: SquadAssignment,
  sharedAppearances: ReadonlyMap<string, number>,
  settings: SquadSettings,
): SquadChemistry {
  const placed = formation.slots.flatMap((s) => {
    const player = assignment.get(s.slot);
    return player ? [{ slot: s, player }] : [];
  });

  const clubCounts = new Map<string, number>();
  for (const { player } of placed) {
    for (const clubId of new Set(player.clubIds)) clubCounts.set(clubId, (clubCounts.get(clubId) ?? 0) + 1);
  }

  const players = placed.map(({ slot, player }): PlayerChemistry => {
    const position =
      player.primaryPosition === slot.position
        ? settings.chem_primary_position
        : player.altPositions.includes(slot.position)
          ? settings.chem_alt_position
          : 0;
    const linked = placed.some(
      (other) =>
        other.player.playerId !== player.playerId &&
        (sharedAppearances.get(pairKey(player.playerId, other.player.playerId)) ?? 0) >= settings.link_min_matches,
    );
    const link = linked ? settings.chem_link : 0;
    const club = player.clubIds.some((c) => (clubCounts.get(c) ?? 0) >= settings.club_min) ? settings.chem_club : 0;
    return {
      slot: slot.slot,
      playerId: player.playerId,
      position,
      link,
      club,
      total: Math.min(settings.chem_max_per_player, position + link + club),
    };
  });

  return {
    players,
    total: players.reduce((a, p) => a + p.total, 0),
    max: settings.chem_max_per_player * formation.slots.length,
  };
}

export type SquadValidationError = "unknown_slot" | "duplicate_player";

/** A squad is valid when every slot index exists in the formation and no player repeats. */
export function validateAssignment(formation: Formation, assignment: SquadAssignment): SquadValidationError | null {
  const slots = new Set(formation.slots.map((s) => s.slot));
  for (const slot of assignment.keys()) if (!slots.has(slot)) return "unknown_slot";
  const ids = [...assignment.values()].map((p) => p.playerId);
  if (new Set(ids).size !== ids.length) return "duplicate_player";
  return null;
}
