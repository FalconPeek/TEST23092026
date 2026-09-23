import { notFound, redirect } from "next/navigation";
import { ScoutingForm, type ScoutingReason } from "@/components/scouting/scouting-form";
import { createClient, getUserId } from "@/lib/supabase/server";

export default async function VotePlayerPage({
  params,
}: PageProps<"/g/[groupId]/jugadores/[playerId]/votar">) {
  const { groupId, playerId } = await params;
  const userId = await getUserId();
  if (!userId) {
    redirect(`/login?next=${encodeURIComponent(`/g/${groupId}/jugadores/${playerId}/votar`)}`);
  }

  const supabase = await createClient();

  const { data: player } = await supabase
    .from("players")
    .select("id, group_id, display_name, primary_position, alt_positions")
    .eq("id", playerId)
    .maybeSingle();

  if (!player || player.group_id !== groupId) notFound();

  const isGk = player.primary_position === "POR" || (player.alt_positions ?? []).includes("POR");

  const [{ data: statusRows }, { data: ballotRows }] = await Promise.all([
    supabase.rpc("get_scouting_status", { p_target_player_id: playerId }),
    supabase.rpc("get_my_scouting_ballot", { p_target_player_id: playerId }),
  ]);

  const status = statusRows?.[0] ?? { can_vote: false, reason: "not_found", next_vote_at: null };
  const ballot = ballotRows ?? [];

  const prefillQuickVotes = Object.fromEntries(
    ballot.filter((row) => row.mode === "quick").map((row) => [row.attribute, row.value]),
  );
  const prefillDetailedVotes = Object.fromEntries(
    ballot.filter((row) => row.mode === "detailed").map((row) => [row.attribute, row.value]),
  );
  const latestBallotRow = [...ballot].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const initialTab: "quick" | "detailed" = latestBallotRow?.mode === "detailed" ? "detailed" : "quick";

  return (
    <div className="px-4 py-6">
      <ScoutingForm
        groupId={groupId}
        targetPlayerId={playerId}
        targetName={player.display_name}
        isGk={isGk}
        canVote={status.can_vote}
        reason={status.reason as ScoutingReason}
        nextVoteAt={status.next_vote_at}
        initialTab={initialTab}
        prefillQuickVotes={prefillQuickVotes}
        prefillDetailedVotes={prefillDetailedVotes}
      />
    </div>
  );
}
