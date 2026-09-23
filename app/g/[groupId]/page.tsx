import Link from "next/link";
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export default async function GroupHomePage({ params }: PageProps<"/g/[groupId]">) {
  const { groupId } = await params;
  const supabase = await createClient();
  const userId = await getUserId();

  const [{ data: players }, { count: memberCount }] = await Promise.all([
    supabase
      .from("players")
      .select("id, user_id, display_name, avatar_url")
      .eq("group_id", groupId)
      .is("left_at", null)
      .order("display_name"),
    supabase.from("group_members").select("*", { count: "exact", head: true }).eq("group_id", groupId),
  ]);

  const preview = (players ?? []).slice(0, 8);
  const myPlayer = (players ?? []).find((p) => p.user_id === userId);

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{es.groups.members(memberCount ?? 0)}</p>
        {myPlayer && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/g/${groupId}/jugadores/${myPlayer.id}/editar`}>{es.player.editMyProfile}</Link>
          </Button>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{es.groups.pendingActions}</h2>
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            {es.groups.nothingPending}
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{es.groups.nextMatches}</h2>
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            {es.groups.noMatches}
          </CardContent>
        </Card>
      </section>

      {preview.length > 0 && (
        <Link href={`/g/${groupId}/ajustes`} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            {es.groups.members(memberCount ?? 0)}
          </h2>
          <AvatarGroup>
            {preview.map((player) => (
              <Avatar key={player.id}>
                {player.avatar_url && <AvatarImage src={player.avatar_url} alt={player.display_name} />}
                <AvatarFallback>{initials(player.display_name)}</AvatarFallback>
              </Avatar>
            ))}
          </AvatarGroup>
        </Link>
      )}
    </div>
  );
}
