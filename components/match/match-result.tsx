import Link from "next/link";
import { ShieldCheck, Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { es } from "@/messages/es";

export type MatchResultScore = {
  team1Goals: number;
  team2Goals: number;
  pens1: number | null;
  pens2: number | null;
};

export type MatchResultPlayerStat = {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  side: 1 | 2;
  goals: number;
  assists: number;
  ownGoals: number;
  saves: number;
  cleanSheet: boolean;
  isMvp: boolean;
  medianRating: number | null;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function MatchResult({
  groupId,
  team1Name,
  team2Name,
  team1Color,
  team2Color,
  result,
  stats,
}: {
  groupId: string;
  team1Name: string;
  team2Name: string;
  team1Color?: string | null;
  team2Color?: string | null;
  result: MatchResultScore;
  stats: MatchResultPlayerStat[];
}) {
  const pensLabel =
    result.pens1 !== null && result.pens2 !== null ? ` (${result.pens1}-${result.pens2} pen.)` : "";

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-xs text-muted-foreground">{es.match.finalized}</p>
        <div className="flex items-center gap-3">
          <span className="flex max-w-24 items-center gap-1.5 truncate text-sm font-medium text-muted-foreground">
            {team1Color && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: team1Color }} />}
            {team1Name}
          </span>
          <span className="text-2xl font-bold tabular-nums">
            {result.team1Goals} - {result.team2Goals}
            {pensLabel}
          </span>
          <span className="flex max-w-24 items-center gap-1.5 truncate text-sm font-medium text-muted-foreground">
            {team2Color && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: team2Color }} />}
            {team2Name}
          </span>
        </div>
      </div>

      {([1, 2] as const).map((side) => {
        const sideStats = stats.filter((s) => s.side === side);
        if (sideStats.length === 0) return null;
        return (
          <div key={side} className="flex flex-col gap-1.5">
            <h4 className="text-xs font-medium text-muted-foreground">{side === 1 ? team1Name : team2Name}</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead className="text-center" title={es.match.goals}>G</TableHead>
                  <TableHead className="text-center" title={es.match.assists}>A</TableHead>
                  <TableHead className="text-center" title={es.match.ownGoals}>AG</TableHead>
                  <TableHead className="text-center" title={es.match.saves}>Ata.</TableHead>
                  <TableHead className="text-center" title={es.match.medianRating}>Punt.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sideStats.map((s) => (
                  <TableRow key={s.playerId} className={s.isMvp ? "bg-amber-500/10" : undefined}>
                    <TableCell>
                      <Link href={`/g/${groupId}/jugadores/${s.playerId}`} className="flex items-center gap-2">
                        <Avatar size="sm">
                          {s.avatarUrl && <AvatarImage src={s.avatarUrl} alt="" />}
                          <AvatarFallback>{initials(s.displayName)}</AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate text-sm">{s.displayName}</span>
                        {s.isMvp && (
                          <Badge variant="outline" className="shrink-0 gap-1 border-amber-500/40 text-amber-600">
                            <Star className="size-3 fill-amber-500 text-amber-500" aria-hidden />
                            {es.match.mvp}
                          </Badge>
                        )}
                        {s.cleanSheet && (
                          <ShieldCheck className="size-4 shrink-0 text-primary" aria-label={es.match.cleanSheet} />
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{s.goals}</TableCell>
                    <TableCell className="text-center tabular-nums">{s.assists}</TableCell>
                    <TableCell className="text-center tabular-nums">{s.ownGoals}</TableCell>
                    <TableCell className="text-center tabular-nums">{s.saves}</TableCell>
                    <TableCell className="text-center tabular-nums">
                      {s.medianRating !== null ? s.medianRating.toFixed(1) : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        );
      })}
    </div>
  );
}
