"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { es } from "@/messages/es";

export type StatField = "goals" | "assists" | "ownGoals" | "saves";

export type StatValues = {
  goals: number;
  assists: number;
  ownGoals: number;
  saves: number;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function MiniStepper({
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

/** One player's editable stat line (avatar, name, goals/assists/own-goals/saves steppers).
 * Shared by StatsForm (self-report) and ResolveDisputeForm (admin override). */
export function PlayerStatRow({
  displayName,
  avatarUrl,
  values,
  showSaves,
  onChange,
}: {
  displayName: string;
  avatarUrl: string | null;
  values: StatValues;
  showSaves: boolean;
  onChange: (field: StatField, value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-background p-2 ring-1 ring-foreground/10">
      <div className="flex items-center gap-2">
        <Avatar size="sm">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
          <AvatarFallback>{initials(displayName)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-sm">{displayName}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniStepper
          label={es.match.goals}
          value={values.goals}
          max={30}
          onChange={(v) => onChange("goals", v)}
        />
        <MiniStepper
          label={es.match.assists}
          value={values.assists}
          max={30}
          onChange={(v) => onChange("assists", v)}
        />
        <MiniStepper
          label={es.match.ownGoals}
          value={values.ownGoals}
          max={30}
          onChange={(v) => onChange("ownGoals", v)}
        />
        {showSaves && (
          <MiniStepper
            label={es.match.saves}
            value={values.saves}
            max={99}
            onChange={(v) => onChange("saves", v)}
          />
        )}
      </div>
    </div>
  );
}
