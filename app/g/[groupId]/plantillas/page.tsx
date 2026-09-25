import Link from "next/link";
import { LikeButton } from "@/components/squads/like-button";
import { Pitch } from "@/components/squads/pitch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { loadSquadContext } from "@/lib/server/squad-context";
import { buildSquadView } from "@/lib/squads/view";

function squadViewInput(squad: { team_size: number; formation: string; squad_slots: { slot: number; player_id: string }[] }) {
  return { team_size: squad.team_size, formation: squad.formation, slots: squad.squad_slots };
}

export default async function SquadsPage({ params }: PageProps<"/g/[groupId]/plantillas">) {
  const { groupId } = await params;
  const userId = await getUserId();
  const supabase = await createClient();

  const { context, settings } = await loadSquadContext(supabase, groupId);

  const { data: myPlayer } = userId
    ? await supabase
        .from("players")
        .select("id")
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .is("left_at", null)
        .maybeSingle()
    : { data: null };
  const myPlayerId = myPlayer?.id ?? null;

  const [{ data: featuredRows }, { data: mySquads }, { data: communitySquads }] = await Promise.all([
    supabase.rpc("get_featured_squad", { p_group_id: groupId, p_window_days: settings.featured_window_days }),
    myPlayerId
      ? supabase
          .from("squads")
          .select("id, name, team_size, formation, published, squad_slots(slot, player_id)")
          .eq("group_id", groupId)
          .eq("kind", "dream")
          .eq("owner_player_id", myPlayerId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("squads")
      .select(
        "id, name, team_size, formation, owner_player_id, players(display_name), squad_slots(slot, player_id), squad_likes(count)",
      )
      .eq("group_id", groupId)
      .eq("kind", "dream")
      .eq("published", true)
      .order("published_at", { ascending: false }),
  ]);

  const featured = featuredRows?.[0] ?? null;
  let featuredSquad: { id: string; name: string; team_size: number; formation: string; squad_slots: { slot: number; player_id: string }[] } | null = null;
  if (featured) {
    const { data } = await supabase
      .from("squads")
      .select("id, name, team_size, formation, squad_slots(slot, player_id)")
      .eq("id", featured.squad_id)
      .maybeSingle();
    featuredSquad = data;
  }
  const featuredView = featuredSquad ? buildSquadView(squadViewInput(featuredSquad), context, settings) : null;

  const communityOthers = (communitySquads ?? []).filter((s) => s.owner_player_id !== myPlayerId);
  const communitySquadIds = communityOthers.map((s) => s.id);
  const { data: myLikeRows } =
    myPlayerId && communitySquadIds.length > 0
      ? await supabase.from("squad_likes").select("squad_id").eq("player_id", myPlayerId).in("squad_id", communitySquadIds)
      : { data: [] as { squad_id: string }[] };
  const likedSquadIds = new Set((myLikeRows ?? []).map((r) => r.squad_id));

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{es.squads.title}</h1>
        {myPlayerId && (
          <Button asChild size="sm">
            <Link href={`/g/${groupId}/plantillas/nueva`}>{es.squads.new}</Link>
          </Button>
        )}
      </div>

      <section className="flex flex-col items-center gap-2">
        <h2 className="self-start text-sm font-medium text-muted-foreground">{es.squads.featured}</h2>
        {featuredSquad && featuredView ? (
          <Link href={`/g/${groupId}/plantillas/${featuredSquad.id}`} className="flex flex-col items-center gap-2">
            <Pitch slots={featuredView.slots} className="max-w-[240px]" />
            <p className="text-sm font-medium">{featuredSquad.name}</p>
            <p className="text-xs text-muted-foreground">{es.squads.likes(featured!.likes)}</p>
          </Link>
        ) : (
          <Card className="w-full">
            <CardContent className="py-4 text-sm text-muted-foreground">{es.squads.noFeatured}</CardContent>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{es.squads.mine}</h2>
        {!mySquads || mySquads.length === 0 ? (
          <p className="text-sm text-muted-foreground">{es.squads.empty}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {mySquads.map((squad) => {
              const view = buildSquadView(squadViewInput(squad), context, settings);
              return (
                <Link key={squad.id} href={`/g/${groupId}/plantillas/${squad.id}`}>
                  <Card className="transition-colors hover:bg-muted/50">
                    <CardContent className="flex items-center justify-between gap-2 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{squad.name}</p>
                        {view && (
                          <p className="truncate text-xs text-muted-foreground">
                            {es.squads.rating} {view.rating.rating} · {es.squads.chemistry} {view.chemistry.total}/{view.chemistry.max}
                          </p>
                        )}
                      </div>
                      {squad.published && <Badge variant="outline">{es.squads.published}</Badge>}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{es.squads.community}</h2>
        {communityOthers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{es.squads.emptyCommunity}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {communityOthers.map((squad) => {
              const view = buildSquadView(squadViewInput(squad), context, settings);
              const likes = squad.squad_likes[0]?.count ?? 0;
              return (
                <Card key={squad.id}>
                  <CardContent className="flex items-center justify-between gap-2 py-3">
                    <Link href={`/g/${groupId}/plantillas/${squad.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{squad.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {es.squads.by(squad.players?.display_name ?? "?")}
                        {view && ` · ${es.squads.rating} ${view.rating.rating}`}
                      </p>
                    </Link>
                    {myPlayerId && (
                      <LikeButton
                        groupId={groupId}
                        squadId={squad.id}
                        initialLiked={likedSquadIds.has(squad.id)}
                        initialCount={likes}
                      />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
