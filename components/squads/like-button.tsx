"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { es } from "@/messages/es";
import { likeSquad } from "@/lib/actions/squads";

export function LikeButton({
  groupId,
  squadId,
  initialLiked,
  initialCount,
}: {
  groupId: string;
  squadId: string;
  initialLiked: boolean;
  initialCount: number;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    const next = !liked;
    startTransition(async () => {
      const result = await likeSquad({ groupId, squadId, like: next });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setLiked(next);
      setCount((c) => c + (next ? 1 : -1));
      router.refresh();
    });
  }

  return (
    <Button type="button" variant={liked ? "default" : "outline"} size="sm" className="h-11" onClick={handleClick} disabled={pending}>
{`${es.squads.like} (${count})`}
    </Button>
  );
}
