# FATHER handoff — 2026-09-23 (resumed after PC restart; this file reflects the post-resume state)

## Read first
`CLAUDE.md`, `.orchestra/PLAN.md`, `.orchestra/BOARD.md`.

## State
- Docker up; **local Supabase stack running** (`npx supabase start`; project_id `picado`; API :54321, DB :54322, Studio :54323, Mailpit :54324). `auto_expose_new_tables = false` in config.toml.
- `.env.local` written from `supabase status` (local keys) + generated CRON_SECRET, VAPID keys, E2E_USER_PASSWORD.
- Scripts switched to local (`test:db` = `supabase test db`, `db:types --local`, new `db:reset`). CLAUDE.md Commands/Infra updated.
- `lib/settings/{group,tournament}.ts` + tests DONE (commit b34d312).
- Worker tasks T-001..T-004 written (todo). BOARD updated.
- Background subagents launched (results not yet integrated when this was written):
  - rating-engine → `lib/rating/`, `lib/reconcile/`
  - bracket-engine → `lib/brackets/`
  - db-architect → M1 migrations (profiles, groups, group_members, invites, players, private helpers, RPCs incl. invites/roles/guests), pgTAP, seed.sql placeholder, database.types.ts
  If a session restart killed them: check which files exist, re-run `npx vitest run lib/rating lib/reconcile lib/brackets`, `npm run db:reset && npm run test:db`, and relaunch the missing agent with a "continue from existing files" prompt.

## Next steps
1. As subagents finish: review their reports + diffs, run lint/typecheck/tests, commit each.
2. Watch Worker/Verifier: `bash .orchestra/wait-for-task.sh verified,rejected --seen .orchestra/.father-seen` (seen file is gitignored). Commit verified batches; write fix tasks for rejections.
3. Next Worker tasks after M1 schema lands: M1 UI — server actions for groups/invites/members (`lib/actions/groups.ts`), `/g` group list + create, `/invitacion/[code]`, `/g/[groupId]/ajustes` (members, roles, invites, guests, settings form from zod schema), app shell with bottom nav. Then M2 schema (scouting votes, derived rating tables, recompute) via db-architect.

## Gotchas
- Bash heredocs can drop backslashes → use Write for code with backslashes. The Write tool turns ` `-style escapes in markdown into literal chars — spell them as U+00A0.
- `python` = hanging Windows Store stub → use `node -e`.
- zod 4: nested object defaults need `.prefault({})` (not `.default({})`).
