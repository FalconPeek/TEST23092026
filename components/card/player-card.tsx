import { cn } from "cn";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { es } from "@/messages/es";

export type CardTier = "bronze" | "silver" | "gold" | "special";
export type PositionCode = keyof typeof es.positions;

export type OutfieldFace = {
  pac: number;
  sho: number;
  pas: number;
  dri: number;
  def: number;
  phy: number;
};

export type GkFace = {
  div: number;
  han: number;
  kic: number;
  ref: number;
  spd: number;
  pos: number;
};

export type PlayStyleBadge = { code: string; label: string; plus: boolean };

export type PlayerCardProps = {
  name: string;
  avatarUrl?: string | null;
  ovr: number;
  position: PositionCode;
  tier: CardTier;
  isProvisional: boolean;
  face: { kind: "outfield"; stats: OutfieldFace } | { kind: "gk"; stats: GkFace };
  weakFoot: 1 | 2 | 3 | 4 | 5;
  skillMoves: 1 | 2 | 3 | 4 | 5;
  preferredFoot?: "left" | "right" | "both";
  playStyles?: PlayStyleBadge[];
  size?: "sm" | "md" | "lg";
  className?: string;
};

type EffectiveTier = CardTier | "provisional";

const TIER_GRADIENT: Record<EffectiveTier, string> = {
  bronze: "from-tier-bronze-from to-tier-bronze-to",
  silver: "from-tier-silver-from to-tier-silver-to",
  gold: "from-tier-gold-from to-tier-gold-to",
  special: "from-tier-special-from to-tier-special-to",
  provisional: "from-tier-provisional-from to-tier-provisional-to",
};

const TIER_FG: Record<EffectiveTier, string> = {
  bronze: "text-tier-bronze-fg",
  silver: "text-tier-silver-fg",
  gold: "text-tier-gold-fg",
  special: "text-tier-special-fg",
  provisional: "text-tier-provisional-fg",
};

const TIER_ACCENT_BORDER: Record<EffectiveTier, string> = {
  bronze: "border-tier-bronze-accent",
  silver: "border-tier-silver-accent",
  gold: "border-tier-gold-accent",
  special: "border-tier-special-accent",
  provisional: "border-tier-provisional-accent",
};

const TIER_ACCENT_RING: Record<EffectiveTier, string> = {
  bronze: "ring-tier-bronze-accent",
  silver: "ring-tier-silver-accent",
  gold: "ring-tier-gold-accent",
  special: "ring-tier-special-accent",
  provisional: "ring-tier-provisional-accent",
};

const SIZE = {
  sm: {
    width: "w-[120px]",
    padding: "p-2",
    ovr: "text-2xl",
    pos: "text-[10px]",
    name: "text-[10px]",
    statLabel: "text-[7px]",
    statValue: "text-[11px]",
    footer: "text-[8px]",
    badge: "size-4 text-[7px]",
    avatarSize: "sm" as const,
    gap: "gap-0.5",
  },
  md: {
    width: "w-[200px]",
    padding: "p-3",
    ovr: "text-4xl",
    pos: "text-xs",
    name: "text-sm",
    statLabel: "text-[9px]",
    statValue: "text-sm",
    footer: "text-[10px]",
    badge: "size-5 text-[9px]",
    avatarSize: "default" as const,
    gap: "gap-1",
  },
  lg: {
    width: "w-[300px]",
    padding: "p-4",
    ovr: "text-6xl",
    pos: "text-base",
    name: "text-lg",
    statLabel: "text-xs",
    statValue: "text-lg",
    footer: "text-xs",
    badge: "size-6 text-xs",
    avatarSize: "lg" as const,
    gap: "gap-1.5",
  },
} as const;

const OUTFIELD_ORDER: (keyof OutfieldFace)[] = ["pac", "dri", "sho", "def", "pas", "phy"];
const GK_ORDER: (keyof GkFace)[] = ["div", "han", "kic", "ref", "spd", "pos"];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0] + parts[1]![0]).toUpperCase();
}

export function PlayerCard({
  name,
  avatarUrl,
  ovr,
  position,
  tier,
  isProvisional,
  face,
  weakFoot,
  skillMoves,
  playStyles = [],
  size = "md",
  className,
}: PlayerCardProps) {
  const effectiveTier: EffectiveTier = isProvisional ? "provisional" : tier;
  const s = SIZE[size];
  const positionLabel = es.positions[position];
  const statEntries: { key: string; value: number; label: string }[] =
    face.kind === "outfield"
      ? OUTFIELD_ORDER.map((key) => ({ key, value: face.stats[key], label: es.card.faceStats[key] }))
      : GK_ORDER.map((key) => ({ key, value: face.stats[key], label: es.card.gkStats[key] }));
  const visiblePlayStyles = playStyles.slice(0, 3);
  const showSheen = tier === "special" && !isProvisional;

  return (
    <figure
      aria-label={`${name}, ${ovr} ${positionLabel}`}
      className={cn(
        "fut-shield relative flex aspect-[5/7] flex-col overflow-hidden bg-gradient-to-b shadow-lg",
        TIER_GRADIENT[effectiveTier],
        TIER_FG[effectiveTier],
        s.width,
        s.padding,
        className,
      )}
    >
      {showSheen && (
        <>
          <style>{`
            @keyframes fut-card-sheen {
              0%, 100% { transform: translateX(-140%) skewX(-20deg); }
              60%, 100% { transform: translateX(140%) skewX(-20deg); }
            }
          `}</style>
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent motion-reduce:hidden"
              style={{ animation: "fut-card-sheen 3.5s ease-in-out infinite" }}
            />
          </div>
        </>
      )}

      <div className="relative flex items-start justify-between">
        <div className={cn("flex flex-col items-center", s.gap)}>
          <span className={cn("font-extrabold leading-none", s.ovr)}>{ovr}</span>
          <span className={cn("font-semibold tracking-wide uppercase", s.pos)}>{position}</span>
          {visiblePlayStyles.length > 0 && (
            <div className={cn("mt-1 flex flex-col", s.gap)}>
              {visiblePlayStyles.map((ps) => (
                <span
                  key={ps.code}
                  title={ps.label}
                  className={cn(
                    "flex items-center justify-center rounded-full bg-black/20 font-bold uppercase",
                    s.badge,
                    ps.plus && "ring-2",
                    ps.plus && TIER_ACCENT_RING[effectiveTier],
                  )}
                >
                  {ps.code.slice(0, 2)}
                </span>
              ))}
            </div>
          )}
        </div>

        <Avatar size={s.avatarSize} className={cn("border-2", TIER_ACCENT_BORDER[effectiveTier])}>
          {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
      </div>

      <div className={cn("relative mt-1 truncate text-center font-bold tracking-wide uppercase", s.name)}>
        {name}
      </div>

      {isProvisional && (
        <div className="relative flex justify-center">
          <span
            title={es.card.provisionalHint}
            className="rounded-full bg-black/25 px-2 py-0.5 text-[9px] font-semibold uppercase"
          >
            {es.card.tiers.provisional}
          </span>
        </div>
      )}

      <div className="relative mt-auto grid grid-cols-2 gap-x-2 gap-y-0.5 pt-2">
        {statEntries.map(({ key, value, label }) => (
          <div key={key} className="flex items-center gap-1">
            <span className={cn("font-bold tabular-nums", s.statValue)}>{value}</span>
            <span className={cn("font-medium tracking-wide uppercase opacity-80", s.statLabel)}>
              {label}
            </span>
          </div>
        ))}
      </div>

      <div
        className={cn(
          "relative mt-2 flex items-center justify-center gap-3 border-t border-current/20 pt-1.5",
          s.footer,
        )}
      >
        <span title={es.card.weakFoot}>
          {weakFoot}★ {es.card.weakFoot}
        </span>
        <span title={es.card.skillMoves}>
          {skillMoves}★ {es.card.skillMoves}
        </span>
      </div>
    </figure>
  );
}
