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
import { createClub } from "@/lib/actions/clubs";

const DEFAULT_PRIMARY = "#1e3a5f";
const DEFAULT_SECONDARY = "#ffffff";

export function CreateClubDialog({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY);
  const [secondaryColor, setSecondaryColor] = useState(DEFAULT_SECONDARY);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const shortNameValid = /^[A-Za-z0-9]{2,4}$/.test(shortName.trim());

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createClub({
        groupId,
        name: name.trim(),
        shortName: shortName.trim(),
        primaryColor,
        secondaryColor,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.clubs.saved);
      setOpen(false);
      router.push(`/g/${groupId}/clubes/${result.data.clubId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{es.clubs.new}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{es.clubs.new}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="club-name">{es.clubs.name}</Label>
            <Input
              id="club-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={40}
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="club-short-name">{es.clubs.shortName}</Label>
            <Input
              id="club-short-name"
              value={shortName}
              onChange={(event) => setShortName(event.target.value)}
              required
              maxLength={4}
              className="h-11 uppercase"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="club-primary-color">{es.clubs.primaryColor}</Label>
              <input
                id="club-primary-color"
                type="color"
                value={primaryColor}
                onChange={(event) => setPrimaryColor(event.target.value)}
                className="h-11 w-full rounded-md border border-input"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="club-secondary-color">{es.clubs.secondaryColor}</Label>
              <input
                id="club-secondary-color"
                type="color"
                value={secondaryColor}
                onChange={(event) => setSecondaryColor(event.target.value)}
                className="h-11 w-full rounded-md border border-input"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="h-11">
                {es.common.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" className="h-11" disabled={pending || name.trim().length === 0 || !shortNameValid}>
              {es.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
