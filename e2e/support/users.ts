import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import type { Database } from "../../lib/supabase/database.types";
import { env } from "./env";

// Every e2e run tags its data with this prefix so cleanup never touches real/dev rows.
export const E2E_PREFIX = "e2e-";

export type TestUser = { id: string; email: string; name: string };

export function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(env.supabaseUrl, env.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createTestUser(label: string): Promise<TestUser> {
  const run = randomUUID().slice(0, 8);
  const email = `${E2E_PREFIX}${label}-${run}@example.test`;
  const name = `${label[0]!.toUpperCase()}${label.slice(1)} ${run.slice(0, 4)}`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: env.password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error || !data.user) throw new Error(`createTestUser: ${error?.message}`);
  return { id: data.user.id, email, name };
}

/** A signed-in API client for driving RPCs as a given user (setup steps the UI test doesn't cover). */
export async function userClient(user: TestUser): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(env.supabaseUrl, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: env.password });
  if (error) throw new Error(`userClient(${user.email}): ${error.message}`);
  return client;
}

export async function loginViaUi(page: Page, user: TestUser, next = "/g"): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByRole("tab", { name: "Contraseña" }).click();
  await page.locator("#password-email").fill(user.email);
  await page.locator("#password").fill(env.password);
  await page.getByRole("button", { name: "Entrar con contraseña" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}
