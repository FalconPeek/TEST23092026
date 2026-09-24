import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isGroupAdmin, type GroupRole } from "@/lib/permissions";
import type { Database } from "@/lib/supabase/database.types";

type TournamentStatus = Database["public"]["Enums"]["tournament_status"];
type TournamentFormat = Database["public"]["Enums"]["tournament_format"];
type TournamentEntryMode = Database["public"]["Enums"]["tournament_entry_mode"];

const STATUS_VARIANT: Record<TournamentStatus, "default" | "outline" | "destructive"> = {
  draft: "outline",
  registration: "default",
  in_progress: "default",
  finished: "outline",
};

const TOURNAMENT_SELECT =
  "id, name, format, status, entry_mode, tournament_entries(count), tournament_registrations(count)";

type TournamentRow = {
  id: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  entry_mode: TournamentEntryMode;
  tournament_entries: { count: number }[];
  tournament_registrations: { count: number }[];
};

function TournamentCard({ groupId, tournament }: { groupId: string; tournament: TournamentRow }) {
  const entriesCount =
    tournament.entry_mode === "individual"
      ? (tournament.tournament_registrations[0]?.count ?? 0)
      : (tournament.tournament_entries[0]?.count ?? 0);
  const entriesLabel =
    tournament.entry_mode === "individual"
      ? es.tournaments.registrationsCount(entriesCount)
      : es.tournaments.entriesCount(entriesCount);

  return (
    <Link href={`/g/${groupId}/torneos/${tournament.id}`}>
      <Card className="transition-colors hover:bg-muted/50">
        <CardContent className="flex items-center justify-between gap-2 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{tournament.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {es.tournaments.formats[tournament.format]} · {entriesLabel}
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[tournament.status]}>{es.tournaments.status[tournament.status]}</Badge>
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function TournamentsPage({ params }: PageProps<"/g/[groupId]/torneos">) {
  const { groupId } = await params;
  const supabase = await createClient();
  const userId = await getUserId();

  const [{ data: tournaments }, { data: membership }] = await Promise.all([
    supabase
      .from("tournaments")
      .select(TOURNAMENT_SELECT)
      .eq("group_id", groupId)
      .order("created_at", { ascending: false }),
    userId
      ? supabase.from("group_members").select("role").eq("group_id", groupId).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const myRole = membership?.role as GroupRole | undefined;
  const admin = !!myRole && isGroupAdmin(myRole);

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{es.tournaments.title}</h1>
        {admin && (
          <Button asChild size="sm">
            <Link href={`/g/${groupId}/torneos/nuevo`}>{es.tournaments.new}</Link>
          </Button>
        )}
      </div>

      {!tournaments || tournaments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{es.tournaments.empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tournaments.map((t) => (
            <TournamentCard key={t.id} groupId={groupId} tournament={t} />
          ))}
        </div>
      )}
    </div>
  );
}
