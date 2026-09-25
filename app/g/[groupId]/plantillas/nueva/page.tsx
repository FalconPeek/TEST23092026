import { notFound } from "next/navigation";
import { SquadEditor } from "@/components/squads/squad-editor";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { loadSquadContext } from "@/lib/server/squad-context";
import { defaultFormation, type TeamSize } from "@/lib/squads/formations";
import { parseGroupSettings } from "@/lib/settings/group";

export default async function NewSquadPage({ params }: PageProps<"/g/[groupId]/plantillas/nueva">) {
  const { groupId } = await params;
  const userId = await getUserId();
  if (!userId) notFound();

  const supabase = await createClient();

  const [{ data: myPlayer }, { data: group }] = await Promise.all([
    supabase
      .from("players")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .is("left_at", null)
      .maybeSingle(),
    supabase.from("groups").select("settings").eq("id", groupId).maybeSingle(),
  ]);
  if (!myPlayer || !group) notFound();

  const groupSettings = parseGroupSettings(group.settings);
  const teamSize = groupSettings.default_team_size as TeamSize;

  const [{ context, settings }, { data: clubRows }] = await Promise.all([
    loadSquadContext(supabase, groupId),
    supabase.from("clubs").select("id, name, short_name, primary_color, secondary_color, crest_path").eq("group_id", groupId).order("name"),
  ]);

  const clubs = (clubRows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    shortName: c.short_name,
    primaryColor: c.primary_color,
    secondaryColor: c.secondary_color,
    crestUrl: c.crest_path ? supabase.storage.from("club-crests").getPublicUrl(c.crest_path).data.publicUrl : null,
  }));

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-semibold">{es.squads.new}</h1>
      <SquadEditor
        groupId={groupId}
        squadId={null}
        initialName=""
        initialTeamSize={teamSize}
        initialFormationCode={defaultFormation(teamSize).code}
        initialClubId={null}
        initialSlots={[]}
        initialPublished={false}
        players={[...context.players.values()]}
        shared={[...context.shared]}
        settings={settings}
        clubs={clubs}
      />
    </div>
  );
}
