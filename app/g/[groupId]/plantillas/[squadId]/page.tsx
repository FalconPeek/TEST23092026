import { notFound } from "next/navigation";
import { LikeButton } from "@/components/squads/like-button";
import { Pitch } from "@/components/squads/pitch";
import { SquadEditor } from "@/components/squads/squad-editor";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { loadSquadContext } from "@/lib/server/squad-context";
import { buildSquadView } from "@/lib/squads/view";

export default async function SquadDetailPage({
  params,
}: PageProps<"/g/[groupId]/plantillas/[squadId]">) {
  const { groupId, squadId } = await params;
  const userId = await getUserId();
  const supabase = await createClient();

  const { data: squad } = await supabase
    .from("squads")
    .select("id, group_id, kind, name, team_size, formation, club_id, published, owner_player_id, squad_slots(slot, player_id)")
    .eq("id", squadId)
    .maybeSingle();
  if (!squad || squad.group_id !== groupId || squad.kind !== "dream") notFound();

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
  const isOwner = myPlayerId !== null && myPlayerId === squad.owner_player_id;

  const { context, settings } = await loadSquadContext(supabase, groupId);

  if (isOwner) {
    const { data: clubRows, error: clubRowsError } = await supabase
      .from("clubs")
      .select("id, name, short_name, primary_color, secondary_color, crest_path")
      .eq("group_id", groupId)
      .order("name");
    if (clubRowsError) throw clubRowsError;

    const clubs = (clubRows ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      shortName: c.short_name,
      primaryColor: c.primary_color,
      secondaryColor: c.secondary_color,
      crestUrl: c.crest_path ? supabase.storage.from("club-crests").getPublicUrl(c.crest_path).data.publicUrl : null,
    }));

    return (
      <div className="px-4 py-6">
        <SquadEditor
          groupId={groupId}
          squadId={squad.id}
          initialName={squad.name}
          initialTeamSize={squad.team_size as 5 | 6 | 7 | 8 | 9 | 11}
          initialFormationCode={squad.formation}
          initialClubId={squad.club_id}
          initialSlots={squad.squad_slots.map((s) => ({ slot: s.slot, playerId: s.player_id }))}
          initialPublished={squad.published}
          players={[...context.players.values()]}
          shared={[...context.shared]}
          settings={settings}
          clubs={clubs}
        />
      </div>
    );
  }

  if (!squad.published) notFound();

  const view = buildSquadView({ team_size: squad.team_size, formation: squad.formation, slots: squad.squad_slots }, context, settings);
  if (!view) notFound();

  const { data: likeRow } = myPlayerId
    ? await supabase.from("squad_likes").select("player_id").eq("squad_id", squadId).eq("player_id", myPlayerId).maybeSingle()
    : { data: null };
  const { count: likeCount, error: likeCountError } = await supabase
    .from("squad_likes")
    .select("*", { count: "exact", head: true })
    .eq("squad_id", squadId);
  if (likeCountError) throw likeCountError;

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-6">
      <h1 className="text-xl font-semibold">{squad.name}</h1>
      <Pitch slots={view.slots} />
      <div className="flex gap-4 text-sm font-medium">
        <span>
          {es.squads.rating}: <span className="tabular-nums">{view.rating.rating}</span>
        </span>
        <span>
          {es.squads.chemistry}: <span className="tabular-nums">{view.chemistry.total}</span>/{view.chemistry.max}
        </span>
      </div>
      {myPlayerId && (
        <LikeButton groupId={groupId} squadId={squadId} initialLiked={!!likeRow} initialCount={likeCount ?? 0} />
      )}
    </div>
  );
}
