import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";
import { createTestUser, loginViaUi, userClient, type TestUser } from "./support/users";

// M7 happy path: a member builds a squad on the pitch, publishes it, another member likes it,
// and the public share image renders.
test.describe.configure({ mode: "serial" });

let owner: TestUser;
let builder: TestUser;
let fan: TestUser;
let groupId: string;
let squadId: string;

function run(result: { error: { message: string } | null }, what: string): void {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
}

test.beforeAll(async () => {
  owner = await createTestUser("dueno");
  builder = await createTestUser("armador");
  fan = await createTestUser("hincha");
  const ownerDb: SupabaseClient<Database> = await userClient(owner);

  const group = await ownerDb.rpc("create_group", { p_name: `E2E Plantillas ${owner.name}` });
  run(group, "create_group");
  groupId = group.data!;
  const invite = await ownerDb.rpc("create_invite", { p_group_id: groupId, p_role: "member" });
  run(invite, "create_invite");
  for (const user of [builder, fan]) {
    run(await (await userClient(user)).rpc("accept_invite", { p_code: invite.data![0]!.code }), "accept_invite");
  }
});

test("a member builds a squad on the pitch and publishes it", async ({ page }) => {
  await loginViaUi(page, builder, `/g/${groupId}/plantillas/nueva`);
  await page.locator("#squad-name").fill("E2E Titulares");

  // Default 5-a-side formation: put the owner in goal and the fan in another slot.
  await page.getByRole("button", { name: "Vacío POR" }).click();
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(owner.name) }).click();
  await expect(page.getByRole("button", { name: owner.name })).toBeVisible();

  const emptySlots = page.getByRole("button", { name: /^Vacío (?!POR)/ });
  await emptySlots.first().click();
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(fan.name) }).click();
  await expect(page.getByRole("button", { name: fan.name })).toBeVisible();

  await page.getByRole("button", { name: "Guardar" }).click();
  await page.waitForURL(/\/plantillas\/[0-9a-f-]{36}$/);
  squadId = page.url().split("/").pop()!;

  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByRole("button", { name: "Dejar de publicar" })).toBeVisible();
});

test("another member likes it from the group list", async ({ page }) => {
  await loginViaUi(page, fan, `/g/${groupId}/plantillas`);
  await expect(page.getByText("E2E Titulares").first()).toBeVisible();
  await page.getByRole("button", { name: /Me gusta/ }).first().click();
  await expect(page.getByText("1 me gusta").first()).toBeVisible();
});

test("the published squad has a public share image", async ({ request }) => {
  const response = await request.get(`/api/og/squad/${squadId}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
});
