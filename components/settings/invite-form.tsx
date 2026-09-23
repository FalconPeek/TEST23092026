"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { es } from "@/messages/es";
import { createInvite } from "@/lib/actions/groups";
import { canInviteAdmin, type GroupRole } from "@/lib/permissions";

type InviteRole = "member" | "spectator" | "admin";
type ExpiryOption = "1" | "7" | "30" | "never";

const EXPIRY_OPTIONS: ExpiryOption[] = ["1", "7", "30", "never"];

export function InviteForm({ groupId, myRole }: { groupId: string; myRole: GroupRole }) {
  const [role, setRole] = useState<InviteRole>("member");
  const [expiry, setExpiry] = useState<ExpiryOption>("7");
  const [maxUses, setMaxUses] = useState("");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const roleOptions: InviteRole[] = canInviteAdmin(myRole)
    ? ["member", "spectator", "admin"]
    : ["member", "spectator"];

  function handleCreate() {
    startTransition(async () => {
      const result = await createInvite({
        groupId,
        role,
        expiresInDays: expiry === "never" ? null : Number(expiry),
        maxUses: maxUses.trim() === "" ? null : Number(maxUses),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.groups.inviteCreated);
      setCreatedUrl(result.data.url);
      setCopied(false);
      router.refresh();
    });
  }

  async function handleCopy() {
    if (!createdUrl) return;
    await navigator.clipboard.writeText(createdUrl);
    setCopied(true);
    toast.success(es.settings.invites.copied);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label>{es.settings.invites.roleLabel}</Label>
          <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((r) => (
                <SelectItem key={r} value={r}>
                  {es.roles[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{es.settings.invites.expiresLabel}</Label>
          <Select value={expiry} onValueChange={(v) => setExpiry(v as ExpiryOption)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {es.settings.invites.expiresOptions[opt]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-max-uses">{es.settings.invites.maxUsesLabel}</Label>
          <Input
            id="invite-max-uses"
            type="number"
            min={1}
            placeholder={es.settings.invites.maxUsesUnlimited}
            value={maxUses}
            onChange={(event) => setMaxUses(event.target.value)}
          />
        </div>
      </div>

      <Button onClick={handleCreate} disabled={pending} className="self-start">
        {es.settings.invites.create}
      </Button>

      {createdUrl && (
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate">{createdUrl}</span>
          <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
            {copied ? es.settings.invites.copied : es.settings.invites.copy}
          </Button>
        </div>
      )}
    </div>
  );
}
