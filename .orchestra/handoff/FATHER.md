# FATHER handoff — 2026-09-23 (updated mid-M1 UI / M3 schema)

## Read first
`CLAUDE.md`, `.orchestra/PLAN.md`, `.orchestra/BOARD.md`.

## State (older snapshot — see "Status" below for current)
- Local Supabase stack (Docker) for dev (API :54321, DB :54322, Studio :54323, Mailpit :54324); `.env.local` written (local keys, CRON_SECRET, VAPID, E2E_USER_PASSWORD). `auto_expose_new_tables = false`.
- Worker tasks: T-001..T-004 **verified + committed**. T-005 (group/invite actions + error map) **done, awaiting Verifier** — uncommitted Worker files: `messages/es.ts`, `lib/actions/{errors,groups}{,.test}.ts` (commit after verify). T-006..T-009 todo (M1 UI chain).
- FATHER side committed: `lib/settings` (zod), M1 schema, M2 schema (matches core, scouting votes, derived rating tables, every member has a player row; 14 pgTAP files / 172 assertions), `lib/rating` + `lib/reconcile` (reliability = 2/(1+(RMSE/σ)²), neutral below bias_min_votes), `lib/brackets` (71 tests), vitest global RTL cleanup, `/dev/*` public in development.
- `.orchestra/.father-seen` = T-001..T-004. NOT auto-appended: `echo T-XXX >> .orchestra/.father-seen` after handling each result.

## Status (updated 2026-09-23 night)
- Committed: M1–M5 schema (402 pgTAP), finalizer + cron, tournament server layer, badges/notifications/push server layer, realtime publication. Worker verified+committed T-001..T-014, T-021, T-022.
- Worker chain next: T-015 → T-016..T-019 (M4 UI) → T-020 (polish incl. quick-vote bias fix) → T-023..T-026 (M5 UI).
- Background watcher was killed by low-memory reaper; do NOT restart unless the user asks. Verifier SendMessages FATHER after each verdict; on a verdict: read report → commit Worker files (PASS) or write a fix task + re-point dependents (FAIL) → echo T-XXX >> .orchestra/.father-seen.
- Worker/Verifier reachable via SendMessage ("Worker", "Verifier"). Usage limits have hit twice: on reset, resume subagents via SendMessage to their id and nudge Worker/Verifier.

## Background subagent (in flight, uncommitted)
- ui-builder: PWA (Serwist, Turbopack), app/manifest.ts, icons, app/sw.ts push+notificationclick, lib/push/client.ts, app/api/og/card/[playerId]/route.tsx (+ generateMetadata on player page). T-023 needs the OG route, T-026 needs lib/push/client.ts.

## Next (FATHER)
- Review/commit the PWA agent. Then M6: security review (RLS/RPC/grants audit, Supabase advisors), Playwright e2e happy paths (magic link via Mailpit), seed data, full lint/typecheck/test/test:db/test:dbint/build; then ask the user about prod Supabase + Vercel.

## Gotchas
- Bash heredocs can drop backslashes → use Write for code with backslashes. The Write tool turns backslash-u escapes in markdown into literal chars — spell them as U+00A0.
- `python` = hanging Windows Store stub → use `node -e`.
- zod 4: nested object defaults need `.prefault({})`.
- Migrations don't give service_role DML by default — grant explicitly for admin-client-written tables.
- pgTAP: SECURITY DEFINER fns use `pg_catalog.now()`, so freeze_time doesn't affect them; backdate rows as postgres (`reset role;`). Use `throws_ok(sql, '42501', null, desc)` (4-arg) for SQLSTATE checks.
- Bracket engine notes for M4 schema: BYE slot = sentinel `"__bye__"` (null = unresolved); league matches use bracket `group`; status locked=0 slots, waiting=1, ready=2; deterministic ids `s{stage}-{wb|lb|gf|tp|grp{X}}-r{r}-m{n}` → map to uuids. DE zero-rematch not guaranteed for n>16; groups_ko opposite-halves only for even group_count with 2 qualifiers.
