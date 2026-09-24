import Link from "next/link";
import { cn } from "cn";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { es } from "@/messages/es";
import { formatMetricValue, type LeaderboardRow, type Metric, type PodiumPosition } from "@/lib/rankings/format";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function PodiumPlayer({
  groupId,
  metric,
  row,
  size,
  isMe,
}: {
  groupId: string;
  metric: Metric;
  row: LeaderboardRow;
  size: "lg" | "default";
  isMe: boolean;
}) {
  return (
    <Link href={`/g/${groupId}/jugadores/${row.playerId}`} className="flex flex-col items-center gap-1">
      <Avatar size={size} className={cn(isMe && "ring-2 ring-primary ring-offset-2 ring-offset-background")}>
        {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt="" />}
        <AvatarFallback>{initials(row.displayName)}</AvatarFallback>
      </Avatar>
      <span className="max-w-20 truncate text-center text-xs font-medium">
        {isMe ? es.rankings.you : row.displayName}
      </span>
      <span className={cn("font-bold tabular-nums", size === "lg" ? "text-lg" : "text-sm")}>
        {formatMetricValue(metric, row.value)}
      </span>
    </Link>
  );
}

function PodiumSlot({
  groupId,
  metric,
  position,
  size,
  myPlayerId,
}: {
  groupId: string;
  metric: Metric;
  position: PodiumPosition;
  size: "lg" | "default";
  myPlayerId: string | null;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-3">
      {position.rows.map((row) => (
        <PodiumPlayer
          key={row.playerId}
          groupId={groupId}
          metric={metric}
          row={row}
          size={size}
          isMe={row.playerId === myPlayerId}
        />
      ))}
    </div>
  );
}

/** Server-safe. `positions[0]` (1st place, possibly tied) renders larger, in the middle;
 * `positions[1]`/`positions[2]` (2nd/3rd) flank it, smaller. A tie fills a slot with more than
 * one player instead of assuming exactly 3 people total. */
export function Podium({
  groupId,
  metric,
  positions,
  myPlayerId,
}: {
  groupId: string;
  metric: Metric;
  positions: PodiumPosition[];
  myPlayerId: string | null;
}) {
  if (positions.length === 0) return null;

  const [first, second, third] = positions;

  return (
    <div className="flex items-start justify-center gap-2">
      {second && <PodiumSlot groupId={groupId} metric={metric} position={second} size="default" myPlayerId={myPlayerId} />}
      {first && <PodiumSlot groupId={groupId} metric={metric} position={first} size="lg" myPlayerId={myPlayerId} />}
      {third && <PodiumSlot groupId={groupId} metric={metric} position={third} size="default" myPlayerId={myPlayerId} />}
    </div>
  );
}
