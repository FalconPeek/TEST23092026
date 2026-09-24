import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { es } from "@/messages/es";
import { formatDateTime } from "@/lib/format";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isGroupAdmin, type GroupRole } from "@/lib/permissions";
import type { Database } from "@/lib/supabase/database.types";

type MatchStatus = Database["public"]["Enums"]["match_status"];

const STATUS_VARIANT: Record<MatchStatus, "default" | "outline" | "destructive"> = {
  scheduled: "outline",
  reporting: "default",
  disputed: "destructive",
  pending_finalize: "outline",
  finalized: "default",
  cancelled: "destructive",
};

const MATCH_SELECT =
  "id, scheduled_at, venue, status, match_teams(side, name), match_results(team1_goals, team2_goals, pens1, pens2)";

type MatchRow = {
  id: string;
  scheduled_at: string;
  venue: string | null;
  status: MatchStatus;
  match_teams: { side: number; name: string }[];
  match_results: { team1_goals: number; team2_goals: number; pens1: number | null; pens2: number | null } | null;
};

function MatchCard({ groupId, match }: { groupId: string; match: MatchRow }) {
  const team1 = match.match_teams.find((t) => t.side === 1);
  const team2 = match.match_teams.find((t) => t.side === 2);
  const result = match.match_results;
  const pensLabel = result && result.pens1 !== null && result.pens2 !== null ? ` (${result.pens1}-${result.pens2} pen.)` : "";

  return (
    <Link href={`/g/${groupId}/partidos/${match.id}`}>
      <Card className="transition-colors hover:bg-muted/50">
        <CardContent className="flex items-center justify-between gap-2 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{formatDateTime(match.scheduled_at)}</p>
            {match.venue && <p className="truncate text-xs text-muted-foreground">{match.venue}</p>}
            {team1 && team2 && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {team1.name}
                {result ? ` ${result.team1_goals} - ${result.team2_goals}${pensLabel} ` : " vs. "}
                {team2.name}
              </p>
            )}
          </div>
          <Badge variant={STATUS_VARIANT[match.status]}>{es.matches.status[match.status]}</Badge>
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function MatchesPage({ params }: PageProps<"/g/[groupId]/partidos">) {
  const { groupId } = await params;
  const supabase = await createClient();
  const userId = await getUserId();

  const [{ data: upcoming }, { data: recent }, { data: membership }] = await Promise.all([
    supabase
      .from("matches")
      .select(MATCH_SELECT)
      .eq("group_id", groupId)
      .eq("status", "scheduled")
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("matches")
      .select(MATCH_SELECT)
      .eq("group_id", groupId)
      .neq("status", "scheduled")
      .order("scheduled_at", { ascending: false })
      .limit(30),
    userId
      ? supabase.from("group_members").select("role").eq("group_id", groupId).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const myRole = membership?.role as GroupRole | undefined;
  const admin = !!myRole && isGroupAdmin(myRole);
  const hasMatches = (upcoming?.length ?? 0) > 0 || (recent?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{es.matches.title}</h1>
        {admin && (
          <Button asChild size="sm">
            <Link href={`/g/${groupId}/partidos/nuevo`}>{es.matches.new}</Link>
          </Button>
        )}
      </div>

      {!hasMatches ? (
        <p className="text-sm text-muted-foreground">{es.matches.empty}</p>
      ) : (
        <>
          {upcoming && upcoming.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">{es.matches.upcoming}</h2>
              <div className="flex flex-col gap-2">
                {upcoming.map((match) => (
                  <MatchCard key={match.id} groupId={groupId} match={match} />
                ))}
              </div>
            </section>
          )}

          {recent && recent.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">{es.matches.recent}</h2>
              <div className="flex flex-col gap-2">
                {recent.map((match) => (
                  <MatchCard key={match.id} groupId={groupId} match={match} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
