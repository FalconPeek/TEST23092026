import { execFileSync } from "node:child_process";

// service_role deliberately can't delete groups, and players.created_by blocks deleting users
// first, so e2e data is removed with SQL against the LOCAL stack only (groups cascade to
// players/matches/tournaments, then the users). Never runs against a remote E2E_BASE_URL.
export default function globalTeardown(): void {
  if (process.env.E2E_BASE_URL || process.env.E2E_KEEP_DATA) return;
  const sql = [
    "delete from public.groups where name like 'E2E %';",
    "delete from auth.users where email like 'e2e-%@example.test';",
  ].join(" ");
  try {
    execFileSync("docker", ["exec", "supabase_db_picado", "psql", "-U", "postgres", "-qtAc", sql], { stdio: "ignore" });
  } catch {
    // Local stack not reachable via docker: leftovers are cleared by `npm run db:reset`.
  }
}
