# FATHER handoff — 2026-09-23 (updated mid-M1 UI / M3 schema)

## Read first
`CLAUDE.md`, `.orchestra/PLAN.md`, `.orchestra/BOARD.md`.

## State (older snapshot — see "Status" below for current)
- Local Supabase stack (Docker) for dev (API :54321, DB :54322, Studio :54323, Mailpit :54324); `.env.local` written (local keys, CRON_SECRET, VAPID, E2E_USER_PASSWORD). `auto_expose_new_tables = false`.
- Worker tasks: T-001..T-004 **verified + committed**. T-005 (group/invite actions + error map) **done, awaiting Verifier** — uncommitted Worker files: `messages/es.ts`, `lib/actions/{errors,groups}{,.test}.ts` (commit after verify). T-006..T-009 todo (M1 UI chain).
- FATHER side committed: `lib/settings` (zod), M1 schema, M2 schema (matches core, scouting votes, derived rating tables, every member has a player row; 14 pgTAP files / 172 assertions), `lib/rating` + `lib/reconcile` (reliability = 2/(1+(RMSE/σ)²), neutral below bias_min_votes), `lib/brackets` (71 tests), vitest global RTL cleanup, `/dev/*` public in development.
- `.orchestra/.father-seen` = T-001..T-004. NOT auto-appended: `echo T-XXX >> .orchestra/.father-seen` after handling each result.

## Status (resumed 2026-09-23 ~13:00)
- PAUSE removed. db:reset + test:db (250) + lint/typecheck/test (311) green. T-005 verified + committed (7b67270). Worker on T-006. T-010..T-015 written + committed (c457477).
- Worker/Verifier are reachable via SendMessage (ListAgents: "Worker", "Verifier").
- Watcher: `bash .orchestra/wait-for-task.sh verified,rejected --seen .orchestra/.father-seen --timeout 3000` (background); on hit: read verify report → commit task files (PASS) or write fix task (FAIL) → echo T-XXX >> .father-seen → re-arm.

## Background subagents (in flight, uncommitted output)
1. rating-engine: match finalizer — lib/server/finalize-repo.ts, finalize.ts (+tests, finalize.dbint.test.ts), lib/actions/finalize.ts (finalizeMatchNow), app/api/cron/finalize/route.ts, maybe migration *finalizer_grants* + pgTAP 019. T-015 depends on lib/actions/finalize.ts.
2. db-architect: M4 tournament schema (tables, RLS, RPCs persist_bracket/confirm_match_result/edit/append_swiss_round, pgTAP 020+), db:types.
If a restart kills them: check git status for their files, relaunch with "continue from existing files", then review + test + commit.

## Next
- Review/commit both subagent outputs. Then: lib/server/tournaments.ts (TS generate via lib/brackets → persist_bracket; hook finalizer → confirm_match_result for tournament matches), then M4 UI Worker tasks (tournament create/registration/entries, bracket view, tables/fixtures, Realtime).
- Playwright e2e for magic-link login; M5 per PLAN.

## Gotchas
- Bash heredocs can drop backslashes → use Write for code with backslashes. The Write tool turns backslash-u escapes in markdown into literal chars — spell them as U+00A0.
- `python` = hanging Windows Store stub → use `node -e`.
- zod 4: nested object defaults need `.prefault({})`.
- Migrations don't give service_role DML by default — grant explicitly for admin-client-written tables.
- pgTAP: SECURITY DEFINER fns use `pg_catalog.now()`, so freeze_time doesn't affect them; backdate rows as postgres (`reset role;`). Use `throws_ok(sql, '42501', null, desc)` (4-arg) for SQLSTATE checks.
- Bracket engine notes for M4 schema: BYE slot = sentinel `"__bye__"` (null = unresolved); league matches use bracket `group`; status locked=0 slots, waiting=1, ready=2; deterministic ids `s{stage}-{wb|lb|gf|tp|grp{X}}-r{r}-m{n}` → map to uuids. DE zero-rematch not guaranteed for n>16; groups_ko opposite-halves only for even group_count with 2 qualifiers.
