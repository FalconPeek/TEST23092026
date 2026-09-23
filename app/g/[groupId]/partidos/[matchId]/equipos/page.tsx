import { notFound } from "next/navigation";
import { LineupEditor, type EditorPlayer } from "@/components/match/lineup-editor";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isGroupAdmin, type GroupRole } from "@/lib/permissions";
import type { Assignment } from "@/lib/match/lineup";

export default async function MatchLineupPage({
  params,
}: PageProps<"/g/[groupId]/partidos/[matchId]/equipos">) {
  const { groupId, matchId } = await params;
  const userId = await getUserId();
  if (!userId) notFound();

  const supabase = await createClient();

  const [{ data: match }, { data: membership }] = await Promise.all([
    supabase.from("matches").select("id, group_id, team_size, status").eq("id", matchId).maybeSingle(),
    supabase.from("group_members").select("role").eq("group_id", groupId).eq("user_id", userId).maybeSingle(),
  ]);

  const myRole = membership?.role as GroupRole | undefined;
  if (!match || match.group_id !== groupId) notFound();
  if (!myRole || !isGroupAdmin(myRole)) notFound();
  if (match.status !== "scheduled") notFound();

  const [
    { data: playerRows },
    { data: memberRows },
    { data: teamRows },
    { data: participantRows },
  ] = await Promise.all([
    supabase
      .from("players")
      .select("id, user_id, display_name, avatar_url, primary_position")
      .eq("group_id", groupId)
      .is("left_at", null)
      .order("display_name"),
    supabase.from("group_members").select("user_id, role").eq("group_id", groupId),
    supabase.from("match_teams").select("id, side, name, color").eq("match_id", matchId),
    supabase.from("match_participants").select("player_id, team_id, role, position").eq("match_id", matchId),
  ]);

  const playerIds = (playerRows ?? []).map((p) => p.id);
  const [{ data: openskillRows }, { data: cardRows }] =
    playerIds.length > 0
      ? await Promise.all([
          supabase.from("openskill_ratings").select("player_id, mu").in("player_id", playerIds),
          supabase.from("player_cards").select("player_id, ovr").in("player_id", playerIds),
        ])
      : [{ data: [] }, { data: [] }];

  const muByPlayer = new Map((openskillRows ?? []).map((r) => [r.player_id, r.mu]));
  const ovrByPlayer = new Map((cardRows ?? []).map((r) => [r.player_id, r.ovr]));
  const spectatorUserIds = new Set(
    (memberRows ?? []).filter((m) => m.role === "spectator").map((m) => m.user_id),
  );

  const team1Row = (teamRows ?? []).find((t) => t.side === 1);
  const team2Row = (teamRows ?? []).find((t) => t.side === 2);
  const participantByPlayer = new Map((participantRows ?? []).map((p) => [p.player_id, p]));

  const players: EditorPlayer[] = (playerRows ?? []).map((p) => {
    const participant = participantByPlayer.get(p.id);
    let assignment: Assignment = "unassigned";
    if (participant) {
      if (participant.role === "spectator") assignment = "spectator";
      else if (participant.team_id === team1Row?.id) assignment = "team1";
      else if (participant.team_id === team2Row?.id) assignment = "team2";
    }

    return {
      id: p.id,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
      mu: muByPlayer.get(p.id) ?? 25,
      ovr: ovrByPlayer.get(p.id) ?? 60,
      isGk: p.primary_position === "POR",
      isSpectatorRole: p.user_id !== null && spectatorUserIds.has(p.user_id),
      assignment,
      position: (participant?.position as EditorPlayer["position"]) ?? null,
    };
  });

  return (
    <div className="px-4 py-6">
      <LineupEditor
        groupId={groupId}
        matchId={matchId}
        teamSize={match.team_size}
        initialPlayers={players}
        initialTeam1Name={team1Row?.name ?? es.matches.team1Default}
        initialTeam1Color={team1Row?.color ?? null}
        initialTeam2Name={team2Row?.name ?? es.matches.team2Default}
        initialTeam2Color={team2Row?.color ?? null}
      />
    </div>
  );
}
