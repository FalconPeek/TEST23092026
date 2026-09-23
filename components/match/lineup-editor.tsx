"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { es } from "@/messages/es";
import { cancelMatch, setMatchLineup, startReporting } from "@/lib/actions/matches";
import { seededRng } from "@/lib/brackets";
import { applyBalance, countByAssignment, cyclePlayer, teamStrength, type LineupPlayer } from "@/lib/match/lineup";
import { POSITIONS, type PositionCode } from "@/lib/rating/positions";

export type EditorPlayer = LineupPlayer & { displayName: string; avatarUrl: string | null };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function LineupEditor({
  groupId,
  matchId,
  teamSize,
  initialPlayers,
  initialTeam1Name,
  initialTeam1Color,
  initialTeam2Name,
  initialTeam2Color,
}: {
  groupId: string;
  matchId: string;
  teamSize: number;
  initialPlayers: EditorPlayer[];
  initialTeam1Name: string;
  initialTeam1Color: string | null;
  initialTeam2Name: string;
  initialTeam2Color: string | null;
}) {
  const [players, setPlayers] = useState<EditorPlayer[]>(initialPlayers);
  const [team1Name, setTeam1Name] = useState(initialTeam1Name);
  const [team1Color, setTeam1Color] = useState(initialTeam1Color ?? "");
  const [team2Name, setTeam2Name] = useState(initialTeam2Name);
  const [team2Color, setTeam2Color] = useState(initialTeam2Color ?? "");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);

  const [savePending, startSaveTransition] = useTransition();
  const [startPending, startStartTransition] = useTransition();
  const [cancelPending, startCancelTransition] = useTransition();

  const router = useRouter();

  const counts = countByAssignment(players);
  const hasAnyTeamAssignment = counts.team1 + counts.team2 > 0;

  function handleCycle(playerId: string) {
    setPlayers((prev) => cyclePlayer(prev, playerId));
  }

  function handlePositionChange(playerId: string, position: PositionCode | null) {
    setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, position } : p)));
  }

  function handleBalance() {
    setPlayers((prev) => applyBalance(prev, seededRng(Date.now())));
  }

  function handleSaveLineup() {
    const team1Players = players.filter((p) => p.assignment === "team1");
    const team2Players = players.filter((p) => p.assignment === "team2");
    const spectators = players.filter((p) => p.assignment === "spectator").map((p) => p.id);

    if (team1Players.length === 0 || team2Players.length === 0) {
      toast.error(es.errors.validation);
      return;
    }

    startSaveTransition(async () => {
      const result = await setMatchLineup({
        groupId,
        matchId,
        team1: {
          name: team1Name.trim() || es.matches.team1Default,
          color: team1Color.trim() || undefined,
          players: team1Players.map((p) => ({ playerId: p.id, position: p.position ?? undefined })),
        },
        team2: {
          name: team2Name.trim() || es.matches.team2Default,
          color: team2Color.trim() || undefined,
          players: team2Players.map((p) => ({ playerId: p.id, position: p.position ?? undefined })),
        },
        spectators,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.matches.lineupSaved);
      router.push(`/g/${groupId}/partidos`);
    });
  }

  function handleStartReporting() {
    startStartTransition(async () => {
      const result = await startReporting({ groupId, matchId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.matches.reportingStarted);
      setStartOpen(false);
      router.push(`/g/${groupId}/partidos`);
    });
  }

  function handleCancelMatch() {
    startCancelTransition(async () => {
      const result = await cancelMatch({ groupId, matchId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.matches.cancelled);
      setCancelOpen(false);
      router.push(`/g/${groupId}/partidos`);
    });
  }

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{es.matches.lineup}</h1>
        <Button variant="outline" size="sm" onClick={handleBalance}>
          {hasAnyTeamAssignment ? es.matches.rebalance : es.matches.balance}
        </Button>
      </div>

      <TeamSection
        label="1"
        name={team1Name}
        onNameChange={setTeam1Name}
        color={team1Color}
        onColorChange={setTeam1Color}
        players={players.filter((p) => p.assignment === "team1")}
        teamSize={teamSize}
        onCycle={handleCycle}
        onPositionChange={handlePositionChange}
      />

      <TeamSection
        label="2"
        name={team2Name}
        onNameChange={setTeam2Name}
        color={team2Color}
        onColorChange={setTeam2Color}
        players={players.filter((p) => p.assignment === "team2")}
        teamSize={teamSize}
        onCycle={handleCycle}
        onPositionChange={handlePositionChange}
      />

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          {es.matches.spectators} ({counts.spectator})
        </h2>
        <PlayerList players={players.filter((p) => p.assignment === "spectator")} onCycle={handleCycle} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          {es.matches.bench} ({counts.unassigned})
        </h2>
        <PlayerList players={players.filter((p) => p.assignment === "unassigned")} onCycle={handleCycle} />
      </div>

      <div className="sticky bottom-20 z-30 -mx-4 flex flex-col gap-2 bg-background/95 px-4 py-2 backdrop-blur-sm">
        <Button className="w-full" onClick={handleSaveLineup} disabled={savePending}>
          {es.matches.saveLineup}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setStartOpen(true)}>
            {es.matches.startReporting}
          </Button>
          <Button variant="destructive" className="flex-1" onClick={() => setCancelOpen(true)}>
            {es.matches.cancel}
          </Button>
        </div>
      </div>

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{es.matches.startReporting}</DialogTitle>
            <DialogDescription>{es.matches.cancelConfirm}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{es.common.cancel}</Button>
            </DialogClose>
            <Button onClick={handleStartReporting} disabled={startPending}>
              {es.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{es.matches.cancel}</DialogTitle>
            <DialogDescription>{es.matches.cancelConfirm}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{es.common.cancel}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleCancelMatch} disabled={cancelPending}>
              {es.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeamSection({
  label,
  name,
  onNameChange,
  color,
  onColorChange,
  players,
  teamSize,
  onCycle,
  onPositionChange,
}: {
  label: string;
  name: string;
  onNameChange: (value: string) => void;
  color: string;
  onColorChange: (value: string) => void;
  players: EditorPlayer[];
  teamSize: number;
  onCycle: (playerId: string) => void;
  onPositionChange: (playerId: string, position: PositionCode | null) => void;
}) {
  const strength = teamStrength(players, label === "1" ? "team1" : ("team2" as const));
  const countMismatch = players.length !== teamSize;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={label === "1" ? es.matches.team1Default : es.matches.team2Default}
          className="flex-1"
          aria-label={`${es.matches.lineup} ${label}`}
        />
        <Input
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          placeholder="#RRGGBB"
          className="w-24"
          aria-label={`Color ${label}`}
        />
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{es.matches.strength(strength.sumMu, strength.avgOvr)}</span>
        <Badge variant={countMismatch ? "destructive" : "outline"}>
          {players.length}/{teamSize}
        </Badge>
      </div>
      <PlayerList players={players} onCycle={onCycle} onPositionChange={onPositionChange} showPosition />
    </div>
  );
}

function PlayerList({
  players,
  onCycle,
  onPositionChange,
  showPosition = false,
}: {
  players: EditorPlayer[];
  onCycle: (playerId: string) => void;
  onPositionChange?: (playerId: string, position: PositionCode | null) => void;
  showPosition?: boolean;
}) {
  if (players.length === 0) {
    return <p className="text-xs text-muted-foreground">{es.matches.bench}</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {players.map((player) => (
        <div
          key={player.id}
          className="flex items-center gap-2 rounded-lg bg-card px-2 py-1.5 ring-1 ring-foreground/10"
        >
          <button
            type="button"
            onClick={() => onCycle(player.id)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <Avatar size="sm">
              {player.avatarUrl && <AvatarImage src={player.avatarUrl} alt="" />}
              <AvatarFallback>{initials(player.displayName)}</AvatarFallback>
            </Avatar>
            <span className="truncate text-sm">{player.displayName}</span>
          </button>
          {showPosition && onPositionChange && (
            <Select
              value={player.position ?? "none"}
              onValueChange={(v) => onPositionChange(player.id, v === "none" ? null : (v as PositionCode))}
            >
              <SelectTrigger size="sm" className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {POSITIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      ))}
    </div>
  );
}
