import { notFound } from "next/navigation";
import { FixturesList, type FixtureClub, type FixtureMatch } from "@/components/tournament/fixtures-list";
import { TournamentRealtime } from "@/components/tournament/tournament-realtime";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isGroupAdmin, type GroupRole } from "@/lib/permissions";

export default async function TournamentFixturesPage({
  params,
}: PageProps<"/g/[groupId]/torneos/[tournamentId]/fechas">) {
  const { groupId, tournamentId } = await params;
  const userId = await getUserId();
  if (!userId) notFound();

  const supabase = await createClient();

  const [{ data: tournament }, { data: membership }] = await Promise.all([
    supabase.from("tournaments").select("id, group_id").eq("id", tournamentId).maybeSingle(),
    supabase.from("group_members").select("role").eq("group_id", groupId).eq("user_id", userId).maybeSingle(),
  ]);

  if (!tournament || tournament.group_id !== groupId) notFound();

  const myRole = membership?.role as GroupRole | undefined;
  const admin = !!myRole && isGroupAdmin(myRole);

  const [{ data: matchRows }, { data: entryRows }, { data: groupRows }, { data: clubRows }] = await Promise.all([
    supabase
      .from("tournament_matches")
      .select("id, bracket, round, stage_group_id, entry1_id, entry2_id, status, score1, score2, pens1, pens2, decided_by, match_id")
      .eq("tournament_id", tournamentId),
    supabase.from("tournament_entries").select("id, name, club_id").eq("tournament_id", tournamentId),
    supabase.from("stage_groups").select("id, label").eq("tournament_id", tournamentId),
    supabase.from("clubs").select("id, name, short_name, primary_color, secondary_color, crest_path").eq("group_id", groupId),
  ]);

  const groupLabelById = new Map((groupRows ?? []).map((g) => [g.id, g.label]));

  const matches: FixtureMatch[] = (matchRows ?? []).map((m) => ({
    id: m.id,
    bracket: m.bracket,
    round: m.round,
    groupLabel: m.stage_group_id ? (groupLabelById.get(m.stage_group_id) ?? null) : null,
    entry1Id: m.entry1_id,
    entry2Id: m.entry2_id,
    status: m.status,
    score1: m.score1,
    score2: m.score2,
    pens1: m.pens1,
    pens2: m.pens2,
    decidedBy: m.decided_by,
    matchId: m.match_id,
  }));

  const entries = (entryRows ?? []).map((e) => ({ id: e.id, name: e.name, clubId: e.club_id }));

  const clubsById = new Map<string, FixtureClub>(
    (clubRows ?? []).map((c) => [
      c.id,
      {
        name: c.name,
        shortName: c.short_name,
        primaryColor: c.primary_color,
        secondaryColor: c.secondary_color,
        crestUrl: c.crest_path ? supabase.storage.from("club-crests").getPublicUrl(c.crest_path).data.publicUrl : null,
      },
    ]),
  );

  return (
    <div className="flex flex-col gap-4">
      <TournamentRealtime tournamentId={tournamentId} />
      <FixturesList
        groupId={groupId}
        tournamentId={tournamentId}
        matches={matches}
        entries={entries}
        clubsById={clubsById}
        admin={admin}
      />
    </div>
  );
}
