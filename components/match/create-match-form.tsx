"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { es } from "@/messages/es";
import { createMatch } from "@/lib/actions/matches";
import { toArgentinaIso } from "@/lib/format";

const TEAM_SIZES = [5, 6, 7, 8, 9, 11] as const;
type TeamSize = (typeof TEAM_SIZES)[number];

export function CreateMatchForm({
  groupId,
  defaultTeamSize,
}: {
  groupId: string;
  defaultTeamSize: TeamSize;
}) {
  const [scheduledAt, setScheduledAt] = useState("");
  const [venue, setVenue] = useState("");
  const [teamSize, setTeamSize] = useState<TeamSize>(defaultTeamSize);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit() {
    if (!scheduledAt) {
      toast.error(es.errors.validation);
      return;
    }
    startTransition(async () => {
      const result = await createMatch({
        groupId,
        scheduledAt: toArgentinaIso(scheduledAt),
        teamSize,
        venue: venue.trim() || undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.matches.created);
      router.push(`/g/${groupId}/partidos/${result.data.matchId}/equipos`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="match-when">{es.matches.when}</Label>
        <Input
          id="match-when"
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="match-venue">{es.matches.venue}</Label>
        <Input id="match-venue" value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={120} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{es.matches.teamSize}</Label>
        <Select value={String(teamSize)} onValueChange={(v) => setTeamSize(Number(v) as TeamSize)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEAM_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {es.matches.teamSizeOption(size)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button onClick={handleSubmit} disabled={pending}>
        {es.matches.new}
      </Button>
    </div>
  );
}
