import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";
import { env } from "./support/env";
import { adminClient, createTestUser, loginViaUi, userClient, type TestUser } from "./support/users";

// Happy path for a friendly: admin schedules it (UI) → lineup + "terminó" (API) → players report the
// score and rate (UI) → admin closes it → the cron finalizer reconciles, updates OpenSkill, awards
// badges and notifies. Setup steps without dedicated assertions go through the API to keep the
// spec fast and stable; the screens a player actually uses are driven through the UI.
test.describe.configure({ mode: "serial" });

type Db = SupabaseClient<Database>;

let owner: TestUser;
let players: TestUser[];
let ownerDb: Db;
let groupId: string;
let matchId: string;
const playerIdByUser = new Map<string, string>();

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null || result.data === undefined) throw new Error(`${what}: no data`);
  return result.data as NonNullable<T>;
}

/** For RPCs that return nothing: only the error matters. */
function run(result: { error: { message: string } | null }, what: string): void {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
}

test.beforeAll(async () => {
  owner = await createTestUser("admin");
  players = await Promise.all(["uno", "dos", "tres"].map((label) => createTestUser(label)));
  ownerDb = await userClient(owner);

  groupId = unwrap(await ownerDb.rpc("create_group", { p_name: `E2E Partido ${owner.name}` }), "create_group");
  const [invite] = unwrap(await ownerDb.rpc("create_invite", { p_group_id: groupId, p_role: "member" }), "create_invite");
  for (const player of players) {
    const db = await userClient(player);
    run(await db.rpc("accept_invite", { p_code: invite!.code }), "accept_invite");
  }

  const rows = unwrap(await ownerDb.from("players").select("id, user_id").eq("group_id", groupId), "players");
  for (const row of rows) if (row.user_id) playerIdByUser.set(row.user_id, row.id);
  expect(playerIdByUser.size).toBe(4);
});

test("admin schedules a match from the UI", async ({ page }) => {
  await loginViaUi(page, owner, `/g/${groupId}/partidos/nuevo`);
  await page.locator("#match-when").fill("2030-06-15T20:00");
  await page.locator("#match-venue").fill("Cancha E2E");
  await page.getByRole("button", { name: "Nuevo partido" }).click();

  await page.waitForURL(/\/partidos\/[0-9a-f-]{36}\/equipos$/);
  matchId = page.url().split("/").at(-2)!;
});

test("lineup is set and the match moves to reporting", async () => {
  const pid = (u: TestUser) => playerIdByUser.get(u.id)!;
  run(
    await ownerDb.rpc("set_match_lineup", {
      p_match_id: matchId,
      p_team1: { name: "Blancos", players: [{ player_id: pid(owner) }, { player_id: pid(players[0]!) }] },
      p_team2: { name: "Negros", players: [{ player_id: pid(players[1]!) }, { player_id: pid(players[2]!) }] },
      p_spectators: [],
    }),
    "set_match_lineup",
  );
  run(await ownerDb.rpc("start_reporting", { p_match_id: matchId }), "start_reporting");
});

test("a player reports the score and rates everyone from the UI", async ({ page }) => {
  const reporter = players[0]!;
  await loginViaUi(page, reporter, `/g/${groupId}/partidos/${matchId}`);

  const scoreForm = page.locator("div.rounded-xl", { has: page.getByRole("button", { name: "Guardar resultado" }) });
  const plus = scoreForm.getByRole("button", { name: "+" });
  await plus.nth(0).click();
  await plus.nth(0).click();
  await plus.nth(1).click();
  await scoreForm.getByRole("button", { name: "Guardar resultado" }).click();
  await expect(page.getByText("Resultado cargado")).toBeVisible();

  for (const other of [owner, players[1]!, players[2]!]) {
    const row = page
      .locator("div", { has: page.getByText(other.name, { exact: true }) })
      .filter({ has: page.getByRole("button", { name: "8", exact: true }) })
      .last();
    await row.getByRole("button", { name: "8", exact: true }).click();
  }
  await page.getByRole("button", { name: "Enviar puntajes" }).click();
  await expect(page.getByText("Puntajes enviados")).toBeVisible();
});

test("the other side agrees on the score and the rest rate", async () => {
  const pid = (u: TestUser) => playerIdByUser.get(u.id)!;
  const everyone = [owner, ...players];
  for (const rater of [owner, players[1]!, players[2]!]) {
    const db = rater === owner ? ownerDb : await userClient(rater);
    if (rater === players[1]) {
      run(await db.rpc("submit_score_report", { p_match_id: matchId, p_team1_goals: 2, p_team2_goals: 1 }), "score");
      // Rule A needs the goals attributed to scorers to add up to the score.
      run(
        await db.rpc("submit_stat_reports", {
          p_match_id: matchId,
          p_reports: [
            { subject_player_id: pid(players[0]!), goals: 2, assists: 0, own_goals: 0, saves: 0 },
            { subject_player_id: pid(owner), goals: 0, assists: 1, own_goals: 0, saves: 0 },
            { subject_player_id: pid(players[1]!), goals: 1, assists: 0, own_goals: 0, saves: 0 },
          ],
        }),
        "stats",
      );
    }
    const ratings = everyone
      .filter((u) => u !== rater)
      .map((u) => ({ target_player_id: pid(u), rating: u === players[0] ? 9 : 7, standout_attributes: [] }));
    run(await db.rpc("submit_match_ratings", { p_match_id: matchId, p_ratings: ratings }), "ratings");
  }
});

test("closing the match finalizes it through the cron route", async ({ request }) => {
  run(await ownerDb.rpc("request_finalize", { p_match_id: matchId }), "request_finalize");

  const unauthorized = await request.post("/api/cron/finalize");
  expect(unauthorized.status()).toBe(401);

  const response = await request.post("/api/cron/finalize", {
    headers: { Authorization: `Bearer ${env.cronSecret}` },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { matchesFinalized: number };
  expect(body.matchesFinalized).toBeGreaterThanOrEqual(1);

  const admin = adminClient();
  const { data: match } = await admin.from("matches").select("status").eq("id", matchId).single();
  expect(match?.status).toBe("finalized");

  const { data: result } = await admin.from("match_results").select("team1_goals, team2_goals, winner_side").eq("match_id", matchId).single();
  expect(result).toMatchObject({ team1_goals: 2, team2_goals: 1, winner_side: 1 });

  const stats = unwrap(await admin.from("match_stats").select("player_id, is_mvp").eq("match_id", matchId), "stats");
  expect(stats).toHaveLength(4);
  expect(stats.find((s) => s.is_mvp)?.player_id).toBe(playerIdByUser.get(players[0]!.id));

  const skills = unwrap(
    await admin.from("openskill_ratings").select("player_id, matches_played").in("player_id", [...playerIdByUser.values()]),
    "openskill",
  );
  expect(skills).toHaveLength(4);
  expect(skills.every((s) => s.matches_played === 1)).toBe(true);

  const badges = unwrap(
    await admin.from("player_badges").select("player_id").eq("badge_code", "first_match").in("player_id", [...playerIdByUser.values()]),
    "badges",
  );
  expect(badges).toHaveLength(4);

  const notes = unwrap(
    await admin.from("notifications").select("user_id").eq("kind", "match_finalized").eq("group_id", groupId),
    "notifications",
  );
  expect(new Set(notes.map((n) => n.user_id)).size).toBe(4);
});

test("the matches list shows the final score", async ({ page }) => {
  await loginViaUi(page, owner, `/g/${groupId}/partidos`);
  await expect(page.getByText(/Blancos\s+2 - 1\s+Negros/)).toBeVisible();
});

test("a score-only match finalizes and the admin assigns the goals later", async ({ request }) => {
  const pid = (u: TestUser) => playerIdByUser.get(u.id)!;
  const secondMatchId = unwrap(
    await ownerDb.rpc("create_match", { p_group_id: groupId, p_scheduled_at: new Date().toISOString(), p_team_size: 5 }),
    "create_match",
  );
  run(
    await ownerDb.rpc("set_match_lineup", {
      p_match_id: secondMatchId,
      p_team1: { name: "Blancos", players: [{ player_id: pid(owner) }, { player_id: pid(players[0]!) }] },
      p_team2: { name: "Negros", players: [{ player_id: pid(players[1]!) }, { player_id: pid(players[2]!) }] },
      p_spectators: [],
    }),
    "set_match_lineup",
  );
  run(await ownerDb.rpc("start_reporting", { p_match_id: secondMatchId }), "start_reporting");
  run(await ownerDb.rpc("submit_score_report", { p_match_id: secondMatchId, p_team1_goals: 1, p_team2_goals: 0 }), "score 1");
  const side2 = await userClient(players[1]!);
  run(await side2.rpc("submit_score_report", { p_match_id: secondMatchId, p_team1_goals: 1, p_team2_goals: 0 }), "score 2");
  run(await ownerDb.rpc("request_finalize", { p_match_id: secondMatchId }), "request_finalize");

  const response = await request.post("/api/cron/finalize", { headers: { Authorization: `Bearer ${env.cronSecret}` } });
  expect(response.status()).toBe(200);

  const admin = adminClient();
  const { data: match } = await admin.from("matches").select("status").eq("id", secondMatchId).single();
  expect(match?.status).toBe("finalized");

  // Too many goals for the score is rejected; assigning the one goal works.
  const tooMany = await ownerDb.rpc("amend_match_stats", {
    p_match_id: secondMatchId,
    p_stats: [{ subject_player_id: pid(players[0]!), goals: 2 }],
  });
  expect(tooMany.error?.message).toContain("more attributed goals than its score");
  run(
    await ownerDb.rpc("amend_match_stats", { p_match_id: secondMatchId, p_stats: [{ subject_player_id: pid(players[0]!), goals: 1 }] }),
    "amend_match_stats",
  );
  const { data: scorer } = await admin
    .from("match_stats")
    .select("goals")
    .eq("match_id", secondMatchId)
    .eq("player_id", pid(players[0]!))
    .single();
  expect(scorer?.goals).toBe(1);
});
