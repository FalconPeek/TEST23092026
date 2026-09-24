import { POSITIONS, type PositionCode } from "@/lib/rating/positions";
import type { SquadSettings } from "@/lib/settings/group";
import { findFormation, type Formation, type TeamSize } from "./formations";
import { pairKey, squadChemistry, teamRating, slotOvr, type SquadChemistry, type SquadPlayer, type TeamRating } from "./rating";

/** Raw rows the pages load (RLS-scoped); kept structural so both RSC and OG routes can feed it. */
export interface PlayerRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  primary_position: string | null;
  alt_positions: string[] | null;
}
export interface CardRow {
  player_id: string;
  ovr: number;
  ovr_by_position: unknown;
  tier: string;
  is_provisional: boolean;
}
export interface ClubPlayerRow {
  club_id: string;
  player_id: string;
}
export interface SharedAppearanceRow {
  player_a: string;
  player_b: string;
  matches: number;
}

export interface SquadContext {
  players: Map<string, SquadPlayer & { name: string; avatarUrl: string | null; tier: string | null; provisional: boolean }>;
  shared: Map<string, number>;
}

const isPosition = (v: unknown): v is PositionCode => typeof v === "string" && (POSITIONS as readonly string[]).includes(v);

function ovrMap(raw: unknown): Partial<Record<PositionCode, number>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<PositionCode, number>> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isPosition(key) && typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

export function buildSquadContext(
  players: PlayerRow[],
  cards: CardRow[],
  clubPlayers: ClubPlayerRow[],
  shared: SharedAppearanceRow[],
): SquadContext {
  const cardByPlayer = new Map(cards.map((c) => [c.player_id, c]));
  const clubsByPlayer = new Map<string, string[]>();
  for (const cp of clubPlayers) clubsByPlayer.set(cp.player_id, [...(clubsByPlayer.get(cp.player_id) ?? []), cp.club_id]);

  const map: SquadContext["players"] = new Map();
  for (const p of players) {
    const card = cardByPlayer.get(p.id);
    map.set(p.id, {
      playerId: p.id,
      name: p.display_name,
      avatarUrl: p.avatar_url,
      primaryPosition: isPosition(p.primary_position) ? p.primary_position : null,
      altPositions: (p.alt_positions ?? []).filter(isPosition),
      ovrByPosition: ovrMap(card?.ovr_by_position),
      ovr: card?.ovr ?? null,
      clubIds: clubsByPlayer.get(p.id) ?? [],
      tier: card?.tier ?? null,
      provisional: card?.is_provisional ?? true,
    });
  }
  return { players: map, shared: new Map(shared.map((r) => [pairKey(r.player_a, r.player_b), r.matches])) };
}

export interface SquadSlotView {
  slot: number;
  position: PositionCode;
  x: number;
  y: number;
  player: { id: string; name: string; avatarUrl: string | null; ovr: number; tier: string | null; provisional: boolean; chemistry: number } | null;
}

export interface SquadView {
  formation: Formation;
  slots: SquadSlotView[];
  rating: TeamRating;
  chemistry: SquadChemistry;
}

/**
 * Lays a stored squad onto its formation. Returns null for a formation the catalog doesn't know
 * (e.g. removed later). Slots whose player left the group or is otherwise unknown render empty.
 */
export function buildSquadView(
  squad: { team_size: number; formation: string; slots: { slot: number; player_id: string }[] },
  context: SquadContext,
  settings: SquadSettings,
): SquadView | null {
  const formation = findFormation(squad.team_size as TeamSize, squad.formation);
  if (!formation) return null;

  const assignment = new Map<number, SquadPlayer>();
  for (const s of squad.slots) {
    const player = context.players.get(s.player_id);
    if (player && formation.slots.some((f) => f.slot === s.slot)) assignment.set(s.slot, player);
  }

  const rating = teamRating(formation, assignment);
  const chemistry = squadChemistry(formation, assignment, context.shared, settings);
  const chemBySlot = new Map(chemistry.players.map((c) => [c.slot, c.total]));

  return {
    formation,
    rating,
    chemistry,
    slots: formation.slots.map((f) => {
      const p = assignment.get(f.slot);
      const info = p ? context.players.get(p.playerId)! : null;
      return {
        slot: f.slot,
        position: f.position,
        x: f.x,
        y: f.y,
        player: info
          ? {
              id: info.playerId,
              name: info.name,
              avatarUrl: info.avatarUrl,
              ovr: slotOvr(info, f.position),
              tier: info.tier,
              provisional: info.provisional,
              chemistry: chemBySlot.get(f.slot) ?? 0,
            }
          : null,
      };
    }),
  };
}
