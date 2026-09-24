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
import { es } from "@/messages/es";
import { finalizeMatchNow } from "@/lib/actions/finalize";

export function FinalizeButton({ matchId }: { matchId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleFinalize() {
    startTransition(async () => {
      const result = await finalizeMatchNow({ matchId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setOpen(false);
      const { outcome } = result.data;
      if (outcome.status === "finalized") {
        toast.success(es.match.finalized);
        if (outcome.tournamentSyncError) toast.warning(outcome.tournamentSyncError);
      } else if (outcome.status === "disputed") {
        toast.error(es.match.disputedTitle);
      }
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" className="h-11 w-full" onClick={() => setOpen(true)}>
        {es.match.finalizeNow}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{es.match.finalizeNow}</DialogTitle>
            <DialogDescription>{es.match.finalizeConfirm}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{es.common.cancel}</Button>
            </DialogClose>
            <Button onClick={handleFinalize} disabled={pending}>
              {es.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
