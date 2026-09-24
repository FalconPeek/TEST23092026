import { notFound } from "next/navigation";
import { CreateTournamentForm } from "@/components/tournament/create-tournament-form";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isGroupAdmin, type GroupRole } from "@/lib/permissions";
import { parseGroupSettings } from "@/lib/settings/group";

export default async function NewTournamentPage({ params }: PageProps<"/g/[groupId]/torneos/nuevo">) {
  const { groupId } = await params;
  const userId = await getUserId();
  if (!userId) notFound();

  const supabase = await createClient();

  const [{ data: membership }, { data: group }] = await Promise.all([
    supabase.from("group_members").select("role").eq("group_id", groupId).eq("user_id", userId).maybeSingle(),
    supabase.from("groups").select("settings").eq("id", groupId).maybeSingle(),
  ]);

  const myRole = membership?.role as GroupRole | undefined;
  if (!myRole || !isGroupAdmin(myRole) || !group) notFound();

  const settings = parseGroupSettings(group.settings);

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-semibold">{es.tournaments.new}</h1>
      <CreateTournamentForm groupId={groupId} defaultTeamSize={settings.default_team_size} />
    </div>
  );
}
