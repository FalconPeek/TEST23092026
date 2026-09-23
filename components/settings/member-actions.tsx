"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { es } from "@/messages/es";
import { removeMember, setMemberRole } from "@/lib/actions/groups";
import { memberActionsFor, type GroupRole, type MemberAction } from "@/lib/permissions";

const TARGET_ROLE: Record<Exclude<MemberAction, "remove">, "admin" | "member" | "spectator"> = {
  makeAdmin: "admin",
  removeAdmin: "member",
  toMember: "member",
  toSpectator: "spectator",
};

const CONFIRM_COPY: Record<MemberAction, { title: string; body: string }> = {
  makeAdmin: {
    title: es.settings.members.confirmMakeAdminTitle,
    body: es.settings.members.confirmMakeAdminBody,
  },
  removeAdmin: {
    title: es.settings.members.confirmRemoveAdminTitle,
    body: es.settings.members.confirmRemoveAdminBody,
  },
  toSpectator: {
    title: es.settings.members.confirmToSpectatorTitle,
    body: es.settings.members.confirmToSpectatorBody,
  },
  toMember: {
    title: es.settings.members.confirmToMemberTitle,
    body: es.settings.members.confirmToMemberBody,
  },
  remove: {
    title: es.settings.members.confirmRemoveTitle,
    body: es.settings.members.confirmRemoveBody,
  },
};

export function MemberActions({
  groupId,
  targetUserId,
  targetRole,
  myRole,
  isSelf,
}: {
  groupId: string;
  targetUserId: string;
  targetRole: GroupRole;
  myRole: GroupRole;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmAction, setConfirmAction] = useState<MemberAction | null>(null);
  const router = useRouter();

  const actions = memberActionsFor(myRole, targetRole, isSelf);
  if (actions.length === 0) return null;

  function run(action: MemberAction) {
    startTransition(async () => {
      const result =
        action === "remove"
          ? await removeMember({ groupId, userId: targetUserId })
          : await setMemberRole({ groupId, userId: targetUserId, role: TARGET_ROLE[action] });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(action === "remove" ? es.groups.memberRemoved : es.groups.roleChanged);
      setConfirmAction(null);
      router.refresh();
    });
  }

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
          {actions.map((action) => (
            <DropdownMenuItem
              key={action}
              variant={action === "remove" ? "destructive" : "default"}
              onSelect={() => setConfirmAction(action)}
            >
              {es.settings.members.actions[action]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent>
          {confirmAction && (
            <>
              <DialogHeader>
                <DialogTitle>{CONFIRM_COPY[confirmAction].title}</DialogTitle>
                <DialogDescription>{CONFIRM_COPY[confirmAction].body}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{es.common.cancel}</Button>
                </DialogClose>
                <Button
                  variant={confirmAction === "remove" ? "destructive" : "default"}
                  disabled={pending}
                  onClick={() => run(confirmAction)}
                >
                  {es.common.confirm}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
