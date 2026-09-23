"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { es } from "@/messages/es";
import { revokeInvite } from "@/lib/actions/groups";
import { siteUrl } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";

export type InviteRow = {
  id: string;
  code: string;
  role: Database["public"]["Enums"]["group_role"];
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  revoked_at: string | null;
};

type Status = "active" | "expired" | "revoked" | "usedUp";

function statusOf(invite: InviteRow): Status {
  if (invite.revoked_at) return "revoked";
  if (invite.expires_at && new Date(invite.expires_at) <= new Date()) return "expired";
  if (invite.max_uses !== null && invite.uses >= invite.max_uses) return "usedUp";
  return "active";
}

const STATUS_VARIANT: Record<Status, "default" | "destructive" | "outline"> = {
  active: "default",
  expired: "outline",
  revoked: "destructive",
  usedUp: "outline",
};

export function InviteList({ groupId, invites }: { groupId: string; invites: InviteRow[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<InviteRow | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleRevoke(invite: InviteRow) {
    startTransition(async () => {
      const result = await revokeInvite({ groupId, inviteId: invite.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.groups.inviteRevoked);
      setRevokeTarget(null);
      router.refresh();
    });
  }

  async function handleCopy(invite: InviteRow) {
    await navigator.clipboard.writeText(`${siteUrl()}invitacion/${invite.code}`);
    setCopiedId(invite.id);
    toast.success(es.settings.invites.copied);
  }

  if (invites.length === 0) {
    return <p className="text-sm text-muted-foreground">{es.settings.invites.empty}</p>;
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {invites.map((invite) => {
          const status = statusOf(invite);
          return (
            <li
              key={invite.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 ring-1 ring-foreground/10"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-mono text-sm">{invite.code}</span>
                  <Badge variant={STATUS_VARIANT[status]}>{es.settings.invites.status[status]}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {es.roles[invite.role]} · {es.settings.invites.uses(invite.uses, invite.max_uses)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={() => handleCopy(invite)}>
                  {copiedId === invite.id ? es.settings.invites.copied : es.settings.invites.copy}
                </Button>
                {status === "active" && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setRevokeTarget(invite)}>
                    {es.settings.invites.revoke}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={revokeTarget !== null} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{es.settings.invites.confirmRevokeTitle}</DialogTitle>
            <DialogDescription>{es.settings.invites.confirmRevokeBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{es.common.cancel}</Button>
            </DialogClose>
            <Button variant="destructive" disabled={pending} onClick={() => revokeTarget && handleRevoke(revokeTarget)}>
              {es.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
