"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "cn";
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
import {
  generateTournamentBracket,
  registerForTournament,
  setTournamentStatus,
  unregisterFromTournament,
} from "@/lib/actions/tournaments";
import type { Database } from "@/lib/supabase/database.types";

type TournamentStatus = Database["public"]["Enums"]["tournament_status"];

export function TournamentTabs({
  groupId,
  tournamentId,
  showBracket,
  showTable,
  showFixtures,
}: {
  groupId: string;
  tournamentId: string;
  showBracket: boolean;
  showTable: boolean;
  showFixtures: boolean;
}) {
  const pathname = usePathname();
  const base = `/g/${groupId}/torneos/${tournamentId}`;
  const tabs = [
    { href: base, label: es.tournament.tabs.overview, exact: true },
    ...(showBracket ? [{ href: `${base}/llave`, label: es.tournament.tabs.bracket, exact: false }] : []),
    ...(showTable ? [{ href: `${base}/tabla`, label: es.tournament.tabs.table, exact: false }] : []),
    ...(showFixtures ? [{ href: `${base}/fechas`, label: es.tournament.tabs.fixtures, exact: false }] : []),
  ];

  return (
    <nav className="flex gap-1 border-b border-border">
      {tabs.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center border-b-2 border-transparent px-3 text-sm text-muted-foreground",
              active && "border-primary text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function TournamentAdminControls({
  groupId,
  tournamentId,
  status,
  canGenerate,
}: {
  groupId: string;
  tournamentId: string;
  status: TournamentStatus;
  canGenerate: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleOpenRegistration() {
    startTransition(async () => {
      const result = await setTournamentStatus({ tournamentId, groupId, status: "registration" });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateTournamentBracket({ tournamentId, groupId });
      setConfirmOpen(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(es.tournament.generated);
      router.refresh();
    });
  }

  function handleFinish() {
    startTransition(async () => {
      const result = await setTournamentStatus({ tournamentId, groupId, status: "finished" });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        {status === "draft" && (
          <Button variant="outline" onClick={handleOpenRegistration} disabled={pending}>
            {es.tournament.openRegistration}
          </Button>
        )}
        {(status === "draft" || status === "registration") && (
          <Button onClick={() => setConfirmOpen(true)} disabled={pending || !canGenerate}>
            {es.tournament.closeAndGenerate}
          </Button>
        )}
        {status === "in_progress" && (
          <Button variant="outline" onClick={handleFinish} disabled={pending}>
            {es.tournament.finish}
          </Button>
        )}
      </div>
      {(status === "draft" || status === "registration") && !canGenerate && (
        <p className="text-xs text-muted-foreground">{es.tournament.needTwoEntries}</p>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{es.tournament.closeAndGenerate}</DialogTitle>
            <DialogDescription>{es.tournament.generateConfirm}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{es.common.cancel}</Button>
            </DialogClose>
            <Button onClick={handleGenerate} disabled={pending}>
              {es.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function TournamentRegisterButton({
  groupId,
  tournamentId,
  isRegistered,
}: {
  groupId: string;
  tournamentId: string;
  isRegistered: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      const action = isRegistered ? unregisterFromTournament : registerForTournament;
      const result = await action({ tournamentId, groupId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Button variant={isRegistered ? "outline" : "default"} className="h-11" onClick={handleClick} disabled={pending}>
      {isRegistered ? es.tournament.unregister : es.tournament.register}
    </Button>
  );
}
