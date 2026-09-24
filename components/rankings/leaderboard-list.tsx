import Link from "next/link";
import { cn } from "cn";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { es } from "@/messages/es";
import { formatMetricValue, type LeaderboardRow, type Metric } from "@/lib/rankings/format";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/** Server-safe: renders rank 4+ (the podium covers 1st-3rd separately). My own row is
 * highlighted and labeled "Vos" instead of my display name. */
export function LeaderboardList({
  groupId,
  metric,
  rows,
  myPlayerId,
}: {
  groupId: string;
  metric: Metric;
  rows: LeaderboardRow[];
  myPlayerId: string | null;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row) => {
        const isMe = row.playerId === myPlayerId;
        return (
          <Link
            key={row.playerId}
            href={`/g/${groupId}/jugadores/${row.playerId}`}
            className={cn(
              "flex items-center gap-3 rounded-lg p-2 ring-1",
              isMe ? "bg-primary/10 ring-primary/30" : "bg-card ring-foreground/10",
            )}
          >
            <span className="w-6 shrink-0 text-center text-sm font-medium tabular-nums text-muted-foreground">
              {row.rank}
            </span>
            <Avatar size="sm">
              {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt="" />}
              <AvatarFallback>{initials(row.displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{isMe ? es.rankings.you : row.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{es.rankings.matchesPlayed(row.matchesPlayed)}</p>
            </div>
            <span className="shrink-0 text-base font-semibold tabular-nums">{formatMetricValue(metric, row.value)}</span>
          </Link>
        );
      })}
    </div>
  );
}
