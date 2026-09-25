import { notFound } from "next/navigation";
import { ClubCrest } from "@/components/clubs/club-crest";
import { ClubForm } from "@/components/clubs/club-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isGroupAdmin, type GroupRole } from "@/lib/permissions";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export default async function ClubDetailPage({
  params,
}: PageProps<"/g/[groupId]/clubes/[clubId]">) {
  const { groupId, clubId } = await params;
  const supabase = await createClient();
  const userId = await getUserId();

  const [{ data: club }, { data: membership }] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, group_id, name, short_name, primary_color, secondary_color, crest_path")
      .eq("id", clubId)
      .maybeSingle(),
    userId
      ? supabase.from("group_members").select("role").eq("group_id", groupId).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!club || club.group_id !== groupId) notFound();

  const myRole = membership?.role as GroupRole | undefined;
  const admin = !!myRole && isGroupAdmin(myRole);

  const crestUrl = club.crest_path
    ? supabase.storage.from("club-crests").getPublicUrl(club.crest_path).data.publicUrl
    : null;

  const { data: rosterRows, error: rosterRowsError } = await supabase
    .from("club_players")
    .select("player_id, shirt_number, players(id, display_name, avatar_url)")
    .eq("club_id", clubId);
  if (rosterRowsError) throw rosterRowsError;

  const rosterPlayerIds = (rosterRows ?? []).map((row) => row.player_id);
  const { data: cardRows, error: cardRowsError } =
    rosterPlayerIds.length > 0
      ? await supabase.from("player_cards").select("player_id, ovr").in("player_id", rosterPlayerIds)
      : { data: [], error: null };
  if (cardRowsError) throw cardRowsError;
  const ovrByPlayerId = new Map((cardRows ?? []).map((row) => [row.player_id, row.ovr]));

  if (admin) {
    const { data: playerRows, error: playerRowsError } = await supabase
      .from("players")
      .select("id, display_name, avatar_url")
      .eq("group_id", groupId)
      .is("left_at", null)
      .order("display_name");
    if (playerRowsError) throw playerRowsError;

    const initialRoster: Record<string, number | null> = {};
    for (const row of rosterRows ?? []) {
      initialRoster[row.player_id] = row.shirt_number;
    }

    return (
      <div className="px-4 py-6">
        <ClubForm
          groupId={groupId}
          club={{
            id: club.id,
            name: club.name,
            shortName: club.short_name,
            primaryColor: club.primary_color,
            secondaryColor: club.secondary_color,
            crestPath: club.crest_path,
            crestUrl,
          }}
          players={(playerRows ?? []).map((p) => ({
            id: p.id,
            displayName: p.display_name,
            avatarUrl: p.avatar_url,
          }))}
          initialRoster={initialRoster}
        />
      </div>
    );
  }

  const roster = (rosterRows ?? [])
    .filter((row) => row.players !== null)
    .map((row) => ({
      playerId: row.player_id,
      displayName: row.players!.display_name,
      avatarUrl: row.players!.avatar_url,
      shirtNumber: row.shirt_number,
      ovr: ovrByPlayerId.get(row.player_id) ?? null,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div className="flex flex-col items-center gap-2">
        <ClubCrest
          crestUrl={crestUrl}
          primaryColor={club.primary_color}
          secondaryColor={club.secondary_color}
          shortName={club.short_name}
          name={club.name}
          size="lg"
        />
        <p className="text-lg font-semibold">{club.name}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{es.clubs.roster}</h2>
        {roster.length === 0 ? (
          <Card>
            <CardContent className="py-4 text-sm text-muted-foreground">{es.clubs.empty}</CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-1.5">
            {roster.map((player) => (
              <div
                key={player.playerId}
                className="flex min-h-11 items-center gap-2 rounded-lg bg-card p-2 ring-1 ring-foreground/10"
              >
                <Avatar size="sm">
                  {player.avatarUrl && <AvatarImage src={player.avatarUrl} alt="" />}
                  <AvatarFallback>{initials(player.displayName)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm">{player.displayName}</span>
                {player.shirtNumber !== null && (
                  <span className="text-xs font-medium text-muted-foreground">#{player.shirtNumber}</span>
                )}
                {player.ovr !== null && (
                  <span className="text-sm font-semibold tabular-nums">{player.ovr}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
