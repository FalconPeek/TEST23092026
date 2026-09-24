import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "cn";
import { LeaderboardList } from "@/components/rankings/leaderboard-list";
import { Podium } from "@/components/rankings/podium";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { METRICS, parseMetric, splitPodium, type LeaderboardRow } from "@/lib/rankings/format";

export default async function RankingsPage({
  params,
  searchParams,
}: PageProps<"/g/[groupId]/rankings">) {
  const { groupId } = await params;
  const sp = await searchParams;
  const metric = parseMetric(sp.metric);
  const userId = await getUserId();
  if (!userId) notFound();

  const supabase = await createClient();

  const [{ data: leaderboardRows, error }, { data: myPlayer }] = await Promise.all([
    supabase.rpc("get_group_leaderboard", { p_group_id: groupId, p_metric: metric }),
    supabase
      .from("players")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .is("left_at", null)
      .maybeSingle(),
  ]);

  if (error) notFound();

  const rows: LeaderboardRow[] = (leaderboardRows ?? []).map((r) => ({
    playerId: r.player_id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    value: r.value,
    rank: r.rank,
    matchesPlayed: r.matches_played,
  }));

  const { positions, rest } = splitPodium(rows);
  const myPlayerId = myPlayer?.id ?? null;

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <h1 className="text-xl font-semibold">{es.rankings.title}</h1>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {METRICS.map((m) => (
          <Link
            key={m}
            href={`?metric=${m}`}
            className={cn(
              "flex min-h-11 shrink-0 items-center rounded-full border px-3 text-sm whitespace-nowrap",
              m === metric
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground",
            )}
          >
            {es.rankings.metrics[m]}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{es.rankings.empty}</p>
      ) : (
        <>
          <Podium groupId={groupId} metric={metric} positions={positions} myPlayerId={myPlayerId} />
          <LeaderboardList groupId={groupId} metric={metric} rows={rest} myPlayerId={myPlayerId} />
        </>
      )}

      {metric === "impacto" && <p className="text-xs text-muted-foreground">{es.rankings.impactoHelp}</p>}
      {metric === "avg_rating" && <p className="text-xs text-muted-foreground">{es.rankings.avgRatingHelp}</p>}
    </div>
  );
}
