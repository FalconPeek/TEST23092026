import { expect, test } from "@playwright/test";
import { createTestUser, loginViaUi, type TestUser } from "./support/users";

// Happy path: sign in → create a group → create an invite → a second user joins through the link.
test.describe.configure({ mode: "serial" });

let owner: TestUser;
let member: TestUser;
let groupId: string;
let inviteCode: string;

test.beforeAll(async () => {
  owner = await createTestUser("owner");
  member = await createTestUser("member");
});

test("owner creates a group", async ({ page }) => {
  await loginViaUi(page, owner);
  await expect(page).toHaveURL(/\/g$/);

  await page.getByRole("button", { name: "Crear grupo" }).click();
  await page.getByLabel("Nombre del grupo").fill(`E2E Grupo ${owner.name}`);
  await page.getByRole("button", { name: "Guardar" }).click();

  await page.waitForURL(/\/g\/[0-9a-f-]{36}$/);
  groupId = page.url().split("/").pop()!;
  await expect(page.getByText(`E2E Grupo ${owner.name}`).first()).toBeVisible();
});

test("owner creates an invite link", async ({ page }) => {
  await loginViaUi(page, owner, `/g/${groupId}/ajustes`);
  await page.getByRole("button", { name: "Crear invitación" }).click();

  // Read the link shown after creation (the clipboard isn't available headless).
  const link = page.getByText(/\/invitacion\/[A-Za-z0-9_-]{6,32}$/).first();
  await expect(link).toBeVisible();
  inviteCode = (await link.textContent())!.trim().split("/").pop()!;
});

test("a new user joins through the invite link", async ({ page }) => {
  await page.goto(`/invitacion/${inviteCode}`);
  await page.getByRole("link", { name: "Entrá para unirte" }).click();
  await expect(page).toHaveURL(/\/login\?next=/);

  await loginViaUi(page, member, `/invitacion/${inviteCode}`);
  await expect(page).toHaveURL(new RegExp(`/invitacion/${inviteCode}$`));
  await expect(page.getByText(`E2E Grupo ${owner.name}`)).toBeVisible();

  await page.getByRole("button", { name: "Unirme" }).click();
  await page.waitForURL(new RegExp(`/g/${groupId}$`));
});

test("the owner sees the new member in the admin page", async ({ page }) => {
  await loginViaUi(page, owner, `/g/${groupId}/ajustes`);
  await expect(page.getByText(member.name).first()).toBeVisible();
});
