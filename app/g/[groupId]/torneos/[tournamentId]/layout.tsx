import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { TournamentTabs } from "@/components/tournament/tournament-hub-client";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type TournamentStatus = Database["public"]["Enums"]["tournament_status"];

const STATUS_VARIANT: Record<TournamentStatus, "default" | "outline" | "destructive"> = {
  draft: "outline",
  registration: "default",
  in_progress: "default",
  finished: "outline",
};

export default async function TournamentLayout({
  params,
  children,
}: LayoutProps<"/g/[groupId]/torneos/[tournamentId]">) {
  const { groupId, tournamentId } = await params;
  const userId = await getUserId();
  if (!userId) notFound();

  const supabase = await createClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, group_id, name, format, status, entry_mode, team_size")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament || tournament.group_id !== groupId) notFound();

  const showBracket =
    tournament.format === "single_elim" || tournament.format === "double_elim" || tournament.format === "groups_ko";
  const showTable =
    tournament.format === "league" || tournament.format === "groups_ko" || tournament.format === "swiss";
  const showFixtures = tournament.status === "in_progress" || tournament.status === "finished";

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">{tournament.name}</h1>
          <Badge variant={STATUS_VARIANT[tournament.status]}>{es.tournaments.status[tournament.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {es.tournaments.formats[tournament.format]} · {es.tournaments.entryModes[tournament.entry_mode]} ·{" "}
          {es.matches.teamSizeOption(tournament.team_size)}
        </p>
      </div>

      <TournamentTabs
        groupId={groupId}
        tournamentId={tournamentId}
        showBracket={showBracket}
        showTable={showTable}
        showFixtures={showFixtures}
      />

      {children}
    </div>
  );
}
