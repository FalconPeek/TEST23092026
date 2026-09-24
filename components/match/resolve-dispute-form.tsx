"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlayerStatRow, type StatField } from "@/components/match/stat-row";
import type { StatFormPlayer, StatPrefill } from "@/components/match/stats-form";
import { es } from "@/messages/es";
import { resolveDispute } from "@/lib/actions/matches";

function Stepper({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value <= 0}
        >
          −
        </Button>
        <span className="w-10 text-center text-2xl font-bold tabular-nums">{value}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          onClick={() => onChange(Math.min(99, value + 1))}
        >
          +
        </Button>
      </div>
    </div>
  );
}

const EMPTY_STAT: StatPrefill = { goals: 0, assists: 0, ownGoals: 0, saves: 0 };

export function ResolveDisputeForm({
  groupId,
  matchId,
  team1Name,
  team2Name,
  players,
  prefill,
  initialTeam1Goals,
  initialTeam2Goals,
}: {
  groupId: string;
  matchId: string;
  team1Name: string;
  team2Name: string;
  players: StatFormPlayer[];
  prefill: Record<string, StatPrefill>;
  initialTeam1Goals: number | null;
  initialTeam2Goals: number | null;
}) {
  const [team1Goals, setTeam1Goals] = useState(initialTeam1Goals ?? 0);
  const [team2Goals, setTeam2Goals] = useState(initialTeam2Goals ?? 0);
  const [rows, setRows] = useState<Record<string, StatPrefill>>(() =>
    Object.fromEntries(players.map((p) => [p.id, prefill[p.id] ?? EMPTY_STAT])),
  );
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set());
  const [showSaves, setShowSaves] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function updateRow(playerId: string, field: StatField, value: number) {
    setRows((prev) => ({ ...prev, [playerId]: { ...(prev[playerId] ?? EMPTY_STAT), [field]: value } }));
    setEdited((prev) => new Set(prev).add(playerId));
  }

  function handleResolve() {
    startTransition(async () => {
      const stats = players
        .filter((p) => edited.has(p.id))
        .map((p) => {
          const row = rows[p.id] ?? EMPTY_STAT;
          return {
            subjectPlayerId: p.id,
            goals: row.goals,
            assists: row.assists,
            ownGoals: row.ownGoals,
            saves: row.saves,
          };
        });

      const result = await resolveDispute({
        groupId,
        matchId,
        team1Goals,
        team2Goals,
        stats: stats.length > 0 ? stats : undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.matches.disputeResolved);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-destructive/30">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{es.match.disputedTitle}</h3>
        <p className="text-xs text-muted-foreground">{es.match.disputedBody}</p>
      </div>

      <div className="flex items-center justify-center gap-6">
        <Stepper value={team1Goals} onChange={setTeam1Goals} label={team1Name} />
        <span className="text-lg text-muted-foreground">-</span>
        <Stepper value={team2Goals} onChange={setTeam2Goals} label={team2Name} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium text-muted-foreground">{es.match.statsTitle}</h4>
        <label className="flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={showSaves} onChange={(e) => setShowSaves(e.target.checked)} />
          {es.match.showSaves}
        </label>
      </div>

      {([1, 2] as const).map((side) => {
        const sidePlayers = players.filter((p) => p.side === side);
        if (sidePlayers.length === 0) return null;
        return (
          <div key={side} className="flex flex-col gap-1.5">
            <h5 className="text-xs font-medium text-muted-foreground">{side === 1 ? team1Name : team2Name}</h5>
            <div className="flex flex-col gap-1.5">
              {sidePlayers.map((player) => (
                <PlayerStatRow
                  key={player.id}
                  displayName={player.displayName}
                  avatarUrl={player.avatarUrl}
                  values={rows[player.id] ?? EMPTY_STAT}
                  showSaves={showSaves || player.position === "POR"}
                  onChange={(field, value) => updateRow(player.id, field, value)}
                />
              ))}
            </div>
          </div>
        );
      })}

      <Button variant="destructive" className="h-11 w-full" onClick={() => setOpen(true)}>
        {es.match.resolve}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{es.match.resolve}</DialogTitle>
            <DialogDescription>{es.match.resolveHelp}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{es.common.cancel}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleResolve} disabled={pending}>
              {es.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
