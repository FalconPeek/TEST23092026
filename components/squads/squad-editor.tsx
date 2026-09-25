"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ClubCrest } from "@/components/clubs/club-crest";
import { Pitch } from "@/components/squads/pitch";
import { es } from "@/messages/es";
import { deleteSquad, saveSquad, setSquadPublished } from "@/lib/actions/squads";
import { candidatesForSlot, changeFormation, clearSlot, setSlot, type EditorAssignment } from "@/lib/squads/editor-state";
import { defaultFormation, findFormation, formationsFor, TEAM_SIZES, type TeamSize } from "@/lib/squads/formations";
import { buildSquadView, type SquadContext } from "@/lib/squads/view";
import type { SquadSettings } from "@/lib/settings/group";

export type EditorPlayer = SquadContext["players"] extends Map<string, infer V> ? V : never;

export type EditorClub = {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  crestUrl: string | null;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

async function shareSquad(squadId: string, name: string) {
  const path = `/api/og/squad/${squadId}`;
  const title = es.app.name;
  const url = `${window.location.origin}${path}`;

  try {
    const response = await fetch(path);
    const blob = await response.blob();
    const file = new File([blob], `plantilla-${squadId}.png`, { type: "image/png" });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title, text: name });
      return;
    }
    if (navigator.share) {
      await navigator.share({ title, text: name, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success(es.profile.linkCopied);
  } catch (err) {
    if ((err as { name?: string } | null)?.name === "AbortError") return;
    toast.error(es.common.error);
  }
}

export function SquadEditor({
  groupId,
  squadId,
  kind = "dream",
  matchId = null,
  side = null,
  initialName,
  initialTeamSize,
  initialFormationCode,
  initialClubId,
  initialSlots,
  initialPublished,
  players,
  shared,
  settings,
  clubs,
  excludePlayerIds = [],
  onAssignmentChange,
}: {
  groupId: string;
  squadId: string | null;
  kind?: "dream" | "lineup";
  matchId?: string | null;
  side?: 1 | 2 | null;
  initialName: string;
  initialTeamSize: TeamSize;
  initialFormationCode: string;
  initialClubId: string | null;
  initialSlots: { slot: number; playerId: string }[];
  initialPublished: boolean;
  players: EditorPlayer[];
  shared: [string, number][];
  settings: SquadSettings;
  clubs: EditorClub[];
  /** Lineup mode only: players already placed on the other side, hidden from this side's candidates. */
  excludePlayerIds?: string[];
  /** Lineup mode only: reports this side's currently-placed player ids up so the other side can exclude them. */
  onAssignmentChange?: (playerIds: string[]) => void;
}) {
  const [name, setName] = useState(initialName);
  const [teamSize, setTeamSize] = useState<TeamSize>(initialTeamSize);
  const [formationCode, setFormationCode] = useState(initialFormationCode);
  const [clubId, setClubId] = useState<string | null>(initialClubId);
  const [assignment, setAssignment] = useState<EditorAssignment>(
    () => new Map(initialSlots.map((s) => [s.slot, s.playerId])),
  );
  const [published, setPublished] = useState(initialPublished);
  const [sheetSlot, setSheetSlot] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [savePending, startSaveTransition] = useTransition();
  const [publishPending, startPublishTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();
  const router = useRouter();

  const playersById = useMemo(() => new Map(players.map((p) => [p.playerId, p])), [players]);
  const sharedMap = useMemo(() => new Map(shared), [shared]);
  const context: SquadContext = useMemo(() => ({ players: playersById, shared: sharedMap }), [playersById, sharedMap]);
  const formation = findFormation(teamSize, formationCode) ?? defaultFormation(teamSize);

  const view = useMemo(
    () =>
      buildSquadView(
        {
          team_size: teamSize,
          formation: formation.code,
          slots: [...assignment].map(([slot, playerId]) => ({ slot, player_id: playerId })),
        },
        context,
        settings,
      ),
    [teamSize, formation, assignment, context, settings],
  );

  const sheetPosition = sheetSlot !== null ? formation.slots.find((s) => s.slot === sheetSlot)?.position : undefined;
  const sheetCandidates = useMemo(
    () =>
      sheetPosition
        ? candidatesForSlot(playersById, assignment, sheetPosition).filter((c) => !excludePlayerIds.includes(c.playerId))
        : [],
    [sheetPosition, playersById, assignment, excludePlayerIds],
  );
  const sheetHasPlayer = sheetSlot !== null && assignment.has(sheetSlot);

  useEffect(() => {
    onAssignmentChange?.([...assignment.values()]);
  }, [assignment, onAssignmentChange]);

  function handleTeamSizeChange(value: string) {
    const nextSize = Number(value) as TeamSize;
    const nextFormation = defaultFormation(nextSize);
    setTeamSize(nextSize);
    setFormationCode(nextFormation.code);
    setAssignment((prev) => changeFormation(prev, nextFormation));
  }

  function handleFormationChange(code: string) {
    const next = findFormation(teamSize, code);
    if (!next) return;
    setFormationCode(code);
    setAssignment((prev) => changeFormation(prev, next));
  }

  function handlePickCandidate(playerId: string) {
    if (sheetSlot === null) return;
    setAssignment((prev) => setSlot(prev, sheetSlot, playerId));
    setSheetSlot(null);
  }

  function handleRemoveFromSlot() {
    if (sheetSlot === null) return;
    setAssignment((prev) => clearSlot(prev, sheetSlot));
    setSheetSlot(null);
  }

  function handleSave() {
    startSaveTransition(async () => {
      const result = await saveSquad({
        squadId,
        groupId,
        kind,
        name: name.trim(),
        teamSize,
        formation: formation.code,
        slots: [...assignment].map(([slot, playerId]) => ({ slot, playerId })),
        clubId,
        matchId,
        side,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.squads.saved);
      if (kind === "lineup") {
        router.refresh();
      } else if (squadId) {
        router.refresh();
      } else {
        router.push(`/g/${groupId}/plantillas/${result.data.squadId}`);
      }
    });
  }

  function handleTogglePublished() {
    if (!squadId) return;
    const next = !published;
    startPublishTransition(async () => {
      const result = await setSquadPublished({ groupId, squadId, published: next });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPublished(next);
      toast.success(es.squads.saved);
    });
  }

  function handleDelete() {
    if (!squadId) return;
    startDeleteTransition(async () => {
      const result = await deleteSquad({ groupId, squadId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.squads.deleted);
      router.push(`/g/${groupId}/plantillas`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="squad-name">{es.squads.name}</Label>
          <Input id="squad-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="h-11" />
        </div>

        {kind === "dream" ? (
          <div className="flex flex-col gap-1.5">
            <Label>{es.squads.teamSize}</Label>
            <Select value={String(teamSize)} onValueChange={handleTeamSizeChange}>
              <SelectTrigger className="h-11 w-full">
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
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label>{es.squads.teamSize}</Label>
            <p className="text-sm text-muted-foreground">{es.matches.teamSizeOption(teamSize)}</p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>{es.squads.formation}</Label>
          <div className="flex flex-wrap gap-2">
            {formationsFor(teamSize).map((f) => (
              <Button
                key={f.code}
                type="button"
                size="sm"
                variant={f.code === formation.code ? "default" : "outline"}
                className="h-11"
                onClick={() => handleFormationChange(f.code)}
              >
                {f.code}
              </Button>
            ))}
          </div>
        </div>

        {clubs.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label>{kind === "lineup" ? es.matches.pickClub : es.clubs.title}</Label>
            <Select value={clubId ?? "none"} onValueChange={(v) => setClubId(v === "none" ? null : v)}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{es.squads.noClub}</SelectItem>
                {clubs.map((club) => (
                  <SelectItem key={club.id} value={club.id}>
                    <span className="flex items-center gap-2">
                      <ClubCrest
                        crestUrl={club.crestUrl}
                        primaryColor={club.primaryColor}
                        secondaryColor={club.secondaryColor}
                        shortName={club.shortName}
                        name={club.name}
                        size="sm"
                      />
                      {club.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-3">
        {view && <Pitch slots={view.slots} onSlotClick={(slot) => setSheetSlot(slot)} />}
        {view && (
          <div className="flex gap-4 text-sm font-medium">
            <span>
              {es.squads.rating}: <span className="tabular-nums">{view.rating.rating}</span>
            </span>
            <span>
              {es.squads.chemistry}: <span className="tabular-nums">{view.chemistry.total}</span>/{view.chemistry.max}
            </span>
          </div>
        )}
      </div>

      <Button type="button" className="h-11 self-start" onClick={handleSave} disabled={savePending || name.trim().length === 0}>
        {es.common.save}
      </Button>

      {kind === "dream" && squadId && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={handleTogglePublished} disabled={publishPending}>
            {published ? es.squads.unpublish : es.squads.publish}
          </Button>
          {published && (
            <Button type="button" variant="outline" className="h-11" onClick={() => shareSquad(squadId, name)}>
              {es.squads.share}
            </Button>
          )}
          <Button type="button" variant="destructive" className="h-11" onClick={() => setDeleteOpen(true)}>
            {es.squads.delete}
          </Button>
        </div>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{es.squads.delete}</DialogTitle>
            <DialogDescription>{es.squads.deleteConfirm}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {es.common.cancel}
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deletePending}>
              {es.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={sheetSlot !== null} onOpenChange={(open) => !open && setSheetSlot(null)}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{sheetPosition ? `${es.squads.pickPlayer} — ${es.positions[sheetPosition]}` : es.squads.pickPlayer}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1.5 px-4 pb-4">
            {sheetHasPlayer && (
              <Button type="button" variant="outline" className="h-11 self-start" onClick={handleRemoveFromSlot}>
                {es.squads.remove}
              </Button>
            )}
            {sheetCandidates.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">{es.clubs.empty}</p>
            ) : (
              sheetCandidates.map((candidate) => (
                <button
                  key={candidate.playerId}
                  type="button"
                  onClick={() => handlePickCandidate(candidate.playerId)}
                  className="flex min-h-11 items-center gap-2 rounded-lg bg-background p-2 text-left ring-1 ring-foreground/10"
                >
                  <Avatar size="sm">
                    {candidate.avatarUrl && <AvatarImage src={candidate.avatarUrl} alt="" />}
                    <AvatarFallback>{initials(candidate.name)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-sm">{candidate.name}</span>
                  {candidate.fit === "other" && (
                    <span className="text-xs text-muted-foreground">{es.squads.outOfPosition}</span>
                  )}
                  <span className="text-sm font-semibold tabular-nums">{candidate.ovr}</span>
                </button>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
