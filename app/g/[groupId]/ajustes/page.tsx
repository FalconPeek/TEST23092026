import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DangerZone } from "@/components/settings/danger-zone";
import { GroupSettingsForm } from "@/components/settings/group-settings-form";
import { GuestPlayers } from "@/components/settings/guest-players";
import { InviteForm } from "@/components/settings/invite-form";
import { InviteList } from "@/components/settings/invite-list";
import { MemberActions } from "@/components/settings/member-actions";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isGroupAdmin, type GroupRole } from "@/lib/permissions";
import { parseGroupSettings } from "@/lib/settings/group";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export default async function GroupSettingsPage({ params }: PageProps<"/g/[groupId]/ajustes">) {
  const { groupId } = await params;
  const userId = await getUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent(`/g/${groupId}/ajustes`)}`);

  const supabase = await createClient();

  const [{ data: memberRows }, { data: playerRows }] = await Promise.all([
    supabase.from("group_members").select("user_id, role, joined_at").eq("group_id", groupId).order("joined_at"),
    supabase
      .from("players")
      .select("id, user_id, display_name, avatar_url, is_guest")
      .eq("group_id", groupId)
      .is("left_at", null),
  ]);

  const myRole = (memberRows ?? []).find((m) => m.user_id === userId)?.role as GroupRole | undefined;
  if (!myRole) redirect("/g");

  const memberUserIds = (memberRows ?? []).map((m) => m.user_id);
  const { data: profileRows } =
    memberUserIds.length > 0
      ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", memberUserIds)
      : { data: [] };
  const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]));
  const playerByUserId = new Map(
    (playerRows ?? []).filter((p) => p.user_id).map((p) => [p.user_id as string, p]),
  );

  const members = (memberRows ?? []).map((m) => {
    const player = playerByUserId.get(m.user_id);
    const profile = profileById.get(m.user_id);
    return {
      userId: m.user_id,
      role: m.role as GroupRole,
      displayName: player?.display_name ?? profile?.display_name ?? "?",
      avatarUrl: player?.avatar_url ?? profile?.avatar_url ?? null,
    };
  });

  const guests = (playerRows ?? [])
    .filter((p) => p.is_guest)
    .map((p) => ({ id: p.id, displayName: p.display_name, avatarUrl: p.avatar_url }));

  const admin = isGroupAdmin(myRole);

  const { data: inviteRows } = admin
    ? await supabase
        .from("invites")
        .select("id, code, role, expires_at, max_uses, uses, revoked_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
    : { data: null };

  const { data: group } = admin
    ? await supabase.from("groups").select("name, settings").eq("id", groupId).maybeSingle()
    : { data: null };

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      {admin && group && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{es.groupSettings.heading}</h2>
          <GroupSettingsForm
            groupId={groupId}
            initialName={group.name}
            initialSettings={parseGroupSettings(group.settings)}
          />
        </section>
      )}

      <Link href={`/g/${groupId}/clubes`}>
        <Card className="transition-colors hover:bg-muted/50">
          <CardContent className="flex min-h-11 items-center justify-between py-3 text-sm font-medium">
            {es.clubs.title}
          </CardContent>
        </Card>
      </Link>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{es.settings.members.heading}</h2>
        <Card>
          <CardContent className="flex flex-col divide-y divide-border py-0">
            {members.map((member) => (
              <div key={member.userId} className="flex items-center justify-between gap-2 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar>
                    {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt={member.displayName} />}
                    <AvatarFallback>{initials(member.displayName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.displayName}
                      {member.userId === userId && (
                        <span className="ml-1 text-muted-foreground">({es.settings.members.you})</span>
                      )}
                    </p>
                    <Badge variant="outline">{es.roles[member.role]}</Badge>
                  </div>
                </div>
                <MemberActions
                  groupId={groupId}
                  targetUserId={member.userId}
                  targetRole={member.role}
                  myRole={myRole}
                  isSelf={member.userId === userId}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {admin && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{es.settings.invites.heading}</h2>
          <InviteForm groupId={groupId} myRole={myRole} />
          <InviteList groupId={groupId} invites={inviteRows ?? []} />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{es.settings.guests.heading}</h2>
        <GuestPlayers groupId={groupId} guests={guests} members={members} myRole={myRole} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{es.settings.danger.heading}</h2>
        <DangerZone groupId={groupId} myRole={myRole} members={members} />
      </section>
    </div>
  );
}
