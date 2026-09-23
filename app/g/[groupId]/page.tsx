import Link from "next/link";
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/server";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export default async function GroupHomePage({ params }: PageProps<"/g/[groupId]">) {
  const { groupId } = await params;
  const supabase = await createClient();

  const { data: players } = await supabase
    .from("players")
    .select("id, display_name, avatar_url")
    .eq("group_id", groupId)
    .is("left_at", null)
    .order("display_name");

  const memberCount = players?.length ?? 0;
  const preview = (players ?? []).slice(0, 8);

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <p className="text-sm text-muted-foreground">{es.groups.members(memberCount)}</p>

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
            {es.groups.members(memberCount)}
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
