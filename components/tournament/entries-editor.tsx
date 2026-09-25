"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClubCrest } from "@/components/clubs/club-crest";
import { es } from "@/messages/es";
import { saveTournamentEntries } from "@/lib/actions/tournaments";
import {
  addEntry,
  assignPlayer,
  averageOvr,
  removeEntry,
  renameEntry,
  setEntryClub,
  setSeed,
  unassignedPlayerIds,
  unassignPlayer,
  validateEntries,
  type DraftEntry,
} from "@/lib/tournament/entries";

export type EntryPlayer = { id: string; displayName: string; avatarUrl: string | null; ovr: number };

/** A group's club, as offered in the entry's "Usar club" select (includes its roster for prefill). */
export type EntryClub = {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  crestUrl: string | null;
  playerIds: string[];
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function PlayerRow({ player }: { player: EntryPlayer }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar size="sm">
        {player.avatarUrl && <AvatarImage src={player.avatarUrl} alt="" />}
        <AvatarFallback>{initials(player.displayName)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-sm">{player.displayName}</span>
    </div>
  );
}

export function EntriesEditor({
  groupId,
  tournamentId,
  players,
  initialEntries,
  editable,
  clubs = [],
}: {
  groupId: string;
  tournamentId: string;
  players: EntryPlayer[];
  initialEntries: DraftEntry[];
  editable: boolean;
  clubs?: EntryClub[];
}) {
  const [entries, setEntries] = useState<DraftEntry[]>(initialEntries);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const nextId = useRef(0);

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const ovrByPlayer = useMemo(() => new Map(players.map((p) => [p.id, p.ovr])), [players]);
  const clubById = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);
  const unassignedIds = useMemo(
    () => unassignedPlayerIds(entries, players.map((p) => p.id)),
    [entries, players],
  );

  function handleAddEntry() {
    const id = `new-${nextId.current++}`;
    setEntries((prev) => addEntry(prev, id, `${es.tournament.entries} ${prev.length + 1}`));
  }

  function handlePickClub(entryId: string, clubId: string) {
    const club = clubId === "none" ? null : (clubById.get(clubId) ?? null);
    setEntries((prev) => setEntryClub(prev, entryId, club ? { id: club.id, name: club.name, playerIds: club.playerIds } : null));
  }

  function handleSave() {
    const validationError = validateEntries(entries);
    if (validationError) {
      setError(validationError === "too_few" ? es.tournament.needTwoEntries : es.errors.validation);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveTournamentEntries({
        groupId,
        tournamentId,
        entries: entries.map((e) => ({ name: e.name.trim(), seed: e.seed, playerIds: e.playerIds, clubId: e.clubId })),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.tournament.entriesSaved);
      router.refresh();
    });
  }

  if (!editable) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{es.tournament.entries}</h2>
        {entries.map((entry) => {
          const club = entry.clubId ? clubById.get(entry.clubId) : undefined;
          return (
          <div key={entry.id} className="flex flex-col gap-1.5 rounded-lg bg-card p-3 ring-1 ring-foreground/10">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                {club && (
                  <ClubCrest
                    crestUrl={club.crestUrl}
                    primaryColor={club.primaryColor}
                    secondaryColor={club.secondaryColor}
                    shortName={club.shortName}
                    name={club.name}
                    size="sm"
                  />
                )}
                <span className="truncate text-sm font-medium">{entry.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {es.tournament.avgOvr} {Math.round(averageOvr(entry.playerIds, ovrByPlayer))}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {entry.playerIds.map((id) => {
                const player = playerById.get(id);
                return player ? <PlayerRow key={id} player={player} /> : null;
              })}
            </div>
          </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{es.tournament.entries}</h2>
        <Button type="button" variant="outline" size="sm" onClick={handleAddEntry}>
          {es.tournament.addEntry}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-3">
        {entries.map((entry) => {
          const club = entry.clubId ? clubById.get(entry.clubId) : undefined;
          return (
          <div key={entry.id} className="flex flex-col gap-2 rounded-lg bg-card p-3 ring-1 ring-foreground/10">
            <div className="flex items-center gap-2">
              {club && (
                <ClubCrest
                  crestUrl={club.crestUrl}
                  primaryColor={club.primaryColor}
                  secondaryColor={club.secondaryColor}
                  shortName={club.shortName}
                  name={club.name}
                  size="sm"
                />
              )}
              <Input
                aria-label={es.tournament.entryName}
                value={entry.name}
                onChange={(e) => setEntries((prev) => renameEntry(prev, entry.id, e.target.value))}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0"
                onClick={() => setEntries((prev) => removeEntry(prev, entry.id))}
                aria-label={es.tournament.removeEntry}
              >
                <X className="size-4" />
              </Button>
            </div>

            {clubs.length > 0 && (
              <Select value={entry.clubId ?? "none"} onValueChange={(value) => handlePickClub(entry.id, value)}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder={es.tournament.useClub} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{es.tournament.noClub}</SelectItem>
                  {clubs.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Label htmlFor={`seed-${entry.id}`} className="text-xs">
                  {es.tournament.seed}
                </Label>
                <Input
                  id={`seed-${entry.id}`}
                  type="number"
                  min={1}
                  className="w-16"
                  value={entry.seed ?? ""}
                  onChange={(e) =>
                    setEntries((prev) =>
                      setSeed(prev, entry.id, e.target.value === "" ? null : Number(e.target.value)),
                    )
                  }
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {es.tournament.avgOvr} {Math.round(averageOvr(entry.playerIds, ovrByPlayer))}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              {entry.playerIds.length === 0 && (
                <p className="text-xs text-muted-foreground">{es.tournament.unassigned}</p>
              )}
              {entry.playerIds.map((id) => {
                const player = playerById.get(id);
                if (!player) return null;
                return (
                  <div key={id} className="flex items-center justify-between gap-2">
                    <PlayerRow player={player} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 shrink-0"
                      onClick={() => setEntries((prev) => unassignPlayer(prev, id))}
                      aria-label={es.tournament.removePlayer}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{es.tournament.unassigned}</h3>
        {unassignedIds.length === 0 ? (
          <p className="text-xs text-muted-foreground">—</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {unassignedIds.map((id) => {
              const player = playerById.get(id);
              if (!player) return null;
              return (
                <div
                  key={id}
                  className="flex items-center justify-between gap-2 rounded-md bg-background p-2 ring-1 ring-foreground/10"
                >
                  <PlayerRow player={player} />
                  <Select
                    value=""
                    onValueChange={(entryId) => setEntries((prev) => assignPlayer(prev, entryId, id))}
                    disabled={entries.length === 0}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder={es.tournament.assignTo} />
                    </SelectTrigger>
                    <SelectContent>
                      {entries.map((entry) => (
                        <SelectItem key={entry.id} value={entry.id}>
                          {entry.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Button className="h-11 w-full" onClick={handleSave} disabled={pending}>
        {es.tournament.saveEntries}
      </Button>
    </div>
  );
}
