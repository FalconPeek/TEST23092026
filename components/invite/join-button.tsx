"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { es } from "@/messages/es";
import { acceptInvite } from "@/lib/actions/groups";

export function JoinButton({ code }: { code: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleJoin() {
    startTransition(async () => {
      const result = await acceptInvite({ code });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.groups.joined);
      router.replace(`/g/${result.data.groupId}`);
    });
  }

  return (
    <Button onClick={handleJoin} disabled={pending}>
      {es.invite.join}
    </Button>
  );
}
