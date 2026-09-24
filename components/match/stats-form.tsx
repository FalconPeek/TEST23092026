"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PlayerStatRow } from "@/components/match/stat-row";
import { es } from "@/messages/es";
import { submitStatReports } from "@/lib/actions/matches";
import { buildStatReportsPayload, goalsCheck, type ScoreReport, type StatRow } from "@/lib/match/report";
import type { PositionCode } from "@/lib/rating/positions";

export type StatFormPlayer = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  side: 1 | 2;
  position: PositionCode | null;
};

export type StatPrefill = {
  goals: number;
  assists: number;
  ownGoals: number;
  saves: number;
};

export function StatsForm({
  groupId,
  matchId,
  team1Name,
  team2Name,
  players,
  prefill,
  myScoreReport,
}: {
  groupId: string;
  matchId: string;
  team1Name: string;
  team2Name: string;
  players: StatFormPlayer[];
  prefill: Record<string, StatPrefill>;
  myScoreReport: ScoreReport | null;
}) {
  const [rows, setRows] = useState<StatRow[]>(() =>
    players.map((p) => ({
      playerId: p.id,
      side: p.side,
      goals: prefill[p.id]?.goals ?? 0,
      assists: prefill[p.id]?.assists ?? 0,
      ownGoals: prefill[p.id]?.ownGoals ?? 0,
      saves: prefill[p.id]?.saves ?? 0,
      wasPreviouslyReported: p.id in prefill,
    })),
  );
  const [showSaves, setShowSaves] = useState(false);
  const [pending, startTransition] = useTransition();

  function updateRow(playerId: string, field: "goals" | "assists" | "ownGoals" | "saves", value: number) {
    setRows((prev) => prev.map((r) => (r.playerId === playerId ? { ...r, [field]: value } : r)));
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await submitStatReports({ groupId, matchId, reports: buildStatReportsPayload(rows) });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.matches.statsSaved);
    });
  }

  const rowByPlayer = new Map(rows.map((r) => [r.playerId, r]));

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{es.match.statsTitle}</h3>
        <label className="flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={showSaves} onChange={(e) => setShowSaves(e.target.checked)} />
          {es.match.showSaves}
        </label>
      </div>

      {([1, 2] as const).map((side) => {
        const sidePlayers = players.filter((p) => p.side === side);
        if (sidePlayers.length === 0) return null;
        const check = goalsCheck(rows, myScoreReport, side);

        return (
          <div key={side} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-medium text-muted-foreground">{side === 1 ? team1Name : team2Name}</h4>
              {check.expected !== null && (
                <span className="text-xs text-muted-foreground">
                  {es.match.goalsLoaded(check.loaded, check.expected)}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              {sidePlayers.map((player) => {
                const row = rowByPlayer.get(player.id);
                if (!row) return null;
                return (
                  <PlayerStatRow
                    key={player.id}
                    displayName={player.displayName}
                    avatarUrl={player.avatarUrl}
                    values={row}
                    showSaves={showSaves || player.position === "POR"}
                    onChange={(field, value) => updateRow(player.id, field, value)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      <Button className="h-11 w-full" onClick={handleSubmit} disabled={pending}>
        {es.match.saveStats}
      </Button>
    </div>
  );
}
