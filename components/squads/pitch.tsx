import { cn } from "cn";
import { es } from "@/messages/es";
import type { SquadSlotView } from "@/lib/squads/view";

const TIER_GRADIENT: Record<string, string> = {
  bronze: "from-tier-bronze-from to-tier-bronze-to text-tier-bronze-fg",
  silver: "from-tier-silver-from to-tier-silver-to text-tier-silver-fg",
  gold: "from-tier-gold-from to-tier-gold-to text-tier-gold-fg",
  special: "from-tier-special-from to-tier-special-to text-tier-special-fg",
  provisional: "from-tier-provisional-from to-tier-provisional-to text-tier-provisional-fg",
};

function tierClasses(tier: string | null, provisional: boolean): string {
  return TIER_GRADIENT[provisional ? "provisional" : (tier ?? "provisional")] ?? TIER_GRADIENT.provisional!;
}

/**
 * Server-safe presentational pitch: slot markers positioned from the formation's x/y (percent of
 * the pitch, y = 0 at the attacking end). Pass `onSlotClick` to make it interactive -- since this
 * component itself has no `'use client'`, that only works when it's rendered from within a client
 * component's tree (e.g. squad-editor.tsx); read-only pages render it with no handler at all.
 */
export function Pitch({
  slots,
  onSlotClick,
  className,
}: {
  slots: SquadSlotView[];
  onSlotClick?: (slot: number) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative aspect-[4/5] w-full max-w-[420px] overflow-hidden rounded-2xl bg-gradient-to-b from-green-700 to-green-800 ring-1 ring-white/10",
        className,
      )}
    >
      {slots.map((slot) => {
        const player = slot.player;
        const chemDots = player ? Math.min(3, Math.max(0, player.chemistry)) : 0;
        const content = (
          <div
            className={cn(
              "flex size-11 flex-col items-center justify-center rounded-lg bg-gradient-to-b text-[10px] font-bold shadow-md",
              player ? tierClasses(player.tier, player.provisional) : "border-2 border-dashed border-white/40 bg-black/20 text-white/70",
            )}
          >
            {player ? (
              <>
                <span className="text-sm leading-none font-extrabold">{player.ovr}</span>
                <span className="leading-none uppercase">{slot.position}</span>
              </>
            ) : (
              <>
                <span className="text-base leading-none">+</span>
                <span className="leading-none uppercase">{slot.position}</span>
              </>
            )}
          </div>
        );

        return (
          <div
            key={slot.slot}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
          >
            {onSlotClick ? (
              <button
                type="button"
                onClick={() => onSlotClick(slot.slot)}
                aria-label={player ? player.name : `${es.squads.emptySlot} ${slot.position}`}
              >
                {content}
              </button>
            ) : (
              content
            )}
            {player && (
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 3 }, (_, i) => (
                  <span
                    key={i}
                    className={cn("size-1.5 rounded-full", i < chemDots ? "bg-lime-400" : "bg-white/25")}
                  />
                ))}
              </div>
            )}
            {player && (
              <span className="max-w-14 truncate text-center text-[9px] font-medium text-white drop-shadow">
                {player.name.split(" ")[0]}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
