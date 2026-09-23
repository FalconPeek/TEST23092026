import { cn } from "cn";
import { es } from "@/messages/es";
import {
  GK_ATTRIBUTES,
  OUTFIELD_FACE_STATS,
  subAttributesOfFaceStat,
  type AttributeKey,
} from "@/lib/rating/attributes";
import { isGoalkeeperPosition, type PositionCode } from "@/lib/rating/positions";

export type AttributeRatingRow = { attribute: string; value: number; nRaters: number };

function barColor(value: number): string {
  if (value < 50) return "bg-red-500";
  if (value < 65) return "bg-amber-500";
  if (value < 75) return "bg-lime-500";
  return "bg-green-500";
}

export function AttributeList({
  position,
  ratings,
}: {
  position: PositionCode;
  ratings: AttributeRatingRow[];
}) {
  const byAttribute = new Map(ratings.map((r) => [r.attribute, r]));

  const groups: { heading: string; attributes: readonly AttributeKey[] }[] = OUTFIELD_FACE_STATS.map((stat) => ({
    heading: es.card.faceStats[stat],
    attributes: subAttributesOfFaceStat(stat),
  }));
  if (isGoalkeeperPosition(position)) {
    groups.push({ heading: es.profile.goalkeeper, attributes: GK_ATTRIBUTES });
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.heading} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{group.heading}</h3>
          <div className="flex flex-col gap-1.5">
            {group.attributes.map((attr) => {
              const row = byAttribute.get(attr);
              if (!row) return null;
              return (
                <div key={attr} className="flex items-center gap-2 text-sm">
                  <span className="w-28 shrink-0 truncate sm:w-36">{es.attributes[attr]}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", barColor(row.value))}
                      style={{ width: `${row.value}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right font-medium tabular-nums">{row.value}</span>
                  <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                    {es.profile.votes(row.nRaters)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
