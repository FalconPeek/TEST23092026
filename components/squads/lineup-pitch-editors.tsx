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
import { SquadEditor, type EditorClub, type EditorPlayer } from "@/components/squads/squad-editor";
import { es } from "@/messages/es";
import { applyLineupSquads } from "@/lib/actions/squads";
import type { TeamSize } from "@/lib/squads/formations";
import type { SquadSettings } from "@/lib/settings/group";

export type LineupSide = {
  squadId: string | null;
  name: string;
  formationCode: string;
  clubId: string | null;
  slots: { slot: number; playerId: string }[];
};

/**
 * Two SquadEditors in lineup mode, side by side. Each side reports its own in-progress
 * assignment up so the other side can exclude those players live, before either side is saved.
 */
export function LineupPitchEditors({
  groupId,
  matchId,
  teamSize,
  players,
  shared,
  settings,
  clubs,
  side1,
  side2,
  bothSaved,
}: {
  groupId: string;
  matchId: string;
  teamSize: TeamSize;
  players: EditorPlayer[];
  shared: [string, number][];
  settings: SquadSettings;
  clubs: EditorClub[];
  side1: LineupSide;
  side2: LineupSide;
  bothSaved: boolean;
}) {
  const [side1PlayerIds, setSide1PlayerIds] = useState(() => side1.slots.map((s) => s.playerId));
  const [side2PlayerIds, setSide2PlayerIds] = useState(() => side2.slots.map((s) => s.playerId));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleApply() {
    startTransition(async () => {
      const result = await applyLineupSquads({ groupId, matchId });
      setConfirmOpen(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.matches.lineupApplied);
      router.push(`/g/${groupId}/partidos/${matchId}`);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{side1.name}</h2>
        <SquadEditor
          key={side1.squadId ?? "new-side-1"}
          groupId={groupId}
          squadId={side1.squadId}
          kind="lineup"
          matchId={matchId}
          side={1}
          initialName={side1.name}
          initialTeamSize={teamSize}
          initialFormationCode={side1.formationCode}
          initialClubId={side1.clubId}
          initialSlots={side1.slots}
          initialPublished={false}
          players={players}
          shared={shared}
          settings={settings}
          clubs={clubs}
          excludePlayerIds={side2PlayerIds}
          onAssignmentChange={setSide1PlayerIds}
        />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{side2.name}</h2>
        <SquadEditor
          key={side2.squadId ?? "new-side-2"}
          groupId={groupId}
          squadId={side2.squadId}
          kind="lineup"
          matchId={matchId}
          side={2}
          initialName={side2.name}
          initialTeamSize={teamSize}
          initialFormationCode={side2.formationCode}
          initialClubId={side2.clubId}
          initialSlots={side2.slots}
          initialPublished={false}
          players={players}
          shared={shared}
          settings={settings}
          clubs={clubs}
          excludePlayerIds={side1PlayerIds}
          onAssignmentChange={setSide2PlayerIds}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Button type="button" className="h-11 self-start" disabled={!bothSaved} onClick={() => setConfirmOpen(true)}>
          {es.matches.applyLineup}
        </Button>
        {!bothSaved && <p className="text-xs text-muted-foreground">{es.matches.needBothSides}</p>}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{es.matches.applyLineup}</DialogTitle>
            <DialogDescription>{es.matches.applyLineupConfirm}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {es.common.cancel}
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleApply} disabled={pending}>
              {es.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
