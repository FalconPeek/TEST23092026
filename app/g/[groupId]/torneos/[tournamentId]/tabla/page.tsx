import { notFound } from "next/navigation";
import { StandingsTable, type StandingsRowDisplay } from "@/components/tournament/standings-table";
import { TournamentRealtime } from "@/components/tournament/tournament-realtime";
import { es } from "@/messages/es";
import { seededRng } from "@/lib/brackets";
import { createClient, getUserId } from "@/lib/supabase/server";
import { parseTournamentSettings } from "@/lib/settings/tournament";
import { computeStandings } from "@/lib/server/tournaments";
import { createSupabaseTournamentRepo } from "@/lib/server/tournament-repo";

/** Deterministic per-tournament seed so a "lots" tiebreak (only ever needed on an exact tie)
 * renders the same way on every refresh, instead of reshuffling on each request. */
function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h >>> 0;
}

export default async function TournamentStandingsPage({
  params,
}: PageProps<"/g/[groupId]/torneos/[tournamentId]/tabla">) {
  const { groupId, tournamentId } = await params;
  const userId = await getUserId();
  if (!userId) notFound();

  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, group_id, format, settings")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament || tournament.group_id !== groupId) notFound();
  if (tournament.format === "single_elim" || tournament.format === "double_elim") notFound();

  const settings = parseTournamentSettings(tournament.settings);
  const qualifiersPerGroup = settings.groups_ko.qualifiers_per_group;

  const [{ data: entryRows }, { data: groupRows }] = await Promise.all([
    supabase.from("tournament_entries").select("id, name").eq("tournament_id", tournamentId),
    supabase.from("stage_groups").select("engine_key, label").eq("tournament_id", tournamentId),
  ]);

  const entryById = new Map((entryRows ?? []).map((e) => [e.id, e.name]));
  const groupLabelByEngineKey = new Map((groupRows ?? []).map((g) => [g.engine_key, g.label]));

  const repo = createSupabaseTournamentRepo(supabase);
  const stageStandings = await computeStandings(repo, tournamentId, seededRng(seedFromId(tournamentId)));

  const isGroupsKo = tournament.format === "groups_ko";

  const tables = stageStandings.map((stage) => {
    const rows: StandingsRowDisplay[] = stage.rows.map((row) => ({
      entryId: row.entryId,
      entryName: entryById.get(row.entryId) ?? "?",
      played: row.played,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      goalDiff: row.goalDiff,
      points: row.points,
      buchholz: row.buchholz,
      sonnebornBerger: row.sonnebornBerger,
      lot: row.lot,
      rank: row.rank,
      qualifies: isGroupsKo && row.rank <= qualifiersPerGroup,
    }));
    const groupLabel = stage.groupId ? (groupLabelByEngineKey.get(stage.groupId) ?? null) : null;
    return { key: `${stage.stageId}|${stage.groupId ?? ""}`, groupLabel, rows };
  });

  return (
    <div className="flex flex-col gap-6">
      <TournamentRealtime tournamentId={tournamentId} />
      {tables.length === 0 ? (
        <p className="text-sm text-muted-foreground">{es.standings.noMatches}</p>
      ) : (
        tables.map((t) => (
          <StandingsTable
            key={t.key}
            rows={t.rows}
            showSwissColumns={tournament.format === "swiss"}
            groupLabel={t.groupLabel}
          />
        ))
      )}
    </div>
  );
}
