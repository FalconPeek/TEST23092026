import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TopBar } from "@/components/app-shell/top-bar";
import { CreateGroupDialog } from "@/components/groups/create-group-dialog";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";

export const metadata = { title: es.groups.myGroups };

export default async function MyGroupsPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login?next=%2Fg");

  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("group_members")
    .select("role, groups(id, name)")
    .eq("user_id", userId);

  const groups = (memberships ?? []).flatMap((m) =>
    m.groups ? [{ id: m.groups.id, name: m.groups.name, role: m.role }] : [],
  );

  const memberCounts = new Map<string, number>();
  const groupIds = groups.map((g) => g.id);
  if (groupIds.length > 0) {
    const { data: memberRows } = await supabase
      .from("group_members")
      .select("group_id")
      .in("group_id", groupIds);
    for (const row of memberRows ?? []) {
      memberCounts.set(row.group_id, (memberCounts.get(row.group_id) ?? 0) + 1);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar title={es.groups.myGroups} />
      <main className="flex flex-1 flex-col gap-4 px-4 py-6">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">{es.groups.myGroups}</h1>
          <CreateGroupDialog />
        </div>

        {groups.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
            <Users className="size-10 text-muted-foreground" />
            <p className="font-medium">{es.groups.emptyTitle}</p>
            <p className="text-sm text-muted-foreground">{es.groups.emptyBody}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {groups.map((group) => (
              <li key={group.id}>
                <Link href={`/g/${group.id}`}>
                  <Card className="transition-colors hover:bg-muted/50">
                    <CardContent className="flex items-center justify-between gap-2 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{group.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {es.groups.members(memberCounts.get(group.id) ?? 0)}
                        </p>
                      </div>
                      <Badge variant="outline">{es.roles[group.role]}</Badge>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
