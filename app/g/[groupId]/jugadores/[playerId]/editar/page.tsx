import { notFound, redirect } from "next/navigation";
import { PlayerProfileForm } from "@/components/player/player-profile-form";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isGroupAdmin, type GroupRole } from "@/lib/permissions";
import type { PositionCode } from "@/lib/rating/positions";

export const metadata = { title: es.player.editMyProfile };

export default async function EditPlayerPage({
  params,
}: PageProps<"/g/[groupId]/jugadores/[playerId]/editar">) {
  const { groupId, playerId } = await params;
  const userId = await getUserId();
  if (!userId) {
    redirect(`/login?next=${encodeURIComponent(`/g/${groupId}/jugadores/${playerId}/editar`)}`);
  }

  const supabase = await createClient();

  const [{ data: player }, { data: membership }] = await Promise.all([
    supabase
      .from("players")
      .select(
        "id, group_id, user_id, display_name, primary_position, alt_positions, preferred_foot, height_cm, is_guest, left_at",
      )
      .eq("id", playerId)
      .maybeSingle(),
    supabase.from("group_members").select("role").eq("group_id", groupId).eq("user_id", userId).maybeSingle(),
  ]);

  if (!player || player.group_id !== groupId || player.left_at) notFound();

  const myRole = membership?.role as GroupRole | undefined;
  const isOwnProfile = player.user_id === userId;
  const editedByAdmin = !isOwnProfile && player.is_guest && !!myRole && isGroupAdmin(myRole);

  if (!isOwnProfile && !editedByAdmin) notFound();

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-semibold">{es.player.editMyProfile}</h1>
      <PlayerProfileForm
        groupId={groupId}
        editedByAdmin={editedByAdmin}
        player={{
          id: player.id,
          displayName: player.display_name,
          primaryPosition: (player.primary_position as PositionCode | null) ?? null,
          altPositions: (player.alt_positions as PositionCode[] | null) ?? [],
          preferredFoot: player.preferred_foot,
          heightCm: player.height_cm,
        }}
      />
    </div>
  );
}
