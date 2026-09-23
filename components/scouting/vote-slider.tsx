"use client";

import { cn } from "cn";
import { Slider } from "@/components/ui/slider";
import { es } from "@/messages/es";

/** Thumb position while untouched; not itself a vote until the user drags it. */
const UNSET_POSITION = 5;

export function VoteSlider({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const touched = value !== undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span
          className={cn(
            "text-xl font-bold tabular-nums",
            !touched && "text-sm font-normal text-muted-foreground",
          )}
        >
          {touched ? value : es.scouting.unset}
        </span>
      </div>
      <Slider
        min={1}
        max={10}
        step={1}
        value={[value ?? UNSET_POSITION]}
        onValueChange={([next]) => next !== undefined && onChange(next)}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  );
}
