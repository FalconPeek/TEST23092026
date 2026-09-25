import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "cn";
import { LineupEditor, type EditorPlayer } from "@/components/match/lineup-editor";
import { LineupPitchEditors, type LineupSide } from "@/components/squads/lineup-pitch-editors";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isGroupAdmin, type GroupRole } from "@/lib/permissions";
import { loadSquadContext } from "@/lib/server/squad-context";
import { defaultFormation, type TeamSize } from "@/lib/squads/formations";
import type { Assignment } from "@/lib/match/lineup";

function parseMode(value: string | string[] | undefined): "lista" | "cancha" {
  return (Array.isArray(value) ? value[0] : value) === "cancha" ? "cancha" : "lista";
}

export default async function MatchLineupPage({
  params,
  searchParams,
}: PageProps<"/g/[groupId]/partidos/[matchId]/equipos">) {
  const { groupId, matchId } = await params;
  const sp = await searchParams;
  const mode = parseMode(sp.modo);
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

  const modeToggle = (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {(
        [
          ["lista", es.matches.lineupModeList],
          ["cancha", es.matches.lineupModePitch],
        ] as const
      ).map(([m, label]) => (
        <Link
          key={m}
          href={`?modo=${m}`}
          className={cn(
            "flex min-h-11 shrink-0 items-center rounded-full border px-3 text-sm whitespace-nowrap",
            m === mode ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </div>
  );

  if (mode === "cancha") {
    const teamSize = match.team_size as TeamSize;

    const [{ context, settings }, { data: clubRows }, { data: lineupSquads }] = await Promise.all([
      loadSquadContext(supabase, groupId),
      supabase
        .from("clubs")
        .select("id, name, short_name, primary_color, secondary_color, crest_path")
        .eq("group_id", groupId)
        .order("name"),
      supabase
        .from("squads")
        .select("id, side, name, formation, club_id, squad_slots(slot, player_id)")
        .eq("match_id", matchId)
        .eq("kind", "lineup"),
    ]);

    const clubs = (clubRows ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      shortName: c.short_name,
      primaryColor: c.primary_color,
      secondaryColor: c.secondary_color,
      crestUrl: c.crest_path ? supabase.storage.from("club-crests").getPublicUrl(c.crest_path).data.publicUrl : null,
    }));

    const bySide = new Map((lineupSquads ?? []).map((s) => [s.side, s]));
    const squad1 = bySide.get(1);
    const squad2 = bySide.get(2);

    const side1: LineupSide = {
      squadId: squad1?.id ?? null,
      name: squad1?.name ?? es.matches.team1Default,
      formationCode: squad1?.formation ?? defaultFormation(teamSize).code,
      clubId: squad1?.club_id ?? null,
      slots: (squad1?.squad_slots ?? []).map((s) => ({ slot: s.slot, playerId: s.player_id })),
    };
    const side2: LineupSide = {
      squadId: squad2?.id ?? null,
      name: squad2?.name ?? es.matches.team2Default,
      formationCode: squad2?.formation ?? defaultFormation(teamSize).code,
      clubId: squad2?.club_id ?? null,
      slots: (squad2?.squad_slots ?? []).map((s) => ({ slot: s.slot, playerId: s.player_id })),
    };

    return (
      <div className="flex flex-col gap-4 px-4 py-6">
        {modeToggle}
        <LineupPitchEditors
          groupId={groupId}
          matchId={matchId}
          teamSize={teamSize}
          players={[...context.players.values()]}
          shared={[...context.shared]}
          settings={settings}
          clubs={clubs}
          side1={side1}
          side2={side2}
          bothSaved={!!side1.squadId && !!side2.squadId}
        />
      </div>
    );
  }

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
    <div className="flex flex-col gap-4 px-4 py-6">
      {modeToggle}
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
