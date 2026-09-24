import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AmendStatsForm, type AmendFormPlayer } from "@/components/match/amend-stats-form";
import { FinalizeButton } from "@/components/match/finalize-button";
import { MatchResult, type MatchResultPlayerStat } from "@/components/match/match-result";
import { RatingForm, type RatingFormPlayer, type RatingPrefill } from "@/components/match/rating-form";
import { ResolveDisputeForm } from "@/components/match/resolve-dispute-form";
import { ScoreForm } from "@/components/match/score-form";
import { StatsForm, type StatFormPlayer, type StatPrefill } from "@/components/match/stats-form";
import { es } from "@/messages/es";
import { formatDateTime } from "@/lib/format";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isGroupAdmin, type GroupRole } from "@/lib/permissions";
import { parseGroupSettings } from "@/lib/settings/group";
import type { PositionCode } from "@/lib/rating/positions";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export default async function MatchDetailPage({
  params,
}: PageProps<"/g/[groupId]/partidos/[matchId]">) {
  const { groupId, matchId } = await params;
  const userId = await getUserId();
  if (!userId) notFound();

  const supabase = await createClient();

  const { data: match } = await supabase
    .from("matches")
    .select("id, group_id, team_size, scheduled_at, venue, status, report_deadline, rating_deadline")
    .eq("id", matchId)
    .maybeSingle();

  if (!match || match.group_id !== groupId) notFound();

  const [
    { data: teamRows },
    { data: participantRows },
    { data: membership },
    { data: group },
    { data: matchResultRow },
    { data: matchStatsRows },
  ] = await Promise.all([
    supabase.from("match_teams").select("id, side, name, color").eq("match_id", matchId),
    supabase
      .from("match_participants")
      .select("player_id, team_id, role, position, players(id, display_name, avatar_url, user_id, primary_position)")
      .eq("match_id", matchId),
    supabase.from("group_members").select("role").eq("group_id", groupId).eq("user_id", userId).maybeSingle(),
    supabase.from("groups").select("settings").eq("id", groupId).maybeSingle(),
    supabase.from("match_results").select("team1_goals, team2_goals, pens1, pens2").eq("match_id", matchId).maybeSingle(),
    supabase
      .from("match_stats")
      .select("player_id, goals, assists, own_goals, saves, clean_sheet, is_mvp, median_rating")
      .eq("match_id", matchId),
  ]);

  const myRole = membership?.role as GroupRole | undefined;
  const admin = !!myRole && isGroupAdmin(myRole);
  const settings = group ? parseGroupSettings(group.settings) : null;

  const team1 = teamRows?.find((t) => t.side === 1);
  const team2 = teamRows?.find((t) => t.side === 2);

  const participants = (participantRows ?? []).flatMap((row) => (row.players ? [{ ...row, players: row.players }] : []));
  const myParticipant = participants.find((p) => p.players.user_id === userId);
  const myPlayerId = myParticipant?.player_id ?? null;

  const team1Players = participants.filter((p) => p.role === "player" && p.team_id === team1?.id);
  const team2Players = participants.filter((p) => p.role === "player" && p.team_id === team2?.id);
  const spectatorParticipants = participants.filter((p) => p.role === "spectator");

  // Server Component: renders once per request, not subject to React's client re-render
  // purity concerns — reading the current time here is the deadline check itself.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const reportOpen = !match.report_deadline || now < new Date(match.report_deadline).getTime();
  const ratingOpen = !match.rating_deadline || now < new Date(match.rating_deadline).getTime();
  const isTeamPlayer = myParticipant?.role === "player";
  const canRate =
    !!myParticipant &&
    (myParticipant.role === "player" || (myParticipant.role === "spectator" && (settings?.spectators_can_rate ?? true)));

  const [{ data: myScoreRows }, { data: myStatRows }, { data: myRatingRows }, { data: summaryRows }] =
    myPlayerId
      ? await Promise.all([
          supabase.from("score_reports").select("team1_goals, team2_goals").eq("match_id", matchId).eq("reporter_player_id", myPlayerId).maybeSingle().then((r) => ({ data: r.data ? [r.data] : [] })),
          supabase.from("stat_reports").select("subject_player_id, goals, assists, own_goals, saves").eq("match_id", matchId).eq("reporter_player_id", myPlayerId),
          supabase.from("match_ratings").select("target_player_id, rating, standout_attributes").eq("match_id", matchId).eq("rater_player_id", myPlayerId),
          supabase.rpc("get_match_report_summary", { p_match_id: matchId }),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const myScoreReport = myScoreRows?.[0]
    ? { team1Goals: myScoreRows[0].team1_goals, team2Goals: myScoreRows[0].team2_goals }
    : null;

  const statPrefill: Record<string, StatPrefill> = Object.fromEntries(
    (myStatRows ?? []).map((r) => [
      r.subject_player_id,
      { goals: r.goals, assists: r.assists, ownGoals: r.own_goals, saves: r.saves },
    ]),
  );
  const ratingPrefill: Record<string, RatingPrefill> = Object.fromEntries(
    (myRatingRows ?? []).map((r) => [r.target_player_id, { rating: r.rating, standoutAttributes: r.standout_attributes }]),
  );

  const statFormPlayers: StatFormPlayer[] = [
    ...team1Players.map((p) => ({
      id: p.player_id,
      displayName: p.players.display_name,
      avatarUrl: p.players.avatar_url,
      side: 1 as const,
      position: p.position as PositionCode | null,
    })),
    ...team2Players.map((p) => ({
      id: p.player_id,
      displayName: p.players.display_name,
      avatarUrl: p.players.avatar_url,
      side: 2 as const,
      position: p.position as PositionCode | null,
    })),
  ];

  const ratingFormPlayers: RatingFormPlayer[] = [...team1Players, ...team2Players]
    .filter((p) => p.player_id !== myPlayerId)
    .map((p) => ({
      id: p.player_id,
      displayName: p.players.display_name,
      avatarUrl: p.players.avatar_url,
      isGk: p.players.primary_position === "POR",
    }));

  const participantByPlayerId = new Map(participants.map((p) => [p.player_id, p]));
  const matchResultStats: MatchResultPlayerStat[] = (matchStatsRows ?? []).flatMap((s) => {
    const participant = participantByPlayerId.get(s.player_id);
    if (!participant) return [];
    const side = participant.team_id === team1?.id ? 1 : participant.team_id === team2?.id ? 2 : null;
    if (side === null) return [];
    return [
      {
        playerId: s.player_id,
        displayName: participant.players.display_name,
        avatarUrl: participant.players.avatar_url,
        side,
        goals: s.goals,
        assists: s.assists,
        ownGoals: s.own_goals,
        saves: s.saves,
        cleanSheet: s.clean_sheet,
        isMvp: s.is_mvp,
        medianRating: s.median_rating,
      },
    ];
  });

  const amendPlayers: AmendFormPlayer[] = [...team1Players, ...team2Players].map((p) => ({
    id: p.player_id,
    displayName: p.players.display_name,
    avatarUrl: p.players.avatar_url,
    side: p.team_id === team1?.id ? (1 as const) : (2 as const),
  }));
  const amendInitialStats: Record<string, { goals: number; assists: number; ownGoals: number; saves: number }> =
    Object.fromEntries(
      (matchStatsRows ?? []).map((s) => [
        s.player_id,
        { goals: s.goals, assists: s.assists, ownGoals: s.own_goals, saves: s.saves },
      ]),
    );

  function PlayerLink({ playerId, displayName, avatarUrl }: { playerId: string; displayName: string; avatarUrl: string | null }) {
    return (
      <Link href={`/g/${groupId}/jugadores/${playerId}`} className="flex items-center gap-2">
        <Avatar size="sm">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
          <AvatarFallback>{initials(displayName)}</AvatarFallback>
        </Avatar>
        <span className="truncate text-sm">{displayName}</span>
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">
            {team1?.name ?? es.matches.team1Default} vs. {team2?.name ?? es.matches.team2Default}
          </h1>
          <Badge variant="outline">{es.matches.status[match.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{formatDateTime(match.scheduled_at)}</p>
        {match.venue && <p className="text-sm text-muted-foreground">{match.venue}</p>}
        {match.status === "reporting" && match.report_deadline && (
          <p className="text-xs text-muted-foreground">{es.match.reportDeadlineHint(match.report_deadline)}</p>
        )}
        {(match.status === "reporting" || match.status === "pending_finalize") && match.rating_deadline && (
          <p className="text-xs text-muted-foreground">{es.match.ratingDeadlineHint(match.rating_deadline)}</p>
        )}
        {match.status === "scheduled" && admin && (
          <Button asChild variant="outline" size="sm" className="mt-2 self-start">
            <Link href={`/g/${groupId}/partidos/${matchId}/equipos`}>{es.match.goToLineup}</Link>
          </Button>
        )}
        {(match.status === "reporting" || match.status === "pending_finalize") && admin && (
          <div className="mt-2">
            <FinalizeButton matchId={matchId} />
          </div>
        )}
      </div>

      {summaryRows && summaryRows.length > 0 && (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {summaryRows.map((row) => (
            <span key={row.side}>{es.match.reportersSummary(row.side, row.reporters, row.all_agree)}</span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-sm font-medium text-muted-foreground">{team1?.name ?? es.matches.team1Default}</h2>
          {team1Players.map((p) => (
            <PlayerLink
              key={p.player_id}
              playerId={p.player_id}
              displayName={p.players.display_name}
              avatarUrl={p.players.avatar_url}
            />
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-sm font-medium text-muted-foreground">{team2?.name ?? es.matches.team2Default}</h2>
          {team2Players.map((p) => (
            <PlayerLink
              key={p.player_id}
              playerId={p.player_id}
              displayName={p.players.display_name}
              avatarUrl={p.players.avatar_url}
            />
          ))}
        </div>
      </div>

      {spectatorParticipants.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h2 className="text-sm font-medium text-muted-foreground">{es.matches.spectators}</h2>
          <div className="flex flex-col gap-1.5">
            {spectatorParticipants.map((p) => (
              <PlayerLink
                key={p.player_id}
                playerId={p.player_id}
                displayName={p.players.display_name}
                avatarUrl={p.players.avatar_url}
              />
            ))}
          </div>
        </div>
      )}

      {match.status === "reporting" && (
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-muted-foreground">{es.match.score}</h2>
          {!myParticipant ? (
            <p className="text-sm text-muted-foreground">{es.match.notParticipant}</p>
          ) : !isTeamPlayer ? (
            <p className="text-sm text-muted-foreground">{es.match.notParticipant}</p>
          ) : !reportOpen ? (
            <p className="text-sm text-muted-foreground">{es.match.windowClosed}</p>
          ) : (
            <>
              <ScoreForm
                groupId={groupId}
                matchId={matchId}
                team1Name={team1?.name ?? es.matches.team1Default}
                team2Name={team2?.name ?? es.matches.team2Default}
                initialTeam1Goals={myScoreReport?.team1Goals ?? null}
                initialTeam2Goals={myScoreReport?.team2Goals ?? null}
              />
              <StatsForm
                groupId={groupId}
                matchId={matchId}
                team1Name={team1?.name ?? es.matches.team1Default}
                team2Name={team2?.name ?? es.matches.team2Default}
                players={statFormPlayers}
                prefill={statPrefill}
                myScoreReport={myScoreReport}
              />
            </>
          )}
        </div>
      )}

      {(match.status === "reporting" || match.status === "pending_finalize") && (
        <div className="flex flex-col gap-2">
          {match.status === "pending_finalize" && !ratingOpen ? (
            <p className="text-sm text-muted-foreground">
              {es.match.waitingRatings(match.rating_deadline ?? match.scheduled_at)}
            </p>
          ) : !canRate ? (
            <p className="text-sm text-muted-foreground">{es.match.notParticipant}</p>
          ) : !ratingOpen ? (
            <p className="text-sm text-muted-foreground">{es.match.windowClosed}</p>
          ) : (
            <RatingForm groupId={groupId} matchId={matchId} players={ratingFormPlayers} prefill={ratingPrefill} />
          )}
        </div>
      )}

      {match.status === "disputed" && (
        <div className="flex flex-col gap-4">
          {admin ? (
            <ResolveDisputeForm
              groupId={groupId}
              matchId={matchId}
              team1Name={team1?.name ?? es.matches.team1Default}
              team2Name={team2?.name ?? es.matches.team2Default}
              players={statFormPlayers}
              prefill={statPrefill}
              initialTeam1Goals={myScoreReport?.team1Goals ?? null}
              initialTeam2Goals={myScoreReport?.team2Goals ?? null}
            />
          ) : (
            <div className="flex flex-col gap-1 rounded-xl bg-card p-4 ring-1 ring-destructive/30">
              <h3 className="text-sm font-medium">{es.match.disputedTitle}</h3>
              <p className="text-xs text-muted-foreground">{es.match.disputedBody}</p>
            </div>
          )}
        </div>
      )}

      {match.status === "finalized" && matchResultRow && (
        <MatchResult
          groupId={groupId}
          team1Name={team1?.name ?? es.matches.team1Default}
          team2Name={team2?.name ?? es.matches.team2Default}
          team1Color={team1?.color}
          team2Color={team2?.color}
          result={{
            team1Goals: matchResultRow.team1_goals,
            team2Goals: matchResultRow.team2_goals,
            pens1: matchResultRow.pens1,
            pens2: matchResultRow.pens2,
          }}
          stats={matchResultStats}
        />
      )}

      {match.status === "finalized" && matchResultRow && admin && (
        <AmendStatsForm
          groupId={groupId}
          matchId={matchId}
          team1Name={team1?.name ?? es.matches.team1Default}
          team2Name={team2?.name ?? es.matches.team2Default}
          players={amendPlayers}
          initialStats={amendInitialStats}
          score={{ team1Goals: matchResultRow.team1_goals, team2Goals: matchResultRow.team2_goals }}
        />
      )}
    </div>
  );
}
