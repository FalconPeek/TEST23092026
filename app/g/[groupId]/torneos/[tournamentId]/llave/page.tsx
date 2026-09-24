import { notFound } from "next/navigation";
import { BracketView } from "@/components/tournament/bracket-view";
import { TournamentRealtime } from "@/components/tournament/tournament-realtime";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isGroupAdmin, type GroupRole } from "@/lib/permissions";
import { buildBracketLayout, type BracketMatchInput } from "@/lib/tournament/bracket-layout";

export default async function TournamentBracketPage({
  params,
}: PageProps<"/g/[groupId]/torneos/[tournamentId]/llave">) {
  const { groupId, tournamentId } = await params;
  const userId = await getUserId();
  if (!userId) notFound();

  const supabase = await createClient();

  const [{ data: tournament }, { data: membership }] = await Promise.all([
    supabase.from("tournaments").select("id, group_id, format, status").eq("id", tournamentId).maybeSingle(),
    supabase.from("group_members").select("role").eq("group_id", groupId).eq("user_id", userId).maybeSingle(),
  ]);

  if (!tournament || tournament.group_id !== groupId) notFound();
  if (tournament.format === "league" || tournament.format === "swiss") notFound();

  const myRole = membership?.role as GroupRole | undefined;
  const admin = !!myRole && isGroupAdmin(myRole);

  const [{ data: matchRows }, { data: entryRows }] = await Promise.all([
    supabase
      .from("tournament_matches")
      .select(
        "id, bracket, round, number, entry1_id, entry2_id, entry1_from, entry2_from, status, winner_entry_id, score1, score2, pens1, pens2, decided_by, match_id",
      )
      .eq("tournament_id", tournamentId),
    supabase.from("tournament_entries").select("id, name").eq("tournament_id", tournamentId),
  ]);

  const matches: BracketMatchInput[] = (matchRows ?? []).map((m) => ({
    id: m.id,
    bracket: m.bracket,
    round: m.round,
    number: m.number,
    entry1Id: m.entry1_id,
    entry2Id: m.entry2_id,
    entry1From: m.entry1_from as BracketMatchInput["entry1From"],
    entry2From: m.entry2_from as BracketMatchInput["entry2From"],
    status: m.status,
    winnerEntryId: m.winner_entry_id,
    score1: m.score1,
    score2: m.score2,
    pens1: m.pens1,
    pens2: m.pens2,
    decidedBy: m.decided_by,
    matchId: m.match_id,
  }));

  const entries = (entryRows ?? []).map((e) => ({ id: e.id, name: e.name }));
  const layout = buildBracketLayout(matches, entries);
  const championName =
    tournament.status === "finished" && layout.championEntryId
      ? (entries.find((e) => e.id === layout.championEntryId)?.name ?? null)
      : null;

  return (
    <div className="flex flex-col gap-4">
      <TournamentRealtime tournamentId={tournamentId} />
      <BracketView
        groupId={groupId}
        tournamentId={tournamentId}
        layout={layout}
        championName={championName}
        admin={admin}
      />
    </div>
  );
}
