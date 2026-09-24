import { existsSync } from "node:fs";

// Playwright doesn't read .env.local the way Next does; load it once for the test process.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`e2e: missing env var ${name} (see .env.example)`);
  return value;
}

export const env = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
  publishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  secretKey: required("SUPABASE_SECRET_KEY"),
  cronSecret: required("CRON_SECRET"),
  password: required("E2E_USER_PASSWORD"),
  baseUrl: process.env.E2E_BASE_URL ?? "http://localhost:3000",
};
