import Link from "next/link";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { MatchAdminMenu } from "@/components/tournament/match-admin-menu";
import { es } from "@/messages/es";
import type { BracketLayout, BracketMatchDisplay, BracketSlotDisplay } from "@/lib/tournament/bracket-layout";

function SlotRow({ slot, score }: { slot: BracketSlotDisplay; score: number | null }) {
  return (
    <div className={cn("flex items-center justify-between gap-2", slot.kind === "bye" && "text-muted-foreground/60")}>
      <span className={cn("min-w-0 flex-1 truncate text-sm", slot.isWinner && "font-semibold")}>{slot.label}</span>
      {score !== null && (
        <span className={cn("shrink-0 text-xs tabular-nums", slot.isWinner && "font-semibold")}>{score}</span>
      )}
    </div>
  );
}

function MatchCard({
  groupId,
  tournamentId,
  match,
  admin,
}: {
  groupId: string;
  tournamentId: string;
  match: BracketMatchDisplay;
  admin: boolean;
}) {
  const pensLabel = match.pens1 !== null && match.pens2 !== null ? `(${match.pens1}-${match.pens2} pen.)` : null;

  return (
    <div className="flex w-full flex-col gap-1.5 rounded-lg bg-card p-2.5 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between gap-1">
        <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
          {es.bracket.matchStatus[match.status]}
        </Badge>
        {admin && (
          <MatchAdminMenu
            groupId={groupId}
            tournamentId={tournamentId}
            tournamentMatchId={match.id}
            status={match.status}
            matchId={match.matchId}
            slot1={match.slot1}
            slot2={match.slot2}
            initialScore1={match.score1}
            initialScore2={match.score2}
            initialPens1={match.pens1}
            initialPens2={match.pens2}
          />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <SlotRow slot={match.slot1} score={match.score1} />
        <SlotRow slot={match.slot2} score={match.score2} />
      </div>
      {pensLabel && <p className="text-center text-[10px] text-muted-foreground">{pensLabel}</p>}
      {match.decidedBy === "walkover" && (
        <p className="text-center text-[10px] text-muted-foreground">{es.bracket.walkover}</p>
      )}
      {match.matchId && (
        <Link
          href={`/g/${groupId}/partidos/${match.matchId}`}
          className="text-center text-[10px] font-medium text-primary underline-offset-4 hover:underline"
        >
          {es.bracket.goToMatch}
        </Link>
      )}
    </div>
  );
}

export function BracketView({
  groupId,
  tournamentId,
  layout,
  championName,
  admin,
}: {
  groupId: string;
  tournamentId: string;
  layout: BracketLayout;
  championName: string | null;
  admin: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {championName && (
        <div className="flex flex-col items-center gap-1 rounded-xl bg-primary/10 p-4 text-center">
          <p className="text-base font-semibold">{es.bracket.champion}</p>
          <p className="text-sm text-muted-foreground">{championName}</p>
        </div>
      )}

      {layout.sections.map((section) => (
        <div key={section.bracket} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{section.label}</h2>
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
            {section.rounds.map((round) => (
              <div key={round.round} className="flex w-44 shrink-0 snap-start flex-col gap-2">
                <h3 className="text-xs font-medium text-muted-foreground">{round.label}</h3>
                <div className="flex flex-col gap-3">
                  {round.matches.map((match) => (
                    <MatchCard
                      key={match.id}
                      groupId={groupId}
                      tournamentId={tournamentId}
                      match={match}
                      admin={admin}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
