"use client";

import { useState, useTransition } from "react";
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
import { es } from "@/messages/es";
import { addGuestPlayer, assignGuestPlayer, claimGuestPlayer } from "@/lib/actions/groups";
import { canClaimGuest, isGroupAdmin, type GroupRole } from "@/lib/permissions";
import { POSITIONS, type PositionCode } from "@/lib/rating/positions";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export type GuestRow = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type MemberOption = { userId: string; role: GroupRole; displayName: string };

export function GuestPlayers({
  groupId,
  guests,
  members,
  myRole,
}: {
  groupId: string;
  guests: GuestRow[];
  members: MemberOption[];
  myRole: GroupRole;
}) {
  const admin = isGroupAdmin(myRole);
  const canClaim = canClaimGuest(myRole);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [position, setPosition] = useState<PositionCode | "">("");

  const [assignTarget, setAssignTarget] = useState<GuestRow | null>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [claimTarget, setClaimTarget] = useState<GuestRow | null>(null);

  function handleAdd() {
    startTransition(async () => {
      const result = await addGuestPlayer({
        groupId,
        displayName: name,
        primaryPosition: position || undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.groups.guestAdded);
      setName("");
      setPosition("");
      router.refresh();
    });
  }

  function handleAssign() {
    if (!assignTarget || !assignUserId) return;
    startTransition(async () => {
      const result = await assignGuestPlayer({ groupId, playerId: assignTarget.id, userId: assignUserId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.groups.guestClaimed);
      setAssignTarget(null);
      setAssignUserId("");
      router.refresh();
    });
  }

  function handleClaim() {
    if (!claimTarget) return;
    startTransition(async () => {
      const result = await claimGuestPlayer({ groupId, playerId: claimTarget.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.groups.guestClaimed);
      setClaimTarget(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {admin && (
        <div className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="guest-name">{es.settings.guests.nameLabel}</Label>
            <Input
              id="guest-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={es.settings.guests.namePlaceholder}
              maxLength={60}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{es.settings.guests.positionLabel}</Label>
            <Select
              value={position || "none"}
              onValueChange={(v) => setPosition(v === "none" ? "" : (v as PositionCode))}
            >
              <SelectTrigger className="w-full sm:w-40">
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
          <Button onClick={handleAdd} disabled={pending || name.trim().length === 0}>
            {es.settings.guests.add}
          </Button>
        </div>
      )}

      {guests.length === 0 ? (
        <p className="text-sm text-muted-foreground">{es.settings.guests.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {guests.map((guest) => (
            <li
              key={guest.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 ring-1 ring-foreground/10"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Avatar>
                  {guest.avatarUrl && <AvatarImage src={guest.avatarUrl} alt={guest.displayName} />}
                  <AvatarFallback>{initials(guest.displayName)}</AvatarFallback>
                </Avatar>
                <span className="truncate text-sm font-medium">{guest.displayName}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {admin && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setAssignTarget(guest)}>
                    {es.settings.guests.assignTo}
                  </Button>
                )}
                {canClaim && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setClaimTarget(guest)}>
                    {es.settings.guests.claim}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={assignTarget !== null} onOpenChange={(open) => !open && setAssignTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{es.settings.guests.assignTo}</DialogTitle>
          </DialogHeader>
          <Select value={assignUserId} onValueChange={setAssignUserId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={es.settings.guests.assignTo} />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{es.common.cancel}</Button>
            </DialogClose>
            <Button onClick={handleAssign} disabled={pending || !assignUserId}>
              {es.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={claimTarget !== null} onOpenChange={(open) => !open && setClaimTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{es.settings.guests.confirmClaimTitle}</DialogTitle>
            <DialogDescription>{es.settings.guests.confirmClaimBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{es.common.cancel}</Button>
            </DialogClose>
            <Button onClick={handleClaim} disabled={pending}>
              {es.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
