import {
  Award,
  CreditCard,
  Eye,
  Flame,
  Footprints,
  Goal,
  Shield,
  Shirt,
  Sparkles,
  Star,
  Trophy,
  Whistle,
  type LucideIcon,
} from "lucide-react";
import { es } from "@/messages/es";

export type EarnedBadge = {
  code: string;
  icon: string;
  count: number;
};

const ICON_BY_NAME: Record<string, LucideIcon> = {
  whistle: Whistle,
  shirt: Shirt,
  ball: Goal,
  "hat-trick": Sparkles,
  boot: Footprints,
  star: Star,
  shield: Shield,
  flame: Flame,
  trophy: Trophy,
  eye: Eye,
  "card-gold": CreditCard,
};

type BadgeInfo = { name: string; description: string };

/** `es.badges` also carries `title`/`count`/`none` UI strings alongside the 15 per-code entries;
 * only the objects with a `name` are real badge info. */
function badgeInfo(code: string): BadgeInfo | null {
  const entry = (es.badges as Record<string, unknown>)[code];
  if (entry && typeof entry === "object" && "name" in entry && "description" in entry) {
    return entry as BadgeInfo;
  }
  return null;
}

export function BadgeList({ badges }: { badges: EarnedBadge[] }) {
  if (badges.length === 0) {
    return <p className="text-sm text-muted-foreground">{es.badges.none}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {badges.map((badge) => {
        const info = badgeInfo(badge.code);
        const Icon = ICON_BY_NAME[badge.icon] ?? Award;
        const name = info?.name ?? badge.code;
        const description = info?.description;

        return (
          <div
            key={badge.code}
            title={description}
            className="flex items-center gap-2.5 rounded-lg bg-card p-2.5 ring-1 ring-foreground/10"
          >
            <Icon className="size-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{name}</p>
              {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
            </div>
            {badge.count > 1 && (
              <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                {es.badges.count(badge.count)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
