# FATHER handoff — 2026-09-23 (updated mid-M1 UI / M3 schema)

## Read first
`CLAUDE.md`, `.orchestra/PLAN.md`, `.orchestra/BOARD.md`.

## State (older snapshot — see "Status" below for current)
- Local Supabase stack (Docker) for dev (API :54321, DB :54322, Studio :54323, Mailpit :54324); `.env.local` written (local keys, CRON_SECRET, VAPID, E2E_USER_PASSWORD). `auto_expose_new_tables = false`.
- Worker tasks: T-001..T-004 **verified + committed**. T-005 (group/invite actions + error map) **done, awaiting Verifier** — uncommitted Worker files: `messages/es.ts`, `lib/actions/{errors,groups}{,.test}.ts` (commit after verify). T-006..T-009 todo (M1 UI chain).
- FATHER side committed: `lib/settings` (zod), M1 schema, M2 schema (matches core, scouting votes, derived rating tables, every member has a player row; 14 pgTAP files / 172 assertions), `lib/rating` + `lib/reconcile` (reliability = 2/(1+(RMSE/σ)²), neutral below bias_min_votes), `lib/brackets` (71 tests), vitest global RTL cleanup, `/dev/*` public in development.
- `.orchestra/.father-seen` = T-001..T-004. NOT auto-appended: `echo T-XXX >> .orchestra/.father-seen` after handling each result.

## Status (updated 2026-09-24)
- Sonnet weekly limit hit (resets Sep 25 3pm ART): subagents unavailable; FATHER (Opus) did the PWA/OG finish, M6 security fixes, e2e, seeder, Rule A change, GK quick mode directly. Worker still progressing (T-017 in progress at time of writing).
- Committed through 4ae2364: M1–M5 schema + server layers, PWA (Serwist/Turbopack, /sw.js), /api/og/card, privilege revoke (c714695), redirect guard (1dabfe0), e2e (e2e/*.spec.ts, 11 green), seed:demo, amend_match_stats + unattributed goals (801e6d4, user decision), GK quick mode (13febb1). pgTAP 421, unit ~680, dbint 89.
- Worker chain: T-017 → T-018 → T-019 → T-027 → T-020 (big polish incl. quick-vote bias, GK quick UI, a11y, Spanish zod errors) → T-023..T-026 (M5 UI).
- No background watcher (low-memory reaper); Verifier SendMessages FATHER after each verdict. On PASS: commit only that task's declared files (check git diff of shared files like messages/es.ts), echo T-XXX >> .orchestra/.father-seen, update BOARD.
- db lint: persist_bracket temp-table error is a false positive (runtime temp tables); unused-variable warnings only.

## Next (FATHER)
- Tournament e2e (generate → confirm → champion) once T-019 lands. Final full verification (lint, typecheck, test, test:db, test:dbint, build, e2e). Then ask the user about prod (cloud Supabase + Vercel, OAuth creds, CRON via Vercel cron or pg_net).

## Gotchas
- Bash heredocs can drop backslashes → use Write for code with backslashes. The Write tool turns backslash-u escapes in markdown into literal chars — spell them as U+00A0.
- `python` = hanging Windows Store stub → use `node -e`.
- zod 4: nested object defaults need `.prefault({})`.
- Migrations don't give service_role DML by default — grant explicitly for admin-client-written tables.
- pgTAP: SECURITY DEFINER fns use `pg_catalog.now()`, so freeze_time doesn't affect them; backdate rows as postgres (`reset role;`). Use `throws_ok(sql, '42501', null, desc)` (4-arg) for SQLSTATE checks.
- Bracket engine notes for M4 schema: BYE slot = sentinel `"__bye__"` (null = unresolved); league matches use bracket `group`; status locked=0 slots, waiting=1, ready=2; deterministic ids `s{stage}-{wb|lb|gf|tp|grp{X}}-r{r}-m{n}` → map to uuids. DE zero-rematch not guaranteed for n>16; groups_ko opposite-halves only for even group_count with 2 qualifiers.
