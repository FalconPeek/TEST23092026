"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { es } from "@/messages/es";
import { createGroup } from "@/lib/actions/groups";

export function CreateGroupDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createGroup({ name });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.groups.created);
      setOpen(false);
      setName("");
      router.push(`/g/${result.data.groupId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{es.groups.create}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{es.groups.create}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-name">{es.groups.nameLabel}</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={es.groups.namePlaceholder}
              required
              maxLength={60}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {es.common.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || name.trim().length === 0}>
              {es.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
