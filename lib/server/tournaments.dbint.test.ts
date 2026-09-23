// Integration test against the real local Supabase stack (npx supabase start), mirroring
// finalize.dbint.test.ts. Skipped unless RUN_DB_TESTS=1 (see `npm run test:dbint`). Exercises the
// whole tournament path through the real RPCs: create a group + 4 team entries, generate a
// single_elim bracket (lib/server/tournaments.ts's generateBracket against the admin-client
// TournamentRepo), confirm results through to a champion, then separately link + finalize a real
// match for another fixture and assert the finalizer's tournament-sync hook (lib/server/finalize.ts)
// auto-advanced the bracket.
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { seededRng as SeededRngType } from "@/lib/brackets";
import type { createAdminClient as CreateAdminClientType } from "@/lib/supabase/admin";
import type { createSupabaseFinalizeRepo as CreateSupabaseFinalizeRepoType } from "./finalize-repo";
import type { finalizeMatch as FinalizeMatchType } from "./finalize";
import type { createSupabaseTournamentRepo as CreateSupabaseTournamentRepoType } from "./tournament-repo";
import type { generateBracket as GenerateBracketType } from "./tournaments";

const RUN_DB_TESTS = process.env.RUN_DB_TESTS === "1";

/** Vitest never loads .env.local on its own; load it before anything dynamically imports
 * lib/supabase/admin (which reads SUPABASE_SECRET_KEY at module top-level). */
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

type AdminClient = ReturnType<typeof CreateAdminClientType>;

/** Module-scope (not typed via an explicit return annotation, so `client`'s type is inferred
 * naturally from the actual createSupabaseJsClient(...) call below rather than from that
 * generic function's unresolved default type params -- an explicit `Promise<{client: ...}>`
 * annotation here would otherwise widen `client` to an incompatible SupabaseClient shape). */
async function createSignedInUser(admin: AdminClient, url: string, key: string) {
  const email = `tournaments-dbint-${randomUUID()}@example.test`;
  const password = "Test1234!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  const client = createSupabaseJsClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { userId: data.user.id as string, client };
}

type SignedInUser = Awaited<ReturnType<typeof createSignedInUser>>;

describe.skipIf(!RUN_DB_TESTS)("tournament flow against the local Supabase stack", () => {
  let admin: AdminClient;
  let seededRng: typeof SeededRngType;
  let createSupabaseTournamentRepo: typeof CreateSupabaseTournamentRepoType;
  let generateBracket: typeof GenerateBracketType;
  let createSupabaseFinalizeRepo: typeof CreateSupabaseFinalizeRepoType;
  let finalizeMatch: typeof FinalizeMatchType;

  let groupId: string;
  let tournamentId: string;
  const entryId = new Map<string, string>(); // "e1".."e4" -> tournament_entries.id
  const playerId = new Map<string, string>(); // "p1".."p4" -> players.id
  const userByPlayerTag = new Map<string, SignedInUser>(); // "p1".."p4" -> signed-in user/client
  let owner: SignedInUser;

  beforeAll(async () => {
    const adminModule = await import("@/lib/supabase/admin");
    ({ seededRng } = await import("@/lib/brackets"));
    ({ createSupabaseTournamentRepo } = await import("./tournament-repo"));
    ({ generateBracket } = await import("./tournaments"));
    ({ createSupabaseFinalizeRepo } = await import("./finalize-repo"));
    ({ finalizeMatch } = await import("./finalize"));
    admin = adminModule.createAdminClient();

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    owner = await createSignedInUser(admin, url, key);
    const p2 = await createSignedInUser(admin, url, key);
    const p3 = await createSignedInUser(admin, url, key);
    const p4 = await createSignedInUser(admin, url, key);
    userByPlayerTag.set("p1", owner).set("p2", p2).set("p3", p3).set("p4", p4);

    const { data: createdGroupId, error: createGroupError } = await owner.client.rpc("create_group", {
      p_name: `Tournaments dbint ${randomUUID().slice(0, 8)}`,
    });
    if (createGroupError || !createdGroupId) throw createGroupError ?? new Error("create_group returned nothing");
    groupId = createdGroupId;

    const { data: invite, error: inviteError } = await owner.client.rpc("create_invite", {
      p_group_id: groupId,
      p_role: "member",
    });
    if (inviteError || !invite?.[0]) throw inviteError ?? new Error("create_invite failed");
    for (const u of [p2, p3, p4]) {
      const { error } = await u.client.rpc("accept_invite", { p_code: invite[0].code });
      if (error) throw error;
    }

    async function playerIdFor(userId: string): Promise<string> {
      const { data, error } = await admin.from("players").select("id").eq("group_id", groupId).eq("user_id", userId).single();
      if (error || !data) throw error ?? new Error(`no player row for user ${userId}`);
      return data.id;
    }
    playerId.set("p1", await playerIdFor(owner.userId));
    playerId.set("p2", await playerIdFor(p2.userId));
    playerId.set("p3", await playerIdFor(p3.userId));
    playerId.set("p4", await playerIdFor(p4.userId));

    const { data: createdTournamentId, error: createTournamentError } = await owner.client.rpc("create_tournament", {
      p_group_id: groupId,
      p_name: "Copa dbint",
      p_format: "single_elim",
      p_team_size: 3,
      p_entry_mode: "teams",
    });
    if (createTournamentError || !createdTournamentId) throw createTournamentError ?? new Error("create_tournament failed");
    tournamentId = createdTournamentId;

    const { error: entriesError } = await owner.client.rpc("save_tournament_entries", {
      p_tournament_id: tournamentId,
      p_entries: [1, 2, 3, 4].map((n) => ({ name: `Equipo ${n}`, seed: n, player_ids: [playerId.get(`p${n}`)] })),
    });
    if (entriesError) throw entriesError;

    const { data: entryRows, error: entryRowsError } = await admin
      .from("tournament_entries")
      .select("id, seed")
      .eq("tournament_id", tournamentId);
    if (entryRowsError || !entryRows) throw entryRowsError ?? new Error("no entries persisted");
    for (const row of entryRows) entryId.set(`e${row.seed}`, row.id);

    // Generation itself is unit-tested against a fake repo (tournaments.test.ts); this exercises
    // the real createSupabaseTournamentRepo round trip (uuid <-> engine_key translation, jsonb
    // payload shape) through persist_bracket.
    const repo = createSupabaseTournamentRepo(admin);
    await generateBracket(repo, tournamentId, seededRng(1));
  }, 60_000);

  it("single_elim: generates a real bracket and confirms results through to a champion", async () => {
    // standardSeedOrder(4) = [1,4,2,3]: round 1 pairs seed1-vs-seed4 and seed2-vs-seed3.
    const { data: round1 } = await admin
      .from("tournament_matches")
      .select("id, entry1_id, entry2_id")
      .eq("tournament_id", tournamentId)
      .eq("bracket", "winners")
      .eq("round", 1)
      .order("number", { ascending: true });
    expect(round1).toHaveLength(2);

    const seed1Match = round1!.find((m) => m.entry1_id === entryId.get("e1") || m.entry2_id === entryId.get("e1"))!;
    const otherMatch = round1!.find((m) => m.id !== seed1Match.id)!;

    // seed1 (entry e1) wins its match; in the other match, whichever side is entry1 wins (arbitrary
    // -- only e1's path to the final matters for this assertion).
    const seed1IsEntry1 = seed1Match.entry1_id === entryId.get("e1");
    const r1 = await admin.rpc("confirm_match_result", {
      p_tournament_match_id: seed1Match.id,
      p_score1: seed1IsEntry1 ? 3 : 0,
      p_score2: seed1IsEntry1 ? 0 : 3,
    });
    if (r1.error) throw r1.error;
    const r2 = await admin.rpc("confirm_match_result", { p_tournament_match_id: otherMatch.id, p_score1: 2, p_score2: 1 });
    if (r2.error) throw r2.error;

    // single_elim's "final" bracket keeps the winners bracket's round numbering going (round 2
    // for a 4-entry/2-round bracket, not reset to 1 -- unlike double_elim's grand final, which is
    // its own explicit round-1 match). There's exactly one 'final' match here either way.
    const { data: final } = await admin
      .from("tournament_matches")
      .select("id, entry1_id, entry2_id, status")
      .eq("tournament_id", tournamentId)
      .eq("bracket", "final")
      .single();
    expect(final!.status).toBe("ready");
    expect([final!.entry1_id, final!.entry2_id]).toContain(entryId.get("e1"));

    const finalIsEntry1 = final!.entry1_id === entryId.get("e1");
    const { error: finalConfirmError } = await admin.rpc("confirm_match_result", {
      p_tournament_match_id: final!.id,
      p_score1: finalIsEntry1 ? 1 : 0,
      p_score2: finalIsEntry1 ? 0 : 1,
    });
    expect(finalConfirmError).toBeNull();

    const { data: finalAfter } = await admin
      .from("tournament_matches")
      .select("winner_entry_id, status")
      .eq("id", final!.id)
      .single();
    expect(finalAfter!.status).toBe("completed");
    expect(finalAfter!.winner_entry_id).toBe(entryId.get("e1"));
  });

  it("finalizing a linked real match auto-advances the bracket via the finalizer hook", async () => {
    // A second, independent bracket so this test doesn't depend on the first test's round-1 state.
    const { data: freshTournamentId, error: createError } = await owner.client.rpc("create_tournament", {
      p_group_id: groupId,
      p_name: "Copa dbint 2",
      p_format: "single_elim",
      p_team_size: 3,
      p_entry_mode: "teams",
    });
    if (createError || !freshTournamentId) throw createError ?? new Error("create_tournament failed");

    const { error: entriesError } = await owner.client.rpc("save_tournament_entries", {
      p_tournament_id: freshTournamentId,
      p_entries: [1, 2, 3, 4].map((n) => ({ name: `Equipo ${n}`, seed: n, player_ids: [playerId.get(`p${n}`)] })),
    });
    if (entriesError) throw entriesError;

    const repo = createSupabaseTournamentRepo(admin);
    await generateBracket(repo, freshTournamentId, seededRng(2));

    const { data: round1 } = await admin
      .from("tournament_matches")
      .select("id, entry1_id, entry2_id")
      .eq("tournament_id", freshTournamentId)
      .eq("bracket", "winners")
      .eq("round", 1)
      .order("number", { ascending: true });
    const fixture = round1![0]!;

    const { data: linkedMatchId, error: linkError } = await owner.client.rpc("link_tournament_match", {
      p_tournament_match_id: fixture.id,
      p_scheduled_at: new Date().toISOString(),
    });
    if (linkError || !linkedMatchId) throw linkError ?? new Error("link_tournament_match failed");

    const { data: entryRows } = await admin
      .from("tournament_entries")
      .select("id, player_ids")
      .in("id", [fixture.entry1_id!, fixture.entry2_id!]);
    const side1PlayerId = entryRows!.find((e) => e.id === fixture.entry1_id)!.player_ids[0]!;
    const side2PlayerId = entryRows!.find((e) => e.id === fixture.entry2_id)!.player_ids[0]!;
    const side1User = [...userByPlayerTag.entries()].find(([tag]) => playerId.get(tag) === side1PlayerId)![1];
    const side2User = [...userByPlayerTag.entries()].find(([tag]) => playerId.get(tag) === side2PlayerId)![1];

    const { error: startError } = await owner.client.rpc("start_reporting", {
      p_match_id: linkedMatchId,
      p_played_at: new Date().toISOString(),
    });
    if (startError) throw startError;

    // Agreeing score reports from both sides (side 1 wins 2-0), plus a lone self-report per player
    // so Rule A's per-player stat step has something to reconcile.
    for (const u of [side1User, side2User]) {
      const { error } = await u.client.rpc("submit_score_report", { p_match_id: linkedMatchId, p_team1_goals: 2, p_team2_goals: 0 });
      if (error) throw error;
    }
    const { error: statError1 } = await side1User.client.rpc("submit_stat_reports", {
      p_match_id: linkedMatchId,
      p_reports: [{ subject_player_id: side1PlayerId, goals: 2, assists: 0, own_goals: 0, saves: 0 }],
    });
    if (statError1) throw statError1;
    const { error: statError2 } = await side2User.client.rpc("submit_stat_reports", {
      p_match_id: linkedMatchId,
      p_reports: [{ subject_player_id: side2PlayerId, goals: 0, assists: 0, own_goals: 0, saves: 0 }],
    });
    if (statError2) throw statError2;

    const { error: requestFinalizeError } = await owner.client.rpc("request_finalize", { p_match_id: linkedMatchId });
    if (requestFinalizeError) throw requestFinalizeError;

    const finalizeRepo = createSupabaseFinalizeRepo(admin);
    const outcome = await finalizeMatch(finalizeRepo, linkedMatchId, new Date());
    expect(outcome.status).toBe("finalized");
    if (outcome.status === "finalized") expect(outcome.tournamentSyncError).toBeUndefined();

    const { data: fixtureAfter } = await admin
      .from("tournament_matches")
      .select("status, winner_entry_id, next_match_id, next_slot")
      .eq("id", fixture.id)
      .single();
    expect(fixtureAfter!.status).toBe("completed");
    expect(fixtureAfter!.winner_entry_id).toBe(fixture.entry1_id); // side 1 (entry1) won 2-0

    // Auto-advanced: the final's slot this fixture feeds now holds the winner.
    const { data: nextMatch } = await admin
      .from("tournament_matches")
      .select("entry1_id, entry2_id")
      .eq("id", fixtureAfter!.next_match_id!)
      .single();
    const nextSlotValue = fixtureAfter!.next_slot === 1 ? nextMatch!.entry1_id : nextMatch!.entry2_id;
    expect(nextSlotValue).toBe(fixture.entry1_id);
  });

  // No cleanup possible here today, same gap as finalize.dbint.test.ts: no delete_group RPC and
  // no service_role DELETE grant on public.groups. Leftover group/tournament/users are harmless
  // local/dev-only residue with a recognizable `tournaments-dbint-`/`Copa dbint`/`Tournaments dbint`
  // prefix, fully cleared by `supabase db reset`.
});
