"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { es } from "@/messages/es";
import { confirmTournamentResult, editTournamentResult, startTournamentMatch } from "@/lib/actions/tournaments";
import { toArgentinaIso } from "@/lib/format";
import type { BracketSlotDisplay } from "@/lib/tournament/bracket-layout";
import type { Database } from "@/lib/supabase/database.types";

type TournamentMatchStatus = Database["public"]["Enums"]["tournament_match_status"];

function Stepper({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
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
        <span className="w-6 text-center text-lg font-semibold tabular-nums">{value}</span>
        <Button type="button" variant="outline" size="icon" className="size-11" onClick={() => onChange(value + 1)}>
          +
        </Button>
      </div>
    </div>
  );
}

function ScheduleDialog({
  open,
  onOpenChange,
  groupId,
  tournamentId,
  tournamentMatchId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  tournamentId: string;
  tournamentMatchId: string;
}) {
  const [scheduledAt, setScheduledAt] = useState("");
  const [venue, setVenue] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit() {
    if (!scheduledAt) {
      toast.error(es.errors.validation);
      return;
    }
    startTransition(async () => {
      const result = await startTournamentMatch({
        tournamentMatchId,
        tournamentId,
        groupId,
        scheduledAt: toArgentinaIso(scheduledAt),
        venue: venue.trim() || undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onOpenChange(false);
      router.push(`/g/${groupId}/partidos/${result.data.matchId}/equipos`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{es.bracket.play}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tm-when">{es.matches.when}</Label>
            <Input
              id="tm-when"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tm-venue">{es.matches.venue}</Label>
            <Input id="tm-venue" value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={120} />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{es.common.cancel}</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={pending}>
            {es.bracket.play}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultDialog({
  open,
  onOpenChange,
  groupId,
  tournamentId,
  tournamentMatchId,
  mode,
  slot1,
  slot2,
  initialScore1,
  initialScore2,
  initialPens1,
  initialPens2,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  tournamentId: string;
  tournamentMatchId: string;
  mode: "enter" | "edit";
  slot1: BracketSlotDisplay;
  slot2: BracketSlotDisplay;
  initialScore1: number | null;
  initialScore2: number | null;
  initialPens1: number | null;
  initialPens2: number | null;
}) {
  const [score1, setScore1] = useState(initialScore1 ?? 0);
  const [score2, setScore2] = useState(initialScore2 ?? 0);
  const [pens1, setPens1] = useState(initialPens1 ?? 0);
  const [pens2, setPens2] = useState(initialPens2 ?? 0);
  const [usePens, setUsePens] = useState(initialPens1 !== null && initialPens2 !== null);
  const [walkover, setWalkover] = useState(false);
  const [winnerEntryId, setWinnerEntryId] = useState<string | undefined>(undefined);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const tied = score1 === score2;

  function handleSubmit() {
    if (walkover && !winnerEntryId) {
      toast.error(es.errors.validation);
      return;
    }
    startTransition(async () => {
      const action = mode === "edit" ? editTournamentResult : confirmTournamentResult;
      const result = await action({
        tournamentMatchId,
        tournamentId,
        groupId,
        score1: walkover ? 0 : score1,
        score2: walkover ? 0 : score2,
        pens1: !walkover && tied && usePens ? pens1 : undefined,
        pens2: !walkover && tied && usePens ? pens2 : undefined,
        decidedBy: walkover ? "walkover" : undefined,
        winnerEntryId: walkover ? winnerEntryId : undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? es.bracket.editResult : es.bracket.enterResult}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <label className="flex items-center justify-between gap-2">
            <span className="text-sm">{es.bracket.walkover}</span>
            <Switch checked={walkover} onCheckedChange={setWalkover} />
          </label>

          {walkover ? (
            <div className="flex flex-col gap-1.5">
              <Label>{es.bracket.winner}</Label>
              <Select value={winnerEntryId ?? ""} onValueChange={setWinnerEntryId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={es.bracket.winner} />
                </SelectTrigger>
                <SelectContent>
                  {slot1.entryId && <SelectItem value={slot1.entryId}>{slot1.label}</SelectItem>}
                  {slot2.entryId && <SelectItem value={slot2.entryId}>{slot2.label}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center gap-6">
                <Stepper value={score1} onChange={setScore1} label={slot1.label} />
                <span className="text-lg text-muted-foreground">-</span>
                <Stepper value={score2} onChange={setScore2} label={slot2.label} />
              </div>

              {tied && (
                <div className="flex flex-col gap-2">
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-sm">{es.bracket.pens}</span>
                    <Switch checked={usePens} onCheckedChange={setUsePens} />
                  </label>
                  {usePens && (
                    <div className="flex items-center justify-center gap-6">
                      <Stepper value={pens1} onChange={setPens1} label={slot1.label} />
                      <span className="text-lg text-muted-foreground">-</span>
                      <Stepper value={pens2} onChange={setPens2} label={slot2.label} />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{es.common.cancel}</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={pending}>
            {es.common.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MatchAdminMenu({
  groupId,
  tournamentId,
  tournamentMatchId,
  status,
  matchId,
  slot1,
  slot2,
  initialScore1,
  initialScore2,
  initialPens1,
  initialPens2,
}: {
  groupId: string;
  tournamentId: string;
  tournamentMatchId: string;
  status: TournamentMatchStatus;
  matchId: string | null;
  slot1: BracketSlotDisplay;
  slot2: BracketSlotDisplay;
  initialScore1: number | null;
  initialScore2: number | null;
  initialPens1: number | null;
  initialPens2: number | null;
}) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [resultMode, setResultMode] = useState<"enter" | "edit" | null>(null);

  const canPlay = status === "ready" && matchId === null;
  const canEnterResult = status === "ready" || status === "in_progress";
  const canEditResult = status === "completed";

  if (!canPlay && !canEnterResult && !canEditResult) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm">
            <MoreVertical />
            <span className="sr-only">{es.common.edit}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canPlay && <DropdownMenuItem onSelect={() => setScheduleOpen(true)}>{es.bracket.play}</DropdownMenuItem>}
          {canEnterResult && (
            <DropdownMenuItem onSelect={() => setResultMode("enter")}>{es.bracket.enterResult}</DropdownMenuItem>
          )}
          {canEditResult && (
            <DropdownMenuItem onSelect={() => setResultMode("edit")}>{es.bracket.editResult}</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        groupId={groupId}
        tournamentId={tournamentId}
        tournamentMatchId={tournamentMatchId}
      />

      {resultMode && (
        <ResultDialog
          open={resultMode !== null}
          onOpenChange={(open) => !open && setResultMode(null)}
          groupId={groupId}
          tournamentId={tournamentId}
          tournamentMatchId={tournamentMatchId}
          mode={resultMode}
          slot1={slot1}
          slot2={slot2}
          initialScore1={initialScore1}
          initialScore2={initialScore2}
          initialPens1={initialPens1}
          initialPens2={initialPens2}
        />
      )}
    </>
  );
}
