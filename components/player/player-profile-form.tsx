"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { es } from "@/messages/es";
import { updateMyPlayer, updatePlayer } from "@/lib/actions/groups";
import { POSITIONS, type PositionCode } from "@/lib/rating/positions";

export type PlayerProfile = {
  id: string;
  displayName: string;
  primaryPosition: PositionCode | null;
  altPositions: PositionCode[];
  preferredFoot: "left" | "right" | "both" | null;
  heightCm: number | null;
};

const MAX_ALT_POSITIONS = 4;

export function PlayerProfileForm({
  groupId,
  player,
  editedByAdmin,
}: {
  groupId: string;
  player: PlayerProfile;
  editedByAdmin: boolean;
}) {
  const [displayName, setDisplayName] = useState(player.displayName);
  const [primaryPosition, setPrimaryPosition] = useState<PositionCode | "">(player.primaryPosition ?? "");
  const [altPositions, setAltPositions] = useState<PositionCode[]>(player.altPositions);
  const [preferredFoot, setPreferredFoot] = useState<"left" | "right" | "both" | "">(player.preferredFoot ?? "");
  const [heightCm, setHeightCm] = useState(player.heightCm ? String(player.heightCm) : "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const altOptions = POSITIONS.filter((p) => p !== primaryPosition);

  function toggleAlt(position: PositionCode) {
    setAltPositions((prev) => {
      if (prev.includes(position)) return prev.filter((p) => p !== position);
      if (prev.length >= MAX_ALT_POSITIONS) return prev;
      return [...prev, position];
    });
  }

  function handlePrimaryChange(value: string) {
    const next = value === "none" ? "" : (value as PositionCode);
    setPrimaryPosition(next);
    setAltPositions((prev) => prev.filter((p) => p !== next));
  }

  function handleSubmit() {
    startTransition(async () => {
      const input = {
        groupId,
        displayName,
        primaryPosition: primaryPosition || undefined,
        altPositions,
        preferredFoot: preferredFoot || undefined,
        heightCm: heightCm.trim() === "" ? undefined : Number(heightCm),
      };
      const result = editedByAdmin
        ? await updatePlayer({ ...input, playerId: player.id })
        : await updateMyPlayer(input);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.groups.playerUpdated);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="player-name">{es.player.displayName}</Label>
        <Input id="player-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{es.player.primaryPosition}</Label>
        <Select value={primaryPosition || "none"} onValueChange={handlePrimaryChange}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{es.settings.guests.positionNone}</SelectItem>
            {POSITIONS.map((p) => (
              <SelectItem key={p} value={p}>
                {es.positions[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{es.player.altPositions}</Label>
        <p className="text-xs text-muted-foreground">{es.player.altPositionsHint}</p>
        <div className="flex flex-wrap gap-1.5">
          {altOptions.map((p) => {
            const selected = altPositions.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => toggleAlt(p)}
                disabled={!selected && altPositions.length >= MAX_ALT_POSITIONS}
                aria-pressed={selected}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground disabled:opacity-40"
                }`}
              >
                {es.positions[p]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{es.player.preferredFoot}</Label>
        <RadioGroup
          value={preferredFoot}
          onValueChange={(v) => setPreferredFoot(v as "left" | "right" | "both")}
          className="flex flex-row gap-4"
        >
          {(["left", "right", "both"] as const).map((foot) => (
            <label key={foot} className="flex items-center gap-1.5 text-sm">
              <RadioGroupItem value={foot} id={`foot-${foot}`} />
              {es.foot[foot]}
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="player-height">{es.player.heightCm}</Label>
        <Input
          id="player-height"
          type="number"
          min={120}
          max={230}
          value={heightCm}
          onChange={(e) => setHeightCm(e.target.value)}
        />
      </div>

      <Button
        type="button"
        onClick={handleSubmit}
        disabled={pending || displayName.trim().length === 0}
        className="self-start"
      >
        {es.player.save}
      </Button>
    </div>
  );
}
