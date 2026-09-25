import Link from "next/link";
import { ClubCrest } from "@/components/clubs/club-crest";
import { CreateClubDialog } from "@/components/clubs/create-club-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isGroupAdmin, type GroupRole } from "@/lib/permissions";

export default async function ClubsPage({ params }: PageProps<"/g/[groupId]/clubes">) {
  const { groupId } = await params;
  const supabase = await createClient();
  const userId = await getUserId();

  const [{ data: clubs }, { data: membership }] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, name, short_name, primary_color, secondary_color, crest_path, club_players(count)")
      .eq("group_id", groupId)
      .order("name"),
    userId
      ? supabase.from("group_members").select("role").eq("group_id", groupId).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const myRole = membership?.role as GroupRole | undefined;
  const admin = !!myRole && isGroupAdmin(myRole);

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{es.clubs.title}</h1>
        {admin && <CreateClubDialog groupId={groupId} />}
      </div>

      {!clubs || clubs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{es.clubs.empty}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {clubs.map((club) => {
            const crestUrl = club.crest_path
              ? supabase.storage.from("club-crests").getPublicUrl(club.crest_path).data.publicUrl
              : null;
            const rosterCount = club.club_players[0]?.count ?? 0;
            return (
              <Link key={club.id} href={`/g/${groupId}/clubes/${club.id}`}>
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardContent className="flex flex-col items-center gap-2 py-4 text-center">
                    <ClubCrest
                      crestUrl={crestUrl}
                      primaryColor={club.primary_color}
                      secondaryColor={club.secondary_color}
                      shortName={club.short_name}
                      name={club.name}
                      size="md"
                    />
                    <p className="truncate text-sm font-medium">{club.name}</p>
                    <p className="text-xs text-muted-foreground">{es.clubs.rosterCount(rosterCount)}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
