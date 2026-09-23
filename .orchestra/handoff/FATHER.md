# FATHER handoff — 2026-09-23 (paused for PC restart so the user can run Docker Desktop)

## Read first
- `CLAUDE.md` (full spec + team protocol, incl. PAUSE/handoff rule), `.orchestra/PLAN.md` (approved plan + milestones), `.orchestra/BOARD.md`.
- The Phase 1 decisions (user answers) are all captured in PLAN.md "Final decisions". Nothing else is pending from the user except the DB choice below.

## State
- **Phase 2 setup: DONE.** CLAUDE.md, `.claude/agents/{db-architect,bracket-engine,rating-engine,ui-builder}.md` (model: sonnet), `.orchestra/` (wait-for-task.sh tested: todo+deps, seen-list, DONE=2, PAUSE=3, CRLF-safe), WORKER_PROMPT.md, VERIFIER_PROMPT.md.
- **M0 Scaffold: mostly DONE, committed** (git `main`, commits `bac81e2` scaffold + LF gitattributes commit):
  - Next 16.3.6, React 19.2.8, TS ~5.9, Tailwind 4, shadcn (radix-nova style, ~26 ui components in `components/ui`), ESLint 9 flat, Vitest 5 + jsdom + Testing Library, Playwright (mobile Pixel 7 project), supabase CLI 2.117 as devDependency (`npx supabase`).
  - Scripts: dev, build, lint (`eslint .`), typecheck (`next typegen && tsc --noEmit`), test, test:db (`supabase test db --linked` — change to local if using Docker), e2e, db:types (`--linked` — change to `--local` if using Docker), db:push, check.
  - Written: `lib/supabase/{env,client,server,admin,proxy}.ts`, `proxy.ts` (session refresh + redirect to /login for private paths), `app/auth/callback/route.ts` (PKCE + open-redirect guard), `lib/supabase/env.test.ts` (8 passing), placeholder `lib/supabase/database.types.ts`, `.env.example`, `vitest.config.ts`, `playwright.config.ts`, `supabase/config.toml` (project_id picado, site_url localhost:3000, redirect allow-list).
  - `AGENTS.md` is managed by `next dev` (Next agent rules); CLAUDE.md imports it with `@AGENTS.md` on line 1. Next 16 docs are in `node_modules/next/dist/docs/`.
  - NOT done in M0: `.env.local` (needs DB keys), app shell/theme/layout (planned as Worker task T-002).
- **No tasks written yet** (`.orchestra/tasks/` empty). Worker/Verifier have not started.

## Blocker → decision needed on resume
- Cloud dev project creation FAILED: Supabase account `nnicotraversaro` is at the 2-active-free-projects limit (org "FalconPeek dev", id `youuxriuntwhapqheimh`, existing project AgroNexo `cbhdqdtzcjxotkdkfnrl` in sa-east-1 — do NOT touch it).
- User is restarting the PC to run Docker Desktop → **plan: use the local Supabase stack** (`npx supabase start`; first run pulls several GB). If ports fail on Windows: `net stop winnat && net start winnat` (admin) or change ports in config.toml; if analytics/logs container fails set `[analytics] enabled = false`.
  - Then: switch `test:db` → `supabase test db` and `db:types` → `supabase gen types typescript --local --schema public > lib/supabase/database.types.ts`; write `.env.local` from `npx supabase status -o env` (publishable/secret keys, API URL http://127.0.0.1:54321); local email via Mailpit (http://127.0.0.1:54324) for magic links; CLAUDE.md "Infra"/"Commands" should be updated to say local stack for dev.
  - Prod cloud project + Vercel remain an M6 question (free slot problem again → ask user then).

## Next steps on resume (in order)
1. Delete `.orchestra/PAUSE`. Check `docker info`; if Docker is up → `npx supabase start` (run in background, can take long), then do the local-stack bullets above. If not up → ask the user.
2. Write first Worker tasks (no DB needed) and update BOARD.md:
   - T-001 `messages/es.ts` skeleton + `lib/format.ts` (es-AR date/number helpers, tz Buenos Aires) + tests.
   - T-002 theme + root layout (dark default, lang es-AR, metadata "Picado", FUT tier color tokens in globals.css, Toaster) + landing `app/page.tsx` (depends T-001).
   - T-003 login page UI + `app/auth/auth-code-error/page.tsx` + `lib/actions/auth.ts` (signInWithOAuth google/discord with redirectTo `${siteUrl()}auth/callback?next=`, signInWithOtp email, signOut) (depends T-001).
   - T-004 FUT card visual component `components/card/player-card.tsx` with an explicit props type (face stats or GK stats, tier, provisional, stars, playstyles) + `/dev/cards` preview page (depends T-002).
3. In parallel via subagents (background, pure TS, no overlap with Worker files): `lib/settings/{group,tournament}.ts` (write myself first — engines depend on it), then `rating-engine` subagent (lib/rating + lib/reconcile), `bracket-engine` subagent (lib/brackets). `openskill` 5.0.1 already installed.
4. Then M1 schema via `db-architect` subagent against the local stack (profiles, groups, group_members, invites, players, private helpers, RLS, pgTAP).
5. Commit after each verified batch. Keep BOARD.md current. Use `.orchestra/.father-seen` with `wait-for-task.sh verified,rejected --seen .orchestra/.father-seen`.

## Gotchas learned
- Bash-tool heredocs can drop backslashes (a `"/\\evil.com"` became `"/\evil.com"`): write code containing backslashes with the Write tool.
- `python` on this machine is the Windows Store stub and HANGS — use `node -e` instead.
- npm 11 `install-scripts` allowlist: only `unrs-resolver` postinstall pending (harmless). `@types/node` must be ^24 (vitest 5 peer).
- create-next-app refuses non-empty dirs → scaffolded in scratchpad and moved.
