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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { es } from "@/messages/es";
import { leaveGroup, transferOwnership } from "@/lib/actions/groups";
import type { GroupRole } from "@/lib/permissions";

export function DangerZone({
  groupId,
  myRole,
  members,
}: {
  groupId: string;
  myRole: GroupRole;
  members: { userId: string; role: GroupRole; displayName: string }[];
}) {
  const isOwner = myRole === "owner";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [transferOpen, setTransferOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [newOwnerId, setNewOwnerId] = useState("");

  const otherMembers = members.filter((m) => m.role === "admin" || m.role === "member");

  function handleTransfer() {
    if (!newOwnerId) return;
    startTransition(async () => {
      const result = await transferOwnership({ groupId, newOwnerId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.groups.ownershipTransferred);
      setTransferOpen(false);
      setNewOwnerId("");
      router.refresh();
    });
  }

  function handleLeave() {
    startTransition(async () => {
      const result = await leaveGroup({ groupId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.groups.left);
      router.replace("/g");
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-destructive/20">
      {isOwner && (
        <Button type="button" variant="outline" className="self-start" onClick={() => setTransferOpen(true)}>
          {es.settings.danger.transfer}
        </Button>
      )}

      <div className="flex flex-col items-start gap-1">
        <Button
          type="button"
          variant="destructive"
          disabled={isOwner}
          onClick={() => setLeaveOpen(true)}
        >
          {es.settings.danger.leave}
        </Button>
        {isOwner && <p className="text-xs text-muted-foreground">{es.settings.danger.leaveDisabledHint}</p>}
      </div>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{es.settings.danger.confirmTransferTitle}</DialogTitle>
            <DialogDescription>{es.settings.danger.confirmTransferBody}</DialogDescription>
          </DialogHeader>
          <Select value={newOwnerId} onValueChange={setNewOwnerId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={es.settings.danger.transferLabel} />
            </SelectTrigger>
            <SelectContent>
              {otherMembers.map((m) => (
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
            <Button onClick={handleTransfer} disabled={pending || !newOwnerId}>
              {es.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{es.settings.danger.confirmLeaveTitle}</DialogTitle>
            <DialogDescription>{es.settings.danger.confirmLeaveBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{es.common.cancel}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleLeave} disabled={pending}>
              {es.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
