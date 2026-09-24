"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { es } from "@/messages/es";

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * The profile page requires login, so a link preview of it can't render the card image. Shares
 * the public `/api/og/card/[playerId]` image directly instead: as a file (best, shows the actual
 * card in share sheets that support it), else as a shared URL, else copied to the clipboard.
 */
export function ShareCardButton({ playerId, playerName }: { playerId: string; playerName: string }) {
  const [pending, startTransition] = useTransition();
  const path = `/api/og/card/${playerId}`;

  function handleShare() {
    startTransition(async () => {
      const title = es.app.name;
      const text = es.profile.shareText(playerName);
      const url = `${window.location.origin}${path}`;

      try {
        const response = await fetch(path);
        const blob = await response.blob();
        const file = new File([blob], `carta-${slugify(playerName)}.png`, { type: "image/png" });

        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title, text });
          return;
        }
        if (navigator.share) {
          await navigator.share({ title, text, url });
          return;
        }
        await navigator.clipboard.writeText(url);
        toast.success(es.profile.linkCopied);
      } catch (err) {
        if ((err as { name?: string } | null)?.name === "AbortError") return;
        toast.error(es.common.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="outline" onClick={handleShare} disabled={pending}>
        {es.profile.share}
      </Button>
      <a
        href={path}
        download={`carta-${slugify(playerName)}.png`}
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {es.profile.downloadCard}
      </a>
    </div>
  );
}
