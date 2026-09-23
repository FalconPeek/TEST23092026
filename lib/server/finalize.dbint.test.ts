// Integration test against the real local Supabase stack (npx supabase start). Skipped unless
// RUN_DB_TESTS=1 (see `npm run test:dbint`), which plain `npm test` never sets. Exercises the
// whole real-match path end to end through actual RPCs (not fakes): create a group + match with
// real auth users, submit score/stat/rating reports, request_finalize, then run the pure
// finalizeMatch against a FinalizeRepo backed by the admin (service_role) client, and assert what
// landed in match_results/match_stats/openskill_ratings/player_cards.
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { createSupabaseFinalizeRepo as CreateSupabaseFinalizeRepoType } from "./finalize-repo";
import type { finalizeMatch as FinalizeMatchType } from "./finalize";
import type { createAdminClient as CreateAdminClientType } from "@/lib/supabase/admin";

const RUN_DB_TESTS = process.env.RUN_DB_TESTS === "1";

/** Vitest (unlike `next dev`/`next build`) never loads .env.local on its own; load it here so
 * SUPABASE_SECRET_KEY etc. are set before anything dynamically imports lib/supabase/admin (which
 * reads them at module top-level, so a *static* import here would already be too late). */
function loadEnvLocal(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(here, "../../.env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

if (RUN_DB_TESTS) loadEnvLocal();

describe.skipIf(!RUN_DB_TESTS)("finalizeMatch against the local Supabase stack", () => {
  type AdminClient = ReturnType<typeof CreateAdminClientType>;
  let admin: AdminClient;
  let finalizeMatch: typeof FinalizeMatchType;
  let createSupabaseFinalizeRepo: typeof CreateSupabaseFinalizeRepoType;

  let groupId: string;
  let matchId: string;
  const playerId = new Map<string, string>();

  beforeAll(async () => {
    const adminModule = await import("@/lib/supabase/admin");
    ({ createSupabaseFinalizeRepo } = await import("./finalize-repo"));
    ({ finalizeMatch } = await import("./finalize"));
    admin = adminModule.createAdminClient();

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    async function createSignedInUser() {
      const email = `finalize-dbint-${randomUUID()}@example.test`;
      const password = "Test1234!";
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw error ?? new Error("createUser returned no user");
      const client = createSupabaseJsClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error: signInError } = await client.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      return { userId: data.user.id as string, client };
    }

    const owner = await createSignedInUser();
    const p2 = await createSignedInUser();
    const p3 = await createSignedInUser();
    const p4 = await createSignedInUser();
    const spec1 = await createSignedInUser();

    const { data: createdGroupId, error: createGroupError } = await owner.client.rpc("create_group", {
      p_name: `Finalize dbint ${randomUUID().slice(0, 8)}`,
    });
    if (createGroupError || !createdGroupId) throw createGroupError ?? new Error("create_group returned nothing");
    groupId = createdGroupId;

    const { data: memberInvite, error: memberInviteError } = await owner.client.rpc("create_invite", {
      p_group_id: groupId,
      p_role: "member",
    });
    if (memberInviteError || !memberInvite?.[0]) throw memberInviteError ?? new Error("create_invite (member) failed");
    const { data: spectatorInvite, error: spectatorInviteError } = await owner.client.rpc("create_invite", {
      p_group_id: groupId,
      p_role: "spectator",
    });
    if (spectatorInviteError || !spectatorInvite?.[0]) throw spectatorInviteError ?? new Error("create_invite (spectator) failed");

    for (const u of [p2, p3, p4]) {
      const { error } = await u.client.rpc("accept_invite", { p_code: memberInvite[0].code });
      if (error) throw error;
    }
    const { error: spectatorAcceptError } = await spec1.client.rpc("accept_invite", { p_code: spectatorInvite[0].code });
    if (spectatorAcceptError) throw spectatorAcceptError;

    async function playerIdFor(userId: string): Promise<string> {
      const { data, error } = await admin
        .from("players")
        .select("id")
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .single();
      if (error || !data) throw error ?? new Error(`no player row for user ${userId}`);
      return data.id;
    }

    const p1Id = await playerIdFor(owner.userId);
    const p2Id = await playerIdFor(p2.userId);
    const p3Id = await playerIdFor(p3.userId);
    const p4Id = await playerIdFor(p4.userId);
    const spec1Id = await playerIdFor(spec1.userId);
    playerId.set("p1", p1Id).set("p2", p2Id).set("p3", p3Id).set("p4", p4Id).set("spec1", spec1Id);

    const { data: createdMatchId, error: createMatchError } = await owner.client.rpc("create_match", {
      p_group_id: groupId,
      p_scheduled_at: new Date().toISOString(),
      p_team_size: 3,
      p_venue: null,
    });
    if (createMatchError || !createdMatchId) throw createMatchError ?? new Error("create_match returned nothing");
    matchId = createdMatchId;

    const { error: lineupError } = await owner.client.rpc("set_match_lineup", {
      p_match_id: matchId,
      p_team1: { name: "Equipo 1", players: [{ player_id: p1Id }, { player_id: p2Id }] },
      p_team2: { name: "Equipo 2", players: [{ player_id: p3Id }, { player_id: p4Id }] },
      p_spectators: [spec1Id],
    });
    if (lineupError) throw lineupError;

    const { error: startError } = await owner.client.rpc("start_reporting", {
      p_match_id: matchId,
      p_played_at: new Date().toISOString(),
    });
    if (startError) throw startError;

    // Score reports: one per side, agreeing on 2-1.
    for (const u of [owner, p3]) {
      const { error } = await u.client.rpc("submit_score_report", { p_match_id: matchId, p_team1_goals: 2, p_team2_goals: 1 });
      if (error) throw error;
    }

    // Stat reports (lone self-reports; Rule A accepts a lone self-report). p1 scores both of side
    // 1's goals, p2 assists one of them; p4 scores side 2's only goal and makes 2 saves.
    const statReports: [typeof owner, { subject_player_id: string; goals: number; assists: number; own_goals: number; saves: number }][] = [
      [owner, { subject_player_id: p1Id, goals: 2, assists: 0, own_goals: 0, saves: 0 }],
      [p2, { subject_player_id: p2Id, goals: 0, assists: 1, own_goals: 0, saves: 0 }],
      [p4, { subject_player_id: p4Id, goals: 1, assists: 0, own_goals: 0, saves: 2 }],
    ];
    for (const [reporter, report] of statReports) {
      const { error } = await reporter.client.rpc("submit_stat_reports", { p_match_id: matchId, p_reports: [report] });
      if (error) throw error;
    }

    // Ratings: every non-target rates every team player, p1 highest so the MVP is deterministic.
    const targets = [p1Id, p2Id, p3Id, p4Id];
    const ratingFor = (targetId: string) => (targetId === p1Id ? 9 : 6);
    const raters: { client: typeof owner.client; selfId: string | null }[] = [
      { client: owner.client, selfId: p1Id },
      { client: p2.client, selfId: p2Id },
      { client: p3.client, selfId: p3Id },
      { client: p4.client, selfId: p4Id },
      { client: spec1.client, selfId: null },
    ];
    for (const { client, selfId } of raters) {
      const ratings = targets.filter((t) => t !== selfId).map((t) => ({ target_player_id: t, rating: ratingFor(t) }));
      const { error } = await client.rpc("submit_match_ratings", { p_match_id: matchId, p_ratings: ratings });
      if (error) throw error;
    }

    // Closes both windows immediately so finalizeMatch (called with `new Date()` in the test
    // itself) sees rating_deadline <= now without needing to actually wait out the real windows.
    const { error: requestError } = await owner.client.rpc("request_finalize", { p_match_id: matchId });
    if (requestError) throw requestError;
  }, 60_000);

  // No cleanup is possible here today: there is no delete_group RPC (and service_role
  // deliberately has no DELETE grant on public.groups -- see
  // 20260923104303_service_role_read_grants.sql, which only grants SELECT), so the test group
  // can't be removed. Every member's own players row (created via accept_invite/create_group) has
  // created_by = themselves, and players.created_by -> auth.users is ON DELETE RESTRICT, so no
  // auth user we created here can be deleted either while that row (or the group) still exists.
  // This is a real gap (there is currently no sanctioned way to tear down a group/its members at
  // all, test or otherwise) -- see the final report. The leftover group + users are harmless
  // local/dev-only residue with a recognizable `finalize-dbint-`/`Finalize dbint ` prefix, fully
  // cleared by `supabase db reset`.

  it("reconciles the real match, updates OpenSkill, and recomputes cards", async () => {
    const repo = createSupabaseFinalizeRepo(admin);
    const outcome = await finalizeMatch(repo, matchId, new Date());
    expect(outcome).toEqual({ matchId, status: "finalized" });

    const { data: matchRow } = await admin.from("matches").select("status, finalized_at").eq("id", matchId).single();
    expect(matchRow?.status).toBe("finalized");
    expect(matchRow?.finalized_at).not.toBeNull();

    const { data: resultRow } = await admin.from("match_results").select("*").eq("match_id", matchId).single();
    expect(resultRow).toMatchObject({ team1_goals: 2, team2_goals: 1, decided_by: "regular", winner_side: 1 });

    const { data: statsRows } = await admin.from("match_stats").select("*").eq("match_id", matchId);
    expect(statsRows).toHaveLength(4);
    const p1Stats = statsRows!.find((r) => r.player_id === playerId.get("p1"))!;
    expect(p1Stats.goals).toBe(2);
    expect(Number(p1Stats.median_rating)).toBe(9);
    expect(p1Stats.is_mvp).toBe(true);
    expect(statsRows!.filter((r) => r.is_mvp).length).toBe(1);
    const p2Stats = statsRows!.find((r) => r.player_id === playerId.get("p2"))!;
    expect(p2Stats.assists).toBe(1);

    const teamPlayerIds = [playerId.get("p1")!, playerId.get("p2")!, playerId.get("p3")!, playerId.get("p4")!];
    const { data: skillRows } = await admin.from("openskill_ratings").select("*").in("player_id", teamPlayerIds);
    expect(skillRows).toHaveLength(4);
    expect(skillRows!.every((r) => r.matches_played === 1)).toBe(true);
    const muByPlayer = new Map(skillRows!.map((r) => [r.player_id, Number(r.mu)]));
    expect(muByPlayer.get(playerId.get("p1")!)!).toBeGreaterThan(25); // side 1 won
    expect(muByPlayer.get(playerId.get("p3")!)!).toBeLessThan(25); // side 2 lost

    const { data: spectatorSkillRows } = await admin
      .from("openskill_ratings")
      .select("player_id")
      .eq("player_id", playerId.get("spec1")!);
    expect(spectatorSkillRows).toEqual([]); // spectators never get an OpenSkill row

    const { data: cardRows } = await admin.from("player_cards").select("*").in("player_id", teamPlayerIds);
    expect(cardRows).toHaveLength(4);
    for (const card of cardRows!) {
      expect(card.is_provisional).toBe(true); // 0 scouting raters
      expect(card.ovr).toBeGreaterThanOrEqual(1);
      expect(card.ovr).toBeLessThanOrEqual(99);
    }

    // Idempotent against the real DB too: re-running on the now-finalized match is a no-op.
    const secondOutcome = await finalizeMatch(repo, matchId, new Date());
    expect(secondOutcome).toEqual({ matchId, status: "skipped", reason: "already_finalized" });
  });
});
