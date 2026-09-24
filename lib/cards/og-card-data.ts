// Pure data-shaping for app/api/og/card/[playerId]/route.tsx: turns the same
// (player identity, player_cards row) pair as lib/cards/to-card-props.ts into what the OG image
// needs to render (label text + tier -> literal hex colors, since the ImageResponse/Satori
// renderer doesn't understand this app's oklch() CSS custom properties from app/globals.css).
import { z } from "zod";
import { es } from "@/messages/es";
import { toCardProps, type CardRow, type PlayerForCard } from "./to-card-props";
import type { CardTier, PlayerCardProps } from "@/components/card/player-card";

export const ogCardParamsSchema = z.object({ playerId: z.uuid() });

export type TierColors = { from: string; to: string; fg: string; accent: string };

/** sRGB hex equivalents of the oklch() tier tokens in app/globals.css (--tier-*-from/to/fg/accent),
 * computed once via the CSS Color 4 OKLCH->sRGB conversion -- keep in sync if those tokens change. */
export const OG_TIER_COLORS: Record<CardTier | "provisional", TierColors> = {
  bronze: { from: "#ac6734", to: "#692f1a", fg: "#fdf3eb", accent: "#d77e49" },
  silver: { from: "#d3d8de", to: "#8c939b", fg: "#0e1216", accent: "#b0b8c1" },
  gold: { from: "#fdce4e", to: "#d48300", fg: "#241100", accent: "#efa810" },
  special: { from: "#7a31ca", to: "#00949f", fg: "#f2f4ff", accent: "#59a1ff" },
  provisional: { from: "#595e63", to: "#2f3338", fg: "#dedede", accent: "#6d7277" },
};

export interface OgCardData {
  card: PlayerCardProps;
  positionLabel: string;
  tierLabel: string;
  colors: TierColors;
}

/** Returns null when there's no card yet (no votes) or the row is malformed -- same cases
 * toCardProps already returns null for, which the route maps to a 404. */
export function buildOgCardData(player: PlayerForCard, cardRow: CardRow | null): OgCardData | null {
  const card = toCardProps(player, cardRow, es.playstyles);
  if (!card) return null;

  const effectiveTier = card.isProvisional ? "provisional" : card.tier;

  return {
    card,
    positionLabel: es.positions[card.position],
    tierLabel: card.isProvisional ? es.card.tiers.provisional : es.card.tiers[card.tier],
    colors: OG_TIER_COLORS[effectiveTier],
  };
}
