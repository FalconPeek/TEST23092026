@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Picado

Mobile-first PWA for real-football (fútbol 5/7/11) competitions among friends. UI language: **Spanish (Argentina, voseo)**; code, identifiers and comments: **English**.

Features: OAuth login · groups with invite links and roles · FC 26-style player cards driven by peer votes · post-match stat reports with automatic reconciliation · post-match peer/spectator ratings that continuously update attributes · OpenSkill "Impacto" rating · tournaments in 5 formats with automatic brackets and advancement · personal dashboard, leaderboards, match history, badges · web push · realtime brackets · shareable card images.

Out of scope for v1: EA FC video-game mode (v2: a separate match `kind`, must never affect real-football cards).

## Commands

```bash
npm run dev          # Next dev server (Turbopack) on http://localhost:3000
npm run build        # production build (also type-checks)
npm run lint         # eslint . (flat config; `next lint` no longer exists)
npm run typecheck    # tsc --noEmit
npm test             # vitest run (unit: engines, components)
npx vitest run lib/brackets/single-elim.test.ts   # single test file
npx vitest run -t "byes go to top seeds"          # single test by name
npm run test:db      # pgTAP RLS/RPC tests (supabase test db --linked, or local stack if running)
npm run e2e          # Playwright against the dev Supabase project
npm run db:types     # regenerate lib/supabase/database.types.ts from the linked project
npx supabase migration new <name>   # new migration in supabase/migrations
npx supabase db push                # apply migrations to the linked dev project
```

Before declaring any task done: `npm run lint && npm run typecheck && npm test` must pass; if you touched SQL also `npm run test:db`; if you touched routes/config also `npm run build`.

## Stack

- Next.js 16 (App Router, Server Components, Server Actions, Turbopack). Middleware file is **`proxy.ts`** (exports `proxy`), Node runtime. `cookies()`, `headers()`, `params`, `searchParams` are async.
- React 19, **TypeScript ^5.9** (do NOT upgrade to TS 7: breaks `next build` type-check).
- Tailwind CSS 4 (CSS-first config in `app/globals.css` via `@theme`; no tailwind.config.js), shadcn/ui (components in `components/ui`), `tw-animate-css`.
- Supabase: `@supabase/ssr` + `@supabase/supabase-js`. Keys: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (sb_publishable_…), `SUPABASE_SECRET_KEY` (sb_secret_…, server only, bypasses RLS).
- zod 4 (all input validation + settings schemas), Recharts 3 (radar/line charts), `openskill` (Plackett-Luce), `web-push` + Serwist (Turbopack) for PWA/push, `next/og` for card images.
- Tests: Vitest + Testing Library + jsdom (unit/components), pgTAP + basejump test helpers (DB), Playwright (e2e). ESLint flat config. npm.
- Infra: Supabase cloud (dev project `picado-dev`, prod later), Vercel Hobby. pg_cron for time-window finalization.
- No next-intl (strings live in `messages/es.ts`), no React Query (RSC reads + Server Actions + `revalidatePath`; Supabase Realtime for live views).

## Architecture

```
app/                      routes (paths in Spanish)
  login/  auth/callback/  auth/auth-code-error/
  invitacion/[code]/      join a group by invite link
  yo/                     personal dashboard (progress charts)
  g/[groupId]/            group home feed (pending actions, next matches)
    jugadores/[playerId]/ card + profile + history
    partidos/ partidos/[matchId]/ (report, rate, dispute)
    torneos/ torneos/[tournamentId]/ (bracket, table, fixtures)
    rankings/  ajustes/ (admin settings, members, roles)
  api/og/card/[playerId]/ share-card image (next/og)
components/ui/            shadcn primitives (do not hand-edit beyond theming)
components/<feature>/     feature components (card/, match/, tournament/, charts/ …)
lib/supabase/             client.ts (browser) · server.ts (RSC/actions) · proxy.ts (session refresh) · admin.ts (secret key, server only) · database.types.ts (generated)
lib/brackets/             PURE TS bracket engine (no I/O)
lib/rating/               PURE TS rating engine: attributes.ts, positions.ts, aggregate.ts, form.ts, openskill.ts, tiers.ts
lib/reconcile/            PURE TS stat reconciliation
lib/settings/             zod schemas + defaults for group & tournament settings
lib/actions/              Server Actions ('use server'), one file per domain
messages/es.ts            all UI strings
supabase/migrations/      SQL migrations (schema, RLS, grants, RPCs, cron)
supabase/tests/database/  pgTAP tests
supabase/seed.sql         dev seed data only
e2e/                      Playwright specs
.orchestra/               multi-session coordination (see Team protocol)
```

Principles:
- **Pure engines are the source of truth** (`lib/brackets`, `lib/rating`, `lib/reconcile`): deterministic functions, no DB/network, injectable RNG (seeded) and clock, exhaustive unit tests. Server code loads rows → calls engine → persists results.
- **The client is never trusted.** Reads may go through RLS with the user's session. Every write goes through either (a) a Server Action that validates with zod, re-checks authorization server-side, and calls a SECURITY DEFINER RPC, or (b) the RPC directly. Derived data (ratings, stats, standings, advancement) is only ever written server-side.
- Finalization (match close → reconcile → ratings → OpenSkill → badges → bracket advance → notifications) runs in `lib/actions/finalize.ts` with the admin client, triggered manually by organizer or by pg_cron (calls `private.close_expired_windows()` which marks matches `pending_finalize`; a route handler `app/api/cron/finalize` secured with `CRON_SECRET` processes them).
- Bracket advancement mutations happen in **one SQL transaction** (RPC `confirm_match_result`) so the bracket can never be half-advanced.

## Data model (public schema unless noted; all tables RLS-enabled)

- `profiles(id = auth.users.id, display_name, avatar_url, created_at)`
- `groups(id, name, slug, owner_id, settings jsonb, created_at)` — settings validated by `lib/settings/group.ts`
- `group_members(group_id, user_id, role: owner|admin|member|spectator, joined_at)` PK(group_id,user_id)
- `invites(id, group_id, code unique, role default member, created_by, expires_at, max_uses, uses)`
- `players(id, group_id, user_id nullable, display_name, avatar_url, is_guest, claimed_at, primary_position, alt_positions text[], preferred_foot left|right|both, height_cm, created_at)` — a person's identity *within a group*; guests have `user_id null`
- `scouting_votes(id, group_id, rater_player_id, target_player_id, attribute, value 1–10, mode quick|detailed, created_at)` — one current ballot per (rater,target,attribute); history kept via `superseded_at`
- `playstyle_votes(rater_player_id, target_player_id, playstyle, created_at)`, `star_votes(rater, target, kind weak_foot|skill_moves, value 1–5)`
- `matches(id, group_id, tournament_match_id nullable, kind 'real', team_size, scheduled_at, played_at, venue, status scheduled|reporting|disputed|pending_finalize|finalized|cancelled, report_deadline, rating_deadline, created_by)`
- `match_teams(id, match_id, side 1|2, name, color)`
- `match_participants(match_id, player_id, team_id nullable, role player|spectator, position)` — spectators have `team_id null`
- `score_reports(match_id, reporter_player_id, team1_goals, team2_goals, created_at)`
- `stat_reports(match_id, reporter_player_id, subject_player_id, goals, assists, own_goals, saves, created_at)`
- `match_ratings(match_id, rater_player_id, target_player_id, rating 1–10, standout_attributes text[] ≤2, rater_role, created_at)`
- Derived (select-only for clients): `match_results(match_id, team1_goals, team2_goals, pens1, pens2, decided_by, winner_side)`, `match_stats(match_id, player_id, goals, assists, own_goals, saves, clean_sheet, is_mvp, median_rating)`, `attribute_ratings(player_id, attribute, value 1–99, n_votes, n_raters, updated_at)`, `player_cards(player_id, ovr, position, tier, is_provisional, face stats…, weak_foot, skill_moves, playstyles jsonb)`, `attribute_history(player_id, snapshot_at, ovr, attrs jsonb)`, `openskill_ratings(player_id, mu, sigma, ordinal, matches_played)`, `rater_stats(player_id, bias, reliability, n_votes)`, `standings(stage_id, entry_id, …)`
- Tournaments: `tournaments(id, group_id, name, format league|single_elim|double_elim|groups_ko|swiss, entry_mode teams|individual, team_size, status draft|registration|in_progress|finished, settings jsonb, organizer_id)`, `tournament_entries(id, tournament_id, name, seed, player_ids uuid[])` (a team), `tournament_registrations(tournament_id, player_id)` (individual sign-up), `stages(id, tournament_id, kind, order, settings jsonb)`, `stage_groups(id, stage_id, number, label)`, `tournament_matches(id, stage_id, stage_group_id, bracket winners|losers|final|third|group|swiss, round, number, entry1_id, entry2_id, status locked|waiting|ready|in_progress|completed|archived, winner_entry_id, loser_entry_id, score1, score2, pens1, pens2, decided_by regular|pens|walkover|bye|manual, next_match_id, next_slot, next_loser_match_id, next_loser_slot, match_id)`
- Engagement: `badges(code, name, description, icon)`, `player_badges(player_id, badge_code, awarded_at, match_id)`, `push_subscriptions(user_id, endpoint, p256dh, auth)`, `notifications(id, user_id, kind, payload, read_at)`
- `private` schema (not exposed): SECURITY DEFINER helpers `private.is_member(group_id)`, `private.member_role(group_id)`, `private.my_player_id(group_id)`, `private.is_group_admin(group_id)`, `private.shared_match(p1, p2)`.

## Rating system (see `lib/rating/`, params in group settings `rating.*`)

**Attributes** (keys in English, labels in `messages/es.ts`):
- Outfield sub-attributes (29): `acceleration, sprint_speed` | `positioning, finishing, shot_power, long_shots, volleys, penalties` | `vision, crossing, free_kick, short_passing, long_passing, curve` | `agility, balance, reactions, ball_control, dribbling, composure` | `interceptions, heading, def_awareness, standing_tackle, sliding_tackle` | `jumping, stamina, strength, aggression`
- GK (5): `gk_diving, gk_handling, gk_kicking, gk_reflexes, gk_positioning`
- Face stats (FC 26 weights): PAC(RIT)=.55 sprint_speed+.45 acceleration · SHO(TIR)=.45 finishing+.20 shot_power+.20 long_shots+.05 positioning+.05 volleys+.05 penalties · PAS=.35 short_passing+.20 vision+.20 crossing+.15 long_passing+.05 curve+.05 free_kick · DRI(REG)=.50 dribbling+.35 ball_control+.10 agility+.05 balance · DEF=.30 def_awareness+.30 standing_tackle+.20 interceptions+.10 heading+.10 sliding_tackle · PHY(FIS)=.50 strength+.25 stamina+.20 aggression+.05 jumping. GK card: DIV/HAN/KIC/REF/POS = gk_*; SPD = PAC.
- Positions (15): POR, LI, DFC, LD, CAI, CAD, MCD, MC, MCO, MI, MD, EI, ED, SD, DC. OVR(pos) = round(Σ w_pos,attr · attr) with rows summing to 1 (FIFA reverse-engineered weights, `lib/rating/positions.ts`). Card shows OVR at primary position.
- Extras: weak foot ★1–5 and skill moves ★1–5 (median of votes), preferred foot, PlayStyles (tag votes; shown if ≥40% of raters; "+" if ≥70% and ≥5 raters).
- Tiers: bronze <65, silver 65–74, gold ≥75, special when OVR ≥85 or MVP in last match (configurable). Provisional (grey) until `min_raters` (3) distinct raters.

**Aggregation** per (player, sub-attribute):
1. Inputs: scouting votes (quick mode: face-stat vote expands to all its sub-attributes; detailed: per sub-attribute), each 1–10 → `s = 30 + 6.5·x`.
2. Rater bias: `s' = s − b_r` where `b_r` = rater's mean residual vs consensus, only when rater has ≥ `bias_min_votes` (10) votes.
3. Outliers: if n ≥ 5, drop `|s' − median| > 2.5 · 1.4826 · MAD` (skip if MAD = 0).
4. Weight: `w = 0.5^(age_days / 90) · reliability_r · role_w` with reliability = clamp(1/(1+(RMSE_r/σ_group)²), 0.5, 1.5), role_w = 1 (player) or `spectator_weight` (0.75); collusion-flagged pairs ×0.5; cap any single rater at 20% of total weight (iterative redistribution).
5. `R = Σw·s'/Σw`, `n_eff = (Σw)²/Σw²`; shrink: `base = (n_eff·R + m·C)/(n_eff + m)`, m = 3, C = group mean for that attribute (default 60).
6. Form from match ratings (participants + spectators, 1–10, window 72 h): per match M = weighted median rating (min 3 raters); `f = clamp(0.5·(M − 6.5), −1, 1)` applied to the position's primary attributes (top-weighted attrs of primary position) and doubled on "standout" tagged attributes; `F = Σ 0.5^(age/30d) · f`, clamp |F| ≤ 3.
7. `value = clamp(round(base + F), 1, 99)`, then rate-limit vs previous snapshot: ±2 per finalized match, ±4 per rolling 30 days.
- Collusion: pair (A→B) flagged if A's mean residual on B > 2σ above A's overall mean residual AND reciprocal (B→A) also inflated.
- **OpenSkill** (Plackett-Luce, default μ=25, σ=25/3) updated on each finalized match with teams as ranked groups (draw = tie). Displayed "Impacto" = μ − 3σ mapped to 1–99 via group percentile. Team balancing: snake draft on μ, tie-break OVR, then local swap search minimizing |Σμ₁ − Σμ₂|.

## Match flow & stat reconciliation (`lib/reconcile/`)

`scheduled` → (played) `reporting` → `pending_finalize` → `finalized` (or `disputed` → organizer resolves → `pending_finalize`).
- Stats: goals, assists, own_goals, saves; derived: clean_sheet (team conceded 0, credited to players who played), MVP (highest median rating, ties → more goals+assists → OpenSkill).
- Rule A: (1) **Score first** — at least one reporter from each side; all score reports must agree, otherwise `disputed`. (2) Per player per stat: median of all reports about that player (the subject's own report counts once); a lone self-report is accepted. (3) Consistency: Σ goals(team) + Σ own_goals(opponent) must equal team score and Σ assists(team) ≤ team goals; if violated, drop least-supported claims (fewest reporters) until consistent; if still inconsistent → `disputed`. (4) Report window 48 h, rating window 72 h (configurable); on expiry pg_cron marks `pending_finalize`.
- Organizer / group admin can resolve disputes by entering authoritative values (logged in `match_audit`).

## Tournaments (`lib/brackets/`)

- Formats: `league` (single/double round robin, Berger circle method, BYE for odd counts, home/away balance), `single_elim` (recursive seed order 1v16, 8v9 …; byes to top seeds auto-advanced; optional 3rd place), `double_elim` (LB of 2(k−1) rounds, drop order alternates reverse / half-shift to avoid early rematches; grand final with optional reset), `groups_ko` (snake seeding into groups, top N advance, crossover A1vB2 / B1vA2, same-group teams in opposite halves), `swiss` (rounds = ceil(log2 n) default; pair within score groups top-half vs bottom-half, avoid rematches with backtracking; bye to lowest-ranked without previous bye = win; tiebreak Buchholz, Sonneborn-Berger, H2H).
- Engine API (pure): `generate(format, entries, settings, rng) → {stages, groups, matches}`, `applyResult(state, matchId, result) → state` (advancement incl. BYE cascades and GF reset), `standings(matches, settings) → rows`, `nextSwissRound(state, rng)`, `canEditResult(state, matchId)`.
- Seeding: default by team average OVR (desc), organizer can reorder. Individual entry mode: registrations → balanced teams (see OpenSkill balancing) → entries.
- Scoring: points win/draw/loss default 3/1/0; tiebreaker order configurable array, default `['points','goal_diff','goals_for','head_to_head','lots']` (H2H recomputed on the tied subset). KO draws: `penalties` default (stored as pens1/pens2, never counted as goals); alternatives `extra_time_then_penalties`, `manual`.
- Advancement happens only when a tournament match's linked real match is finalized (or organizer confirms), inside RPC `confirm_match_result`. Editing a result is allowed only if no downstream match has started; downstream matches are reset and re-propagated.

## Settings ("everything configurable")

All tunables live in zod schemas with defaults: `lib/settings/group.ts` (rating params, spectator_weight, windows, min_raters, tiers, badges on/off) and `lib/settings/tournament.ts` (format options, points, tiebreakers, draw resolution, third place, GF reset, group count, qualifiers, swiss rounds). Stored as `jsonb`; always parsed with `.parse()` (defaults applied) on read. Never hard-code a tunable elsewhere.

## Security rules (non-negotiable)

- Every table: `enable row level security` + **explicit GRANTs** (new Supabase projects don't auto-expose tables) + one policy per operation (`select`/`insert`/`update`/`delete`), `to authenticated`, `(select auth.uid())` wrapped, index on every column used in policies. No `for all` policies. anon gets nothing except what's explicitly needed (nothing, currently).
- Derived tables: `grant select` only; no insert/update/delete grants for `authenticated`. Written by SECURITY DEFINER functions or the admin client.
- Vote/rating/report tables: no direct insert grants; writes only via RPCs (`submit_scouting_vote`, `submit_match_rating`, `submit_score_report`, `submit_stat_report`, …) that check membership, role, participation, windows, no-self-rating, value ranges.
- Votes are anonymous: select policy on vote tables = own rows only. Aggregates exposed via derived tables with counts.
- SECURITY DEFINER functions: `set search_path = ''`, fully-qualified names, `revoke execute … from public, anon`, grant to `authenticated` only where meant to be called by users. Helpers live in `private` schema.
- Views: `with (security_invoker = true)`.
- Server: `lib/supabase/admin.ts` imports `server-only`; secret key never in client bundles or `NEXT_PUBLIC_*`. Authorization uses `supabase.auth.getClaims()` (never `getSession()` user data). Open-redirect guard on `next` param.
- Every Server Action: zod-parse input → check auth → check permission → call RPC → `revalidatePath`. Return typed `{ ok: true, data } | { ok: false, error }`; never throw raw DB errors to the client.
- Cron route requires `Authorization: Bearer ${CRON_SECRET}`.

## Coding conventions

- TypeScript strict, no `any` (use `unknown` + zod). Named exports. Files kebab-case, components PascalCase.
- Server Components by default; `'use client'` only for interactivity. Data fetching in RSC via `lib/supabase/server.ts`.
- UI strings only from `messages/es.ts` (voseo: "Votá", "Cargá tus estadísticas"). Dates via `Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })` helpers in `lib/format.ts`.
- Styling: Tailwind + shadcn tokens; dark theme default; mobile-first (design at 375px, then `sm:`/`md:`); bottom nav on mobile. FUT card look: shield clip-path, tier gradients (bronze/silver/gold/special).
- SQL: snake_case, one concern per migration, timestamps `timestamptz default now()`, uuid PKs `default gen_random_uuid()`, FKs with `on delete cascade` where ownership is clear.
- Tests colocated: `foo.ts` → `foo.test.ts`. Engines need property-style tests (all sizes 2–33) in addition to examples.
- Comments sparse, explain *why*. No dead code, no console.log left behind.
- After any migration: `npm run db:types` and commit the generated types.

## Environment

`.env.local` (never committed; template `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, `VAPID_PUBLIC_KEY`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `E2E_*` test user creds. Windows host: run shell scripts with Git Bash (`bash script.sh`).

## Team protocol (multi-session build)

Three Claude sessions share this directory and coordinate **only through files in `.orchestra/`**:
- **FATHER** (orchestrator): architecture, schema/RLS/RPC, engines, integration; writes tasks, keeps `BOARD.md`, reviews results. Uses subagents in `.claude/agents/` (`db-architect`, `bracket-engine`, `rating-engine`, `ui-builder`).
- **WORKER** (Sonnet): executes one small, well-defined task at a time.
- **VERIFIER** (Opus): reviews and tests each task the Worker finishes.

Files:
- `.orchestra/PLAN.md` — milestones. `.orchestra/BOARD.md` — live task table (FATHER only edits).
- `.orchestra/tasks/T-XXX.md` — frontmatter `id, title, assignee: worker, status, depends_on: [T-…]`, then sections **Context, Steps, Files, Acceptance criteria, How to verify**.
- Status flow: `todo` → `in_progress` (Worker) → `done` (Worker) → `verified` | `rejected` (Verifier). On `rejected`, FATHER writes a new fix task (`depends_on` the rejected one is NOT used; it references it in Context).
- `.orchestra/reports/T-XXX.worker.md` (what changed, commands run + results) and `.orchestra/reports/T-XXX.verify.md` (**first line exactly `RESULT: PASS` or `RESULT: FAIL`**, then reasons).
- `bash .orchestra/wait-for-task.sh <status[,status2]> [assignee] [--timeout S] [--seen FILE]` — polls `tasks/` every 15 s, prints the first matching task path and exits 0; for `todo` it only returns tasks whose `depends_on` are all `verified`; exits 1 on timeout (default 540 s → just call it again), exits 2 if `.orchestra/DONE` exists.
- **Pause / handoff**: when `.orchestra/PAUSE` exists (e.g. the user must restart the PC), `wait-for-task.sh` exits 3. Each session then finishes or cleanly abandons its current step, writes `.orchestra/handoff/<FATHER|WORKER|VERIFIER>.md` (current task id + status, what's done, what's half-done, exact next step, gotchas), and stops. **On every (re)start, a session first reads its own handoff file if it exists**, then continues. Only FATHER creates/removes `PAUSE`. A task left `in_progress` stays assigned to the Worker, which resumes it after restart.
- Rules: one `in_progress` task per Worker; a session edits only the files declared in its task's **Files** section; never edit files declared by another in-flight task; nobody but FATHER edits `CLAUDE.md`, `PLAN.md`, `BOARD.md`, task files' bodies (Worker/Verifier only change the `status:` line). When everything is complete FATHER writes `.orchestra/DONE`.
