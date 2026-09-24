"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PlayerStatRow, type StatField, type StatValues } from "@/components/match/stat-row";
import { es } from "@/messages/es";
import { amendMatchStats } from "@/lib/actions/matches";
import { changedRows, unattributedGoals, validateAmendment, type AmendScore, type AmendStatRow } from "@/lib/match/amend";

export type AmendFormPlayer = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  side: 1 | 2;
};

const EMPTY_STAT: StatValues = { goals: 0, assists: 0, ownGoals: 0, saves: 0 };

function toStatRows(players: AmendFormPlayer[], stats: Record<string, StatValues>): AmendStatRow[] {
  return players.map((p) => {
    const values = stats[p.id] ?? EMPTY_STAT;
    return { playerId: p.id, side: p.side, ...values };
  });
}

export function AmendStatsForm({
  groupId,
  matchId,
  team1Name,
  team2Name,
  players,
  initialStats,
  score,
}: {
  groupId: string;
  matchId: string;
  team1Name: string;
  team2Name: string;
  players: AmendFormPlayer[];
  initialStats: Record<string, StatValues>;
  score: AmendScore;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, StatValues>>(() =>
    Object.fromEntries(players.map((p) => [p.id, initialStats[p.id] ?? EMPTY_STAT])),
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function updateRow(playerId: string, field: StatField, value: number) {
    setRows((prev) => ({ ...prev, [playerId]: { ...(prev[playerId] ?? EMPTY_STAT), [field]: value } }));
  }

  const currentRows = toStatRows(players, rows);
  const initialRows = toStatRows(players, initialStats);
  const unattributed = unattributedGoals(score, currentRows);
  const errors = validateAmendment(score, currentRows);
  const payload = changedRows(initialRows, currentRows);
  const canSubmit = payload.length > 0 && !errors.side1 && !errors.side2;

  function handleSubmit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const result = await amendMatchStats({ groupId, matchId, stats: payload });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.match.amended);
      router.refresh();
    });
  }

  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-xl bg-card p-4 ring-1 ring-foreground/10"
    >
      <summary className="cursor-pointer text-sm font-medium">{es.match.amendTitle}</summary>

      <div className="mt-3 flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">{es.match.amendHelp}</p>

        {([1, 2] as const).map((side) => {
          const sidePlayers = players.filter((p) => p.side === side);
          if (sidePlayers.length === 0) return null;
          const sideUnattributed = side === 1 ? unattributed.side1 : unattributed.side2;
          const sideError = side === 1 ? errors.side1 : errors.side2;
          const teamName = side === 1 ? team1Name : team2Name;

          return (
            <div key={side} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-medium text-muted-foreground">{teamName}</h4>
                <span className="text-xs text-muted-foreground">{es.match.unattributed(sideUnattributed)}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {sidePlayers.map((p) => (
                  <PlayerStatRow
                    key={p.id}
                    displayName={p.displayName}
                    avatarUrl={p.avatarUrl}
                    values={rows[p.id] ?? EMPTY_STAT}
                    showSaves
                    onChange={(field, value) => updateRow(p.id, field, value)}
                  />
                ))}
              </div>
              {sideError && <p className="text-xs text-destructive">{es.match.amendOverScore(teamName)}</p>}
            </div>
          );
        })}

        <Button className="h-11 w-full" onClick={handleSubmit} disabled={pending || !canSubmit}>
          {es.match.amendSave}
        </Button>
      </div>
    </details>
  );
}
