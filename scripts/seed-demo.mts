// Demo data for manual testing on the LOCAL stack: 10 players in one group, scouting votes that
// reflect a hidden "true" skill per player, and 3 finalized friendlies. Everything goes through the
// same RPCs the app uses, then the cron route finalizes the matches and recomputes the cards.
//
//   npm run dev            (in another terminal: the cron route runs inside Next)
//   npm run seed:demo
//
// Sign in at /login → "Contraseña" with demo01@picado.test … demo10@picado.test and the
// password in DEMO_PASSWORD (default "picado-demo"). Re-running is refused if the group exists;
// `npm run db:reset` wipes everything.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types.ts";

if (process.env.NODE_ENV === "production") throw new Error("seed-demo is for local development only");
process.loadEnvFile(".env.local");

type Db = SupabaseClient<Database>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;
const cronSecret = process.env.CRON_SECRET!;
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const password = process.env.DEMO_PASSWORD ?? "picado-demo";
const GROUP_NAME = "Los del Jueves (demo)";

if (!url.includes("127.0.0.1") && !url.includes("localhost")) {
  throw new Error(`seed-demo refuses to run against a non-local Supabase URL (${url})`);
}

// Deterministic PRNG so every seed looks the same.
let state = 20260924;
function rand(): number {
  state = (state * 1664525 + 1013904223) % 2 ** 32;
  return state / 2 ** 32;
}
const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const PEOPLE = [
  { name: "Lucho Fernández", position: "DC", skill: 8 },
  { name: "Tomi Rodríguez", position: "MC", skill: 7 },
  { name: "Nacho Gómez", position: "DFC", skill: 6 },
  { name: "Fede Martínez", position: "POR", skill: 7 },
  { name: "Juanma López", position: "EI", skill: 6 },
  { name: "Santi Díaz", position: "ED", skill: 5 },
  { name: "Mati Pérez", position: "MCD", skill: 6 },
  { name: "Gonza Romero", position: "LI", skill: 4 },
  { name: "Pablo Sosa", position: "MCO", skill: 7 },
  { name: "Rodri Álvarez", position: "LD", skill: 5 },
] as const;

type Person = { email: string; name: string; position: string; skill: number; userId: string; playerId: string; db: Db };

function check(result: { error: { message: string } | null }, what: string): void {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
}

async function signIn(email: string): Promise<Db> {
  const db = createClient<Database>(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  check(await db.auth.signInWithPassword({ email, password }), `sign in ${email}`);
  return db;
}

async function main(): Promise<void> {
  const admin = createClient<Database>(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: existing } = await admin.from("groups").select("id").eq("name", GROUP_NAME).maybeSingle();
  if (existing) {
    console.log(`"${GROUP_NAME}" already exists (${existing.id}). Run \`npm run db:reset\` first to reseed.`);
    return;
  }

  // 1. Users (reuse the auth user if a previous partial run created it).
  const people: Omit<Person, "playerId">[] = [];
  const { data: userList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const [i, p] of PEOPLE.entries()) {
    const email = `demo${String(i + 1).padStart(2, "0")}@picado.test`;
    let userId = userList?.users.find((u) => u.email === email)?.id;
    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: p.name },
      });
      if (error || !data.user) throw new Error(`create ${email}: ${error?.message}`);
      userId = data.user.id;
    }
    people.push({ email, name: p.name, position: p.position, skill: p.skill, userId, db: await signIn(email) });
  }

  // 2. Group + members (the first person owns it).
  const owner = people[0]!;
  const { data: groupId, error: groupError } = await owner.db.rpc("create_group", { p_name: GROUP_NAME });
  if (groupError || !groupId) throw new Error(`create_group: ${groupError?.message}`);
  const { data: invites, error: inviteError } = await owner.db.rpc("create_invite", { p_group_id: groupId, p_role: "member", p_max_uses: 50 });
  if (inviteError || !invites?.[0]) throw new Error(`create_invite: ${inviteError?.message}`);
  for (const p of people.slice(1)) check(await p.db.rpc("accept_invite", { p_code: invites[0].code }), `join ${p.email}`);

  const { data: playerRows } = await admin.from("players").select("id, user_id").eq("group_id", groupId);
  const byUser = new Map((playerRows ?? []).map((r) => [r.user_id, r.id]));
  const all: Person[] = people.map((p) => ({ ...p, playerId: byUser.get(p.userId)! }));
  for (const p of all) {
    check(
      await p.db.rpc("update_my_player", { p_group_id: groupId, p_display_name: p.name, p_primary_position: p.position }),
      `profile ${p.email}`,
    );
  }

  // 3. Three friendlies: 5 v 5, stronger players split by a snake on the hidden skill.
  const sorted = [...all].sort((a, b) => b.skill - a.skill);
  const teams: [Person[], Person[]] = [[], []];
  sorted.forEach((p, i) => teams[[0, 1, 1, 0][i % 4]!]!.push(p));

  for (let m = 0; m < 3; m++) {
    const when = new Date(Date.now() - (21 - m * 7) * 24 * 3600 * 1000).toISOString();
    const { data: matchId, error } = await owner.db.rpc("create_match", {
      p_group_id: groupId,
      p_scheduled_at: when,
      p_team_size: 5,
      p_venue: "Cancha de Palermo",
    });
    if (error || !matchId) throw new Error(`create_match: ${error?.message}`);

    const [a, b] = m === 1 ? [teams[1], teams[0]] : teams;
    check(
      await owner.db.rpc("set_match_lineup", {
        p_match_id: matchId,
        p_team1: { name: "Blancos", color: "#f5f5f5", players: a.map((p) => ({ player_id: p.playerId, position: p.position })) },
        p_team2: { name: "Negros", color: "#171717", players: b.map((p) => ({ player_id: p.playerId, position: p.position })) },
        p_spectators: [],
      }),
      "set_match_lineup",
    );
    // played_at defaults to now: the report window is measured from it, so it can't be backdated.
    check(await owner.db.rpc("start_reporting", { p_match_id: matchId }), "start_reporting");

    // Goals by skill: a few attributed, one left unattributed in the last match on purpose.
    const goalsFor = (team: Person[]) => team.flatMap((p) => Array.from({ length: rand() < p.skill / 12 ? 1 + Math.floor(rand() * 2) : 0 }, () => p));
    const scorers1 = goalsFor(a);
    const scorers2 = goalsFor(b);
    const score1 = scorers1.length + (m === 2 ? 1 : 0);
    const score2 = scorers2.length;
    const statReports = [...a, ...b].map((p) => ({
      subject_player_id: p.playerId,
      goals: [...scorers1, ...scorers2].filter((s) => s === p).length,
      assists: 0,
      own_goals: 0,
      saves: p.position === "POR" ? 3 + Math.floor(rand() * 5) : 0,
    }));
    for (const reporter of [a[0]!, b[0]!]) {
      check(await reporter.db.rpc("submit_score_report", { p_match_id: matchId, p_team1_goals: score1, p_team2_goals: score2 }), "score");
      check(await reporter.db.rpc("submit_stat_reports", { p_match_id: matchId, p_reports: statReports }), "stats");
    }
    for (const rater of [...a, ...b]) {
      const ratings = [...a, ...b]
        .filter((t) => t !== rater)
        .map((t) => ({
          target_player_id: t.playerId,
          rating: clamp(Math.round(t.skill + (rand() - 0.5) * 3), 1, 10),
          standout_attributes: t.skill >= 7 && rand() < 0.4 ? [pick(["finishing", "vision", "dribbling", "sprint_speed"])] : [],
        }));
      check(await rater.db.rpc("submit_match_ratings", { p_match_id: matchId, p_ratings: ratings }), "ratings");
    }
    check(await owner.db.rpc("request_finalize", { p_match_id: matchId }), "request_finalize");
    console.log(`match ${m + 1}: Blancos ${score1} - ${score2} Negros`);
  }

  // 4. Scouting: everyone votes quick-mode face stats for 5 teammates around their true skill.
  const faceStats = ["pac", "sho", "pas", "dri", "def", "phy"] as const;
  const bias: Record<string, Partial<Record<(typeof faceStats)[number], number>>> = {
    DC: { sho: 2, def: -2 },
    POR: { def: 1, sho: -3, dri: -2 },
    DFC: { def: 2, sho: -2 },
    LI: { def: 1, pac: 1 },
    LD: { def: 1, pac: 1 },
    MCD: { def: 1, pas: 1 },
    MC: { pas: 2 },
    MCO: { pas: 1, dri: 1 },
    EI: { pac: 2, dri: 1 },
    ED: { pac: 2, dri: 1 },
  };
  let ballots = 0;
  for (const rater of all) {
    const targets = all.filter((t) => t !== rater).sort(() => rand() - 0.5).slice(0, 5);
    for (const target of targets) {
      const votes = Object.fromEntries(
        faceStats.map((f) => [f, clamp(Math.round(target.skill + (bias[target.position]?.[f] ?? 0) + (rand() - 0.5) * 2), 1, 10)]),
      );
      const { error } = await rater.db.rpc("submit_scouting_votes", { p_target_player_id: target.playerId, p_mode: "quick", p_votes: votes });
      if (!error) ballots += 1;
    }
  }
  console.log(`scouting ballots: ${ballots}`);

  // 5. Finalize the matches + recompute cards through the cron route (needs `npm run dev`).
  try {
    const response = await fetch(`${siteUrl}/api/cron/finalize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    console.log(`cron: ${response.status} ${await response.text()}`);
  } catch {
    console.log(`Couldn't reach ${siteUrl}. Start \`npm run dev\` and POST /api/cron/finalize with the CRON_SECRET bearer.`);
  }

  console.log(`\nDone. Group: ${siteUrl}/g/${groupId}`);
  console.log(`Sign in with demo01@picado.test … demo10@picado.test / ${password}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
