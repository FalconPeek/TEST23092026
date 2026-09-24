"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { es } from "@/messages/es";
import { submitScoreReport } from "@/lib/actions/matches";

function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
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
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={es.match.decrease(label)}
        >
          −
        </Button>
        <span className="w-10 text-center text-2xl font-bold tabular-nums">{value}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={es.match.increase(label)}
        >
          +
        </Button>
      </div>
    </div>
  );
}

export function ScoreForm({
  groupId,
  matchId,
  team1Name,
  team2Name,
  initialTeam1Goals,
  initialTeam2Goals,
}: {
  groupId: string;
  matchId: string;
  team1Name: string;
  team2Name: string;
  initialTeam1Goals: number | null;
  initialTeam2Goals: number | null;
}) {
  const [team1Goals, setTeam1Goals] = useState(initialTeam1Goals ?? 0);
  const [team2Goals, setTeam2Goals] = useState(initialTeam2Goals ?? 0);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      const result = await submitScoreReport({ groupId, matchId, team1Goals, team2Goals });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.matches.scoreSaved);
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center justify-center gap-6">
        <Stepper value={team1Goals} onChange={setTeam1Goals} label={team1Name} />
        <span className="text-lg text-muted-foreground">-</span>
        <Stepper value={team2Goals} onChange={setTeam2Goals} label={team2Name} />
      </div>
      <Button className="h-11 w-full" onClick={handleSubmit} disabled={pending}>
        {es.match.saveScore}
      </Button>
    </div>
  );
}
