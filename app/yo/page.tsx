import Link from "next/link";
import { redirect } from "next/navigation";
import { cn } from "cn";
import { Star } from "lucide-react";
import { PlayerCard } from "@/components/card/player-card";
import { TopBar } from "@/components/app-shell/top-bar";
import { OvrHistoryChart } from "@/components/charts/ovr-history-chart";
import { BadgeList, type EarnedBadge } from "@/components/player/badge-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { es } from "@/messages/es";
import { formatDate } from "@/lib/format";
import { createClient, getUserId } from "@/lib/supabase/server";
import { toCardProps, type CardRow } from "@/lib/cards/to-card-props";
import { parseDashboard } from "@/lib/dashboard/schema";

type MatchOutcome = "win" | "draw" | "loss";

/** null when the outcome can't be determined (no reconciled result yet, or my side is unknown). */
function matchOutcome(
  result: { winner_side: number | null } | undefined,
  mySide: number | null,
): MatchOutcome | null {
  if (!result) return null;
  if (result.winner_side === null) return "draw";
  if (mySide === null) return null;
  return result.winner_side === mySide ? "win" : "loss";
}

export default async function DashboardPage({ searchParams }: PageProps<"/yo">) {
  const userId = await getUserId();
  if (!userId) redirect("/login?next=%2Fyo");

  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, groups(id, name)")
    .eq("user_id", userId);

  const groups = (memberships ?? []).flatMap((m) => (m.groups ? [{ id: m.groups.id, name: m.groups.name }] : []));

  const sp = await searchParams;
  const requested = Array.isArray(sp.group) ? sp.group[0] : sp.group;
  const groupId = groups.find((g) => g.id === requested)?.id ?? groups[0]?.id ?? null;

  return (
    <div className="flex flex-1 flex-col">
      <TopBar title={es.dashboard.title} backHref="/g" />
      <main className="flex flex-1 flex-col gap-6 px-4 py-6">
        <h1 className="text-xl font-semibold">{es.dashboard.title}</h1>

        {groups.length === 0 || !groupId ? (
          <p className="text-sm text-muted-foreground">{es.dashboard.noGroups}</p>
        ) : (
          <>
            {groups.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <h2 className="text-xs font-medium text-muted-foreground">{es.dashboard.pickGroup}</h2>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                  {groups.map((g) => (
                    <Link
                      key={g.id}
                      href={`?group=${g.id}`}
                      className={cn(
                        "flex min-h-11 shrink-0 items-center rounded-full border px-3 text-sm whitespace-nowrap",
                        g.id === groupId
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground",
                      )}
                    >
                      {g.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <DashboardBody groupId={groupId} />
          </>
        )}
      </main>
    </div>
  );
}

async function DashboardBody({ groupId }: { groupId: string }) {
  const supabase = await createClient();

  const { data: raw, error } = await supabase.rpc("get_my_dashboard", { p_group_id: groupId });
  const dashboard = error ? null : parseDashboard(raw);

  if (!dashboard) {
    return <p className="text-sm text-muted-foreground">{es.errors.notMember}</p>;
  }

  const [{ data: player }, { data: resultRows }, { data: participantRows }, { data: badgeCatalog }] = await Promise.all([
    supabase.from("players").select("display_name, avatar_url, preferred_foot").eq("id", dashboard.player_id).maybeSingle(),
    dashboard.recent_matches.length > 0
      ? supabase
          .from("match_results")
          .select("match_id, team1_goals, team2_goals, winner_side")
          .in(
            "match_id",
            dashboard.recent_matches.map((m) => m.match_id),
          )
      : Promise.resolve({ data: [] }),
    dashboard.recent_matches.length > 0
      ? supabase
          .from("match_participants")
          .select("match_id, match_teams(side)")
          .eq("player_id", dashboard.player_id)
          .in(
            "match_id",
            dashboard.recent_matches.map((m) => m.match_id),
          )
      : Promise.resolve({ data: [] }),
    supabase.from("badges").select("code, icon"),
  ]);

  const resultByMatch = new Map((resultRows ?? []).map((r) => [r.match_id, r]));
  const sideByMatch = new Map((participantRows ?? []).map((p) => [p.match_id, p.match_teams?.side ?? null]));
  const iconByBadgeCode = new Map((badgeCatalog ?? []).map((b) => [b.code, b.icon]));

  const cardRow = dashboard.card as (CardRow & { n_raters?: number }) | null;
  const cardProps = toCardProps(
    { displayName: player?.display_name ?? "", avatarUrl: player?.avatar_url, preferredFoot: player?.preferred_foot },
    cardRow,
    es.playstyles,
  );

  const earnedBadges: EarnedBadge[] = dashboard.badges.map((b) => ({
    code: b.badge_code,
    icon: iconByBadgeCode.get(b.badge_code) ?? "",
    count: b.count,
  }));

  const totalsTiles = [
    { label: es.profile.matches, value: dashboard.totals.matches_played },
    { label: es.profile.goals, value: dashboard.totals.goals },
    { label: es.profile.assists, value: dashboard.totals.assists },
    { label: es.profile.mvps, value: dashboard.totals.mvps },
    { label: es.profile.cleanSheets, value: dashboard.totals.clean_sheets },
    { label: es.match.saves, value: dashboard.totals.saves },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2">
        {cardProps ? (
          <>
            <PlayerCard {...cardProps} size="md" />
            {dashboard.impacto !== null && (
              <p className="text-sm text-muted-foreground">
                {es.dashboard.impacto}: <span className="font-semibold text-foreground">{Math.round(dashboard.impacto)}</span>
              </p>
            )}
          </>
        ) : (
          <Card className="w-full max-w-sm">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">{es.profile.noCard}</CardContent>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{es.dashboard.ovrHistory}</h2>
        <OvrHistoryChart points={dashboard.ovr_history.map((p) => ({ snapshotAt: p.snapshot_at, ovr: p.ovr }))} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{es.dashboard.totals}</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {totalsTiles.map((tile) => (
            <Card key={tile.label} size="sm">
              <CardContent className="flex flex-col items-center gap-0.5 py-2 text-center">
                <span className="text-lg font-semibold tabular-nums">{tile.value}</span>
                <span className="text-[10px] text-muted-foreground">{tile.label}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{es.dashboard.recentMatches}</h2>
        {dashboard.recent_matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">{es.dashboard.noMatches}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {dashboard.recent_matches.map((m) => {
              const result = resultByMatch.get(m.match_id);
              const mySide = sideByMatch.get(m.match_id) ?? null;
              const outcome = matchOutcome(result, mySide);

              return (
                <Link
                  key={m.match_id}
                  href={`/g/${groupId}/partidos/${m.match_id}`}
                  className="flex items-center gap-3 rounded-lg bg-card p-2.5 ring-1 ring-foreground/10"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m.played_at ? formatDate(m.played_at) : "—"}
                      {result && ` · ${result.team1_goals}-${result.team2_goals}`}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {es.profile.goals}: {m.goals} · {es.profile.assists}: {m.assists}
                    </p>
                  </div>
                  {outcome && (
                    <Badge variant={outcome === "loss" ? "destructive" : "outline"} className="shrink-0">
                      {es.dashboard.result[outcome]}
                    </Badge>
                  )}
                  {m.is_mvp && <Star className="size-4 shrink-0 fill-amber-500 text-amber-500" aria-label={es.match.mvp} />}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{es.badges.title}</h2>
        <BadgeList badges={earnedBadges} />
      </div>
    </div>
  );
}
