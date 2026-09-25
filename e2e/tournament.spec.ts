import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";
import { createTestUser, loginViaUi, userClient, type TestUser } from "./support/users";

// Single-elimination happy path: the admin creates the tournament and generates the bracket in the
// UI, results go through confirm_match_result (the bracket advances in SQL), and the champion
// banner shows only once the tournament is finished.
test.describe.configure({ mode: "serial" });

type Db = SupabaseClient<Database>;

let owner: TestUser;
let others: TestUser[];
let ownerDb: Db;
let groupId: string;
let tournamentId: string;
const playerIdByUser = new Map<string, string>();

function run(result: { error: { message: string } | null }, what: string): void {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
}

test.beforeAll(async () => {
  owner = await createTestUser("organizer");
  others = await Promise.all(["alfa", "beta", "gamma"].map((label) => createTestUser(label)));
  ownerDb = await userClient(owner);

  const group = await ownerDb.rpc("create_group", { p_name: `E2E Torneo ${owner.name}` });
  run(group, "create_group");
  groupId = group.data!;
  const invite = await ownerDb.rpc("create_invite", { p_group_id: groupId, p_role: "member" });
  run(invite, "create_invite");
  for (const user of others) run(await (await userClient(user)).rpc("accept_invite", { p_code: invite.data![0]!.code }), "accept_invite");

  const players = await ownerDb.from("players").select("id, user_id").eq("group_id", groupId);
  run(players, "players");
  for (const row of players.data!) if (row.user_id) playerIdByUser.set(row.user_id, row.id);
});

test("the admin creates a single-elimination tournament from the UI", async ({ page }) => {
  await loginViaUi(page, owner, `/g/${groupId}/torneos/nuevo`);
  await page.locator("#tournament-name").fill("E2E Copa");
  await page.getByRole("radio", { name: "Eliminación directa" }).click();
  await page.getByRole("button", { name: "Nuevo torneo" }).click();

  await page.waitForURL(/\/torneos\/[0-9a-f-]{36}$/);
  tournamentId = page.url().split("/").pop()!;
});

test("teams are set and the admin generates the fixture from the UI", async ({ page }) => {
  const everyone = [owner, ...others];
  run(
    await ownerDb.rpc("save_tournament_entries", {
      p_tournament_id: tournamentId,
      p_entries: everyone.map((u, i) => ({ name: `Equipo ${i + 1}`, seed: i + 1, player_ids: [playerIdByUser.get(u.id)!] })),
    }),
    "save_tournament_entries",
  );

  await loginViaUi(page, owner, `/g/${groupId}/torneos/${tournamentId}`);
  await page.getByRole("button", { name: "Generar fixture" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("¡Fixture generado!")).toBeVisible();

  const { data: matches } = await ownerDb.from("tournament_matches").select("id").eq("tournament_id", tournamentId);
  expect(matches).toHaveLength(3); // 2 semifinals + final
});

test("results advance the bracket and the champion shows once finished", async ({ page }) => {
  const byRound = async (round: number) => {
    const { data } = await ownerDb
      .from("tournament_matches")
      .select("id, entry1_id, entry2_id, status")
      .eq("tournament_id", tournamentId)
      .eq("round", round)
      .order("number");
    return data ?? [];
  };

  for (const semi of await byRound(1)) {
    run(await ownerDb.rpc("confirm_match_result", { p_tournament_match_id: semi.id, p_score1: 2, p_score2: 0 }), "semi");
  }
  const [final] = await byRound(2);
  expect(final?.status).toBe("ready");
  expect(final?.entry1_id).not.toBeNull();
  expect(final?.entry2_id).not.toBeNull();

  // Before finishing, the bracket must not crown anyone.
  run(await ownerDb.rpc("confirm_match_result", { p_tournament_match_id: final!.id, p_score1: 3, p_score2: 1 }), "final");
  await loginViaUi(page, owner, `/g/${groupId}/torneos/${tournamentId}/llave`);
  await expect(page.getByText("¡Campeón!")).toHaveCount(0);

  await page.goto(`/g/${groupId}/torneos/${tournamentId}`);
  await page.getByRole("button", { name: "Terminar torneo" }).click();
  const confirm = page.getByRole("dialog").getByRole("button", { name: "Confirmar" });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect
    .poll(async () => (await ownerDb.from("tournaments").select("status").eq("id", tournamentId).single()).data?.status)
    .toBe("finished");

  await page.goto(`/g/${groupId}/torneos/${tournamentId}/llave`);
  await expect(page.getByText("¡Campeón!")).toBeVisible();
  const { data: winner } = await ownerDb.from("tournament_matches").select("winner_entry_id").eq("id", final!.id).single();
  const { data: entry } = await ownerDb.from("tournament_entries").select("name").eq("id", winner!.winner_entry_id!).single();
  await expect(page.getByText(entry!.name).first()).toBeVisible();
});
