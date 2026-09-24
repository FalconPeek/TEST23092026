"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function MiniStepper({
  value,
  onChange,
  max,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  max: number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-md bg-card p-1.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value <= 0}
          className="flex size-11 items-center justify-center rounded-md border border-border text-base disabled:opacity-40"
        >
          −
        </button>
        <span className="w-6 text-center text-base font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex size-11 items-center justify-center rounded-md border border-border text-base disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

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
                const rowShowsSaves = showSaves || player.position === "POR";
                return (
                  <div
                    key={player.id}
                    className="flex flex-col gap-2 rounded-lg bg-background p-2 ring-1 ring-foreground/10"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar size="sm">
                        {player.avatarUrl && <AvatarImage src={player.avatarUrl} alt="" />}
                        <AvatarFallback>{initials(player.displayName)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate text-sm">{player.displayName}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <MiniStepper
                        label={es.match.goals}
                        value={row.goals}
                        max={30}
                        onChange={(v) => updateRow(player.id, "goals", v)}
                      />
                      <MiniStepper
                        label={es.match.assists}
                        value={row.assists}
                        max={30}
                        onChange={(v) => updateRow(player.id, "assists", v)}
                      />
                      <MiniStepper
                        label={es.match.ownGoals}
                        value={row.ownGoals}
                        max={30}
                        onChange={(v) => updateRow(player.id, "ownGoals", v)}
                      />
                      {rowShowsSaves && (
                        <MiniStepper
                          label={es.match.saves}
                          value={row.saves}
                          max={99}
                          onChange={(v) => updateRow(player.id, "saves", v)}
                        />
                      )}
                    </div>
                  </div>
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
