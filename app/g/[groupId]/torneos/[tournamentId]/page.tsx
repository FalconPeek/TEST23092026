import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EntriesEditor, type EntryPlayer } from "@/components/tournament/entries-editor";
import { TournamentAdminControls, TournamentRegisterButton } from "@/components/tournament/tournament-hub-client";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isGroupAdmin, type GroupRole } from "@/lib/permissions";
import type { DraftEntry } from "@/lib/tournament/entries";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export default async function TournamentOverviewPage({
  params,
}: PageProps<"/g/[groupId]/torneos/[tournamentId]">) {
  const { groupId, tournamentId } = await params;
  const userId = await getUserId();
  if (!userId) notFound();

  const supabase = await createClient();

  const [{ data: tournament }, { data: membership }, { data: myPlayer }] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id, group_id, format, status, entry_mode, team_size")
      .eq("id", tournamentId)
      .maybeSingle(),
    supabase.from("group_members").select("role").eq("group_id", groupId).eq("user_id", userId).maybeSingle(),
    supabase.from("players").select("id").eq("group_id", groupId).eq("user_id", userId).is("left_at", null).maybeSingle(),
  ]);

  if (!tournament || tournament.group_id !== groupId) notFound();

  const myRole = membership?.role as GroupRole | undefined;
  const admin = !!myRole && isGroupAdmin(myRole);
  const editable = admin && (tournament.status === "draft" || tournament.status === "registration");
  const generated = tournament.status === "in_progress" || tournament.status === "finished";
  const bracketTabHref =
    tournament.format === "league"
      ? `/g/${groupId}/torneos/${tournamentId}/tabla`
      : `/g/${groupId}/torneos/${tournamentId}/llave`;
  const bracketTabLabel = tournament.format === "league" ? es.tournament.tabs.table : es.tournament.tabs.bracket;

  const generatedSummary = generated ? (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-card p-3 ring-1 ring-foreground/10">
      <p className="text-sm text-muted-foreground">{es.tournament.generated}</p>
      <Link href={bracketTabHref} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        {bracketTabLabel}
      </Link>
    </div>
  ) : null;

  if (tournament.entry_mode === "individual") {
    const { data: registrationRows } = await supabase
      .from("tournament_registrations")
      .select("player_id, players(id, display_name, avatar_url)")
      .eq("tournament_id", tournamentId);

    const registrations = (registrationRows ?? []).flatMap((r) => (r.players ? [r.players] : []));
    const isRegistered = !!myPlayer && registrations.some((p) => p.id === myPlayer.id);
    const canGenerate = registrations.length >= tournament.team_size * 2;

    return (
      <div className="flex flex-col gap-6">
        {admin && (
          <TournamentAdminControls
            groupId={groupId}
            tournamentId={tournamentId}
            status={tournament.status}
            canGenerate={canGenerate}
          />
        )}

        {generatedSummary}

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            {es.tournament.entries} · {es.tournament.registered(registrations.length)}
          </h2>
          <div className="flex flex-col gap-1.5">
            {registrations.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <Avatar size="sm">
                  {p.avatar_url && <AvatarImage src={p.avatar_url} alt="" />}
                  <AvatarFallback>{initials(p.display_name)}</AvatarFallback>
                </Avatar>
                <span className="text-sm">{p.display_name}</span>
              </div>
            ))}
          </div>
        </div>

        {tournament.status === "registration" && myPlayer && myRole !== "spectator" && (
          <TournamentRegisterButton groupId={groupId} tournamentId={tournamentId} isRegistered={isRegistered} />
        )}
      </div>
    );
  }

  const [{ data: playerRows }, { data: entryRows }] = await Promise.all([
    supabase
      .from("players")
      .select("id, display_name, avatar_url")
      .eq("group_id", groupId)
      .is("left_at", null)
      .order("display_name"),
    supabase
      .from("tournament_entries")
      .select("id, name, seed, player_ids")
      .eq("tournament_id", tournamentId)
      .order("seed", { ascending: true, nullsFirst: false }),
  ]);

  const playerIds = (playerRows ?? []).map((p) => p.id);
  const { data: cardRows } =
    playerIds.length > 0
      ? await supabase.from("player_cards").select("player_id, ovr").in("player_id", playerIds)
      : { data: [] };
  const ovrByPlayer = new Map((cardRows ?? []).map((r) => [r.player_id, r.ovr]));

  const players: EntryPlayer[] = (playerRows ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name,
    avatarUrl: p.avatar_url,
    ovr: ovrByPlayer.get(p.id) ?? 60,
  }));

  const initialEntries: DraftEntry[] = (entryRows ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    seed: e.seed,
    playerIds: e.player_ids,
  }));

  const canGenerate = initialEntries.length >= 2;

  return (
    <div className="flex flex-col gap-6">
      {admin && (
        <TournamentAdminControls
          groupId={groupId}
          tournamentId={tournamentId}
          status={tournament.status}
          canGenerate={canGenerate}
        />
      )}

      {generatedSummary}

      <EntriesEditor
        groupId={groupId}
        tournamentId={tournamentId}
        players={players}
        initialEntries={initialEntries}
        editable={editable}
      />
    </div>
  );
}
