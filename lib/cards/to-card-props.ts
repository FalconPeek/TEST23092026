// Pure mapper: a `player_cards` row (+ the player's identity) -> PlayerCardProps for
// components/card/player-card.tsx, or null when there's no card yet / the row is malformed.

import { z } from "zod";
import type {
  CardTier,
  GkFace,
  OutfieldFace,
  PlayerCardProps,
  PlayStyleBadge,
} from "@/components/card/player-card";
import { POSITIONS, type PositionCode } from "@/lib/rating/positions";
import { TIERS } from "@/lib/rating/tiers";
import { isPlayStyleCode } from "@/lib/rating/playstyles";

const outfieldFaceSchema = z.object({
  pac: z.number(),
  sho: z.number(),
  pas: z.number(),
  dri: z.number(),
  def: z.number(),
  phy: z.number(),
});

const gkFaceSchema = z.object({
  div: z.number(),
  han: z.number(),
  kic: z.number(),
  ref: z.number(),
  spd: z.number(),
  pos: z.number(),
});

const playstylesSchema = z.array(z.object({ code: z.string(), plus: z.boolean() }));
const positionSchema = z.enum(POSITIONS);
const tierSchema = z.enum(TIERS);

/** Median star vote rounded to an integer, clamped to 1-5; no votes yet defaults to 3. */
function clampStar(value: number | null): 1 | 2 | 3 | 4 | 5 {
  if (value === null) return 3;
  return Math.min(5, Math.max(1, Math.round(value))) as 1 | 2 | 3 | 4 | 5;
}

export type CardRow = {
  ovr: number;
  position: string | null;
  tier: string;
  is_provisional: boolean;
  face: unknown;
  playstyles: unknown;
  weak_foot: number | null;
  skill_moves: number | null;
};

export type PlayerForCard = {
  displayName: string;
  avatarUrl?: string | null;
  preferredFoot?: "left" | "right" | "both" | null;
};

export function toCardProps(
  player: PlayerForCard,
  cardRow: CardRow | null,
  playstyleLabels: Record<string, string>,
): PlayerCardProps | null {
  if (!cardRow) return null;

  const position = positionSchema.safeParse(cardRow.position);
  if (!position.success) return null;

  const tier = tierSchema.safeParse(cardRow.tier);
  if (!tier.success) return null;

  const face = toFace(cardRow.face);
  if (!face) return null;

  const playstylesResult = playstylesSchema.safeParse(cardRow.playstyles);
  const playStyles: PlayStyleBadge[] = playstylesResult.success
    ? playstylesResult.data
        .filter((p) => isPlayStyleCode(p.code))
        .map((p) => ({ code: p.code, label: playstyleLabels[p.code] ?? p.code, plus: p.plus }))
    : [];

  return {
    name: player.displayName,
    avatarUrl: player.avatarUrl,
    ovr: cardRow.ovr,
    position: position.data as PositionCode,
    tier: tier.data as CardTier,
    isProvisional: cardRow.is_provisional,
    face,
    weakFoot: clampStar(cardRow.weak_foot),
    skillMoves: clampStar(cardRow.skill_moves),
    preferredFoot: player.preferredFoot ?? undefined,
    playStyles,
  };
}

function toFace(
  raw: unknown,
): { kind: "outfield"; stats: OutfieldFace } | { kind: "gk"; stats: GkFace } | null {
  const outfield = outfieldFaceSchema.safeParse(raw);
  if (outfield.success) return { kind: "outfield", stats: outfield.data };

  const gk = gkFaceSchema.safeParse(raw);
  if (gk.success) return { kind: "gk", stats: gk.data };

  return null;
}
