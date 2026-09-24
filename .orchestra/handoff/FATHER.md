# FATHER handoff — 2026-09-23 (updated mid-M1 UI / M3 schema)

## Read first
`CLAUDE.md`, `.orchestra/PLAN.md`, `.orchestra/BOARD.md`.

## State (older snapshot — see "Status" below for current)
- Local Supabase stack (Docker) for dev (API :54321, DB :54322, Studio :54323, Mailpit :54324); `.env.local` written (local keys, CRON_SECRET, VAPID, E2E_USER_PASSWORD). `auto_expose_new_tables = false`.
- Worker tasks: T-001..T-004 **verified + committed**. T-005 (group/invite actions + error map) **done, awaiting Verifier** — uncommitted Worker files: `messages/es.ts`, `lib/actions/{errors,groups}{,.test}.ts` (commit after verify). T-006..T-009 todo (M1 UI chain).
- FATHER side committed: `lib/settings` (zod), M1 schema, M2 schema (matches core, scouting votes, derived rating tables, every member has a player row; 14 pgTAP files / 172 assertions), `lib/rating` + `lib/reconcile` (reliability = 2/(1+(RMSE/σ)²), neutral below bias_min_votes), `lib/brackets` (71 tests), vitest global RTL cleanup, `/dev/*` public in development.
- `.orchestra/.father-seen` = T-001..T-004. NOT auto-appended: `echo T-XXX >> .orchestra/.father-seen` after handling each result.

## Status (updated 2026-09-24 night)
- User asked for M7 Plantillas (FUT-style squads + clubs with crests); design in PLAN.md M7. FATHER backend DONE: lib/squads engine (08b3f71), clubs/squads schema + storage bucket club-crests (2443eb7), actions (e4d34bf), view/context + /api/og/squad (3197e1c), tournament entries club_id (f2adf9d), seeder with clubs + published squad.
- Worker chain: T-020 (in progress) → T-023..T-026 (M5 UI) → T-029..T-032 (M7 UI).
- Verifier SendMessages after each verdict; commit only the task's files. The user sometimes commits the tree themselves (e.g. 53109e0 "asd"): then commit only what's left.
- No background watcher. Sonnet subagents limited until Sep 25 3pm ART; do FATHER work directly.

## Next (FATHER)
- e2e for tournaments/squads once their UI lands; final full verification (lint, typecheck, test, test:db, test:dbint, build, e2e); then ask the user about prod (cloud Supabase + Vercel, OAuth creds, cron).

## Gotchas
- Bash heredocs can drop backslashes → use Write for code with backslashes. The Write tool turns backslash-u escapes in markdown into literal chars — spell them as U+00A0.
- `python` = hanging Windows Store stub → use `node -e`.
- zod 4: nested object defaults need `.prefault({})`.
- Migrations don't give service_role DML by default — grant explicitly for admin-client-written tables.
- pgTAP: SECURITY DEFINER fns use `pg_catalog.now()`, so freeze_time doesn't affect them; backdate rows as postgres (`reset role;`). Use `throws_ok(sql, '42501', null, desc)` (4-arg) for SQLSTATE checks.
- Bracket engine notes for M4 schema: BYE slot = sentinel `"__bye__"` (null = unresolved); league matches use bracket `group`; status locked=0 slots, waiting=1, ready=2; deterministic ids `s{stage}-{wb|lb|gf|tp|grp{X}}-r{r}-m{n}` → map to uuids. DE zero-rematch not guaranteed for n>16; groups_ko opposite-halves only for even group_count with 2 qualifiers.
