# FATHER handoff — 2026-09-23 (updated mid-M1 UI / M3 schema)

## Read first
`CLAUDE.md`, `.orchestra/PLAN.md`, `.orchestra/BOARD.md`.

## State (committed through 248aec6)
- Local Supabase stack (Docker) for dev (API :54321, DB :54322, Studio :54323, Mailpit :54324); `.env.local` written (local keys, CRON_SECRET, VAPID, E2E_USER_PASSWORD). `auto_expose_new_tables = false`.
- Worker tasks: T-001..T-004 **verified + committed**. T-005 (group/invite actions + error map) **in_progress** — uncommitted Worker files: `messages/es.ts`, `lib/actions/{errors,groups}{,.test}.ts`. T-006..T-009 todo (M1 UI chain).
- FATHER side committed: `lib/settings` (zod), M1 schema, M2 schema (matches core, scouting votes, derived rating tables, every member has a player row; 14 pgTAP files / 172 assertions), `lib/rating` + `lib/reconcile` (reliability = 2/(1+(RMSE/σ)²), neutral below bias_min_votes), `lib/brackets` (71 tests), vitest global RTL cleanup, `/dev/*` public in development.
- `.orchestra/.father-seen` = T-001..T-004. NOT auto-appended: `echo T-XXX >> .orchestra/.father-seen` after handling each result.

## Background subagents launched (a restart may cut them off)
1. db-architect **M3**: score_reports, stat_reports, match_ratings, match_results, match_stats, match_audit, `private/public.close_expired_windows` (public one service_role only), pg_cron job every 10 min, `request_finalize`, `resolve_dispute`, `matches.finalized_at`; pgTAP 014+.
2. rating-engine **recompute pipeline**: `lib/server/{rating-repo,recompute,recompute-now}.ts` + tests, `recompute.db.test.ts` gated by RUN_DB_TESTS, npm script `test:dbint`.
Both were killed by a usage-limit error; relaunched after the reset as "resume" runs. The first M3 run left 9 uncommitted migrations `20260923064046..064115_*` (4 reports files with content, 5 empty) — the relaunched agent owns/fixes them. If these relaunches also die: same recovery steps below.

## On resume
1. Delete `.orchestra/PAUSE` (if present). `docker info`; `npx supabase status` (start if needed).
2. `git status`: look for migrations newer than `20260923063200_*`, `supabase/tests/database/014+`, `lib/server/*`. Run `npm run db:reset && npm run test:db` and `npx vitest run lib/server`. Relaunch whichever agent didn't finish ("continue from existing files"; scope above), then review + commit.
3. Restart watcher in background: `bash .orchestra/wait-for-task.sh verified,rejected --seen .orchestra/.father-seen --timeout 3000`.

## Next after that
- Wire `recomputeNow` into scouting vote actions; TS finalizer `lib/actions/finalize.ts` (reconcile → match_results/match_stats → form → recompute → OpenSkill → badges later) + `app/api/cron/finalize` (Bearer CRON_SECRET; calls close_expired_windows, then processes pending_finalize).
- Map new error codes to es.ts in the next actions task: M2 `PICADO_SELF_VOTE, PICADO_SPECTATOR, PICADO_NO_SHARED_MATCH, PICADO_COOLDOWN, PICADO_TARGET_LEFT` (+ M3 codes).
- Worker tasks for M2/M3 UI: player profile (card + radar), scouting vote UI (quick/detailed, playstyles, stars, eligibility via `get_scouting_status`), matches list/create/lineup (+ auto-balance via `balanceTeams`), report + rate pages, dispute UI.
- Playwright e2e for magic-link login (Verifier note on T-003).
- M4 tournament schema, then M5/M6 per PLAN.

## Gotchas
- Bash heredocs can drop backslashes → use Write for code with backslashes. The Write tool turns backslash-u escapes in markdown into literal chars — spell them as U+00A0.
- `python` = hanging Windows Store stub → use `node -e`.
- zod 4: nested object defaults need `.prefault({})`.
- Migrations don't give service_role DML by default — grant explicitly for admin-client-written tables.
- pgTAP: SECURITY DEFINER fns use `pg_catalog.now()`, so freeze_time doesn't affect them; backdate rows as postgres (`reset role;`). Use `throws_ok(sql, '42501', null, desc)` (4-arg) for SQLSTATE checks.
- Bracket engine notes for M4 schema: BYE slot = sentinel `"__bye__"` (null = unresolved); league matches use bracket `group`; status locked=0 slots, waiting=1, ready=2; deterministic ids `s{stage}-{wb|lb|gf|tp|grp{X}}-r{r}-m{n}` → map to uuids. DE zero-rematch not guaranteed for n>16; groups_ko opposite-halves only for even group_count with 2 qualifiers.
