"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ClubCrest } from "@/components/clubs/club-crest";
import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/client";
import { deleteClub, setClubPlayers, updateClub } from "@/lib/actions/clubs";

const MAX_CREST_BYTES = 512 * 1024;
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type ClubFormPlayer = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type ClubFormData = {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  crestPath: string | null;
  crestUrl: string | null;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function ClubForm({
  groupId,
  club,
  players,
  initialRoster,
}: {
  groupId: string;
  club: ClubFormData;
  players: ClubFormPlayer[];
  initialRoster: Record<string, number | null>;
}) {
  const [name, setName] = useState(club.name);
  const [shortName, setShortName] = useState(club.shortName);
  const [primaryColor, setPrimaryColor] = useState(club.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(club.secondaryColor);
  const [crestPath, setCrestPath] = useState(club.crestPath);
  const [crestUrl, setCrestUrl] = useState(club.crestUrl);
  const [roster, setRoster] = useState<Record<string, number | null>>(initialRoster);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [detailsPending, startDetailsTransition] = useTransition();
  const [crestPending, startCrestTransition] = useTransition();
  const [rosterPending, startRosterTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const shortNameValid = /^[A-Za-z0-9]{2,4}$/.test(shortName.trim());

  function handleSaveDetails() {
    startDetailsTransition(async () => {
      const result = await updateClub({
        groupId,
        clubId: club.id,
        name: name.trim(),
        shortName: shortName.trim(),
        primaryColor,
        secondaryColor,
        crestPath,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.clubs.saved);
      router.refresh();
    });
  }

  function handleCrestFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const ext = EXT_BY_MIME[file.type];
    if (!ext) {
      toast.error(es.clubs.crestBadType);
      return;
    }
    if (file.size > MAX_CREST_BYTES) {
      toast.error(es.clubs.crestTooBig);
      return;
    }

    startCrestTransition(async () => {
      const path = `${groupId}/${club.id}.${ext}`;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("club-crests")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) {
        toast.error(es.common.error);
        return;
      }

      const { data } = supabase.storage.from("club-crests").getPublicUrl(path);
      const result = await updateClub({
        groupId,
        clubId: club.id,
        name: name.trim(),
        shortName: shortName.trim(),
        primaryColor,
        secondaryColor,
        crestPath: path,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setCrestPath(path);
      setCrestUrl(`${data.publicUrl}?v=${Date.now()}`);
      toast.success(es.clubs.saved);
    });
  }

  function handleRemoveCrest() {
    startCrestTransition(async () => {
      const result = await updateClub({
        groupId,
        clubId: club.id,
        name: name.trim(),
        shortName: shortName.trim(),
        primaryColor,
        secondaryColor,
        crestPath: null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setCrestPath(null);
      setCrestUrl(null);
      toast.success(es.clubs.saved);
    });
  }

  function toggleRosterPlayer(playerId: string, checked: boolean) {
    setRoster((prev) => {
      const next = { ...prev };
      if (checked) {
        next[playerId] = prev[playerId] ?? null;
      } else {
        delete next[playerId];
      }
      return next;
    });
  }

  function setShirtNumber(playerId: string, value: string) {
    const n = value.trim() === "" ? null : Number(value);
    setRoster((prev) => ({ ...prev, [playerId]: n === null || Number.isNaN(n) ? null : n }));
  }

  const rosterEntries = Object.entries(roster);
  const shirtNumbers = rosterEntries.flatMap(([, n]) => (n === null ? [] : [n]));
  const hasDuplicateShirtNumbers = new Set(shirtNumbers).size !== shirtNumbers.length;

  function handleSaveRoster() {
    if (hasDuplicateShirtNumbers) {
      toast.error(es.clubs.shirtNumberDuplicate);
      return;
    }
    startRosterTransition(async () => {
      const result = await setClubPlayers({
        groupId,
        clubId: club.id,
        players: rosterEntries.map(([playerId, shirtNumber]) => ({ playerId, shirtNumber })),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.clubs.saved);
      router.refresh();
    });
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      const result = await deleteClub({ groupId, clubId: club.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.clubs.deleted);
      router.push(`/g/${groupId}/clubes`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <div className="flex items-center gap-4">
          <ClubCrest
            crestUrl={crestUrl}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            shortName={shortName || "?"}
            name={name || es.clubs.title}
            size="lg"
          />
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={handleCrestFileChange}
            />
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => fileInputRef.current?.click()}
              disabled={crestPending}
            >
              {es.clubs.uploadCrest}
            </Button>
            {crestUrl && (
              <Button type="button" variant="ghost" className="h-11" onClick={handleRemoveCrest} disabled={crestPending}>
                {es.clubs.removeCrest}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">{es.clubs.crestHelp}</p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="club-form-name">{es.clubs.name}</Label>
          <Input id="club-form-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="h-11" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="club-form-short-name">{es.clubs.shortName}</Label>
          <Input
            id="club-form-short-name"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            maxLength={4}
            className="h-11 uppercase"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="club-form-primary">{es.clubs.primaryColor}</Label>
            <input
              id="club-form-primary"
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-11 w-full rounded-md border border-input"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="club-form-secondary">{es.clubs.secondaryColor}</Label>
            <input
              id="club-form-secondary"
              type="color"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              className="h-11 w-full rounded-md border border-input"
            />
          </div>
        </div>

        <Button
          type="button"
          className="h-11 self-start"
          onClick={handleSaveDetails}
          disabled={detailsPending || name.trim().length === 0 || !shortNameValid}
        >
          {es.common.save}
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="text-sm font-medium">{es.clubs.roster}</h2>
        {hasDuplicateShirtNumbers && <p className="text-sm text-destructive">{es.clubs.shirtNumberDuplicate}</p>}
        <div className="flex flex-col gap-1.5">
          {players.map((player) => {
            const onRoster = Object.hasOwn(roster, player.id);
            return (
              <div
                key={player.id}
                className="flex min-h-11 items-center gap-2 rounded-lg bg-background p-2 ring-1 ring-foreground/10"
              >
                <Checkbox
                  id={`club-roster-${player.id}`}
                  checked={onRoster}
                  onCheckedChange={(checked) => toggleRosterPlayer(player.id, checked === true)}
                  className="size-6"
                />
                <Avatar size="sm">
                  {player.avatarUrl && <AvatarImage src={player.avatarUrl} alt="" />}
                  <AvatarFallback>{initials(player.displayName)}</AvatarFallback>
                </Avatar>
                <label htmlFor={`club-roster-${player.id}`} className="min-w-0 flex-1 truncate text-sm">
                  {player.displayName}
                </label>
                {onRoster && (
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    placeholder={es.clubs.shirtNumber}
                    aria-label={`${es.clubs.shirtNumber}: ${player.displayName}`}
                    value={roster[player.id] ?? ""}
                    onChange={(e) => setShirtNumber(player.id, e.target.value)}
                    className="h-11 w-16 shrink-0"
                  />
                )}
              </div>
            );
          })}
        </div>
        <Button
          type="button"
          className="h-11 self-start"
          onClick={handleSaveRoster}
          disabled={rosterPending || hasDuplicateShirtNumbers}
        >
          {es.common.save}
        </Button>
      </div>

      <Button type="button" variant="destructive" className="h-11 self-start" onClick={() => setDeleteOpen(true)}>
        {es.clubs.delete}
      </Button>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{es.clubs.delete}</DialogTitle>
            <DialogDescription>{es.clubs.deleteConfirm}</DialogDescription>
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
    </div>
  );
}
