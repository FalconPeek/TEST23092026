# BOARD (FATHER-maintained)

Current milestone: **M1 UI → M2/M3 UI** (M0 done; dev on local Supabase stack). Resumed 2026-09-23.

| id | title | milestone | status | notes |
|----|-------|-----------|--------|-------|
| T-001 | messages/es.ts + lib/format.ts | M0 | verified | |
| T-002 | theme, root layout, landing | M0 | verified | deps T-001 |
| T-003 | login page + auth actions | M1 | verified | deps T-001 |
| T-004 | FUT player card + /dev/cards | M2 | verified | deps T-002 |
| T-005 | group/invite/member actions + error map | M1 | verified | deps T-003 |
| T-006 | app shell, my groups, group home | M1 | verified | deps T-002, T-005 |
| T-007 | invite page /invitacion/[code] | M1 | verified | deps T-006 |
| T-008 | admin page: members, invites, guests | M1 | verified | deps T-007 |
| T-009 | group settings form + player profile editor | M1 | verified | deps T-008 |
| T-010 | scouting + match actions, playstyle codes, error codes | M2/M3 | verified | deps T-009 |
| T-011 | player profile: card, radar, attributes, stats | M2 | verified | deps T-010 |
| T-012 | scouting vote page | M2 | verified | deps T-011 |
| T-013 | matches list/create/lineup + auto-balance | M3 | verified | deps T-012 |
| T-014 | match detail: report score/stats, rate players | M3 | verified (via T-021, T-022) | deps T-013 |
| T-015 | disputes, finalize button, final result | M3 | verified | deps T-022; lib/actions/finalize.ts ready |
| T-021 | fix T-014: ≥44px tap targets (stats form, standout search) | M3 | verified (via T-022) | deps T-013; fixes rejected T-014 |
| T-022 | fix T-021: standout chips + saves toggle ≥44px | M3 | verified | deps T-013; fixes rejected T-021 |
| T-016 | tournaments: M4 error strings, list, create form | M4 | verified | deps T-015 |
| T-017 | tournament hub: status, registrations, entries, generate | M4 | verified | deps T-016 |
| T-018 | bracket view + match result actions + realtime | M4 | rejected (fix: T-028) | deps T-017 |
| T-019 | standings tables + fixtures | M4 | todo | deps T-028 |
| T-028 | fix T-018: champion only when bracket decided + finished | M4 | todo | deps T-017; fixes rejected T-018 |
| T-027 | finalized match: unattributed goals + admin "Asignar goles" | M3 | todo | deps T-019 |
| T-020 | polish: Verifier notes + quick-vote bias fix | M1 | todo | deps T-027 |
| T-023 | M5 strings, badges on profile, share button, templates from es.ts | M5 | todo | deps T-020; /api/og/card ready |
| T-024 | rankings page | M5 | todo | deps T-023 |
| T-025 | /yo dashboard | M5 | todo | deps T-024 |
| T-026 | notifications center, bell, prefs + push toggle | M5 | todo | deps T-025; lib/push/client.ts ready |

FATHER side:
- DONE: lib/settings, M1 schema (8 migrations, 77 pgTAP), lib/rating + lib/reconcile (151 tests) — commit 0b97cd8.
- DONE: lib/brackets (71 tests).
- DONE: M2 schema (matches core, scouting, derived tables; 172 pgTAP) — 248aec6.
- DONE: M3 schema (reports, match ratings, match results/stats/audit, finalize lifecycle, pg_cron; 18 pgTAP files / 242 assertions) — 6003bdb.
- DONE: service_role read grants (aac0372); lib/server recompute pipeline, live-smoke verified (2e06366).
- DONE: M4 tournament schema (6 migrations, pgTAP 020-022, 313 assertions total) — bd6bbdf. No standings table (computed on read via lib/brackets standings()).
- DONE: match finalizer (lib/server/finalize*, lib/actions/finalize.ts finalizeMatchNow, /api/cron/finalize Bearer) — dc8165c. Note: test:dbint leaves 1 group + 5 users per run (no delete path); cleared by db:reset or manual SQL.
- DONE: tournament server layer (lib/server/tournament*, lib/actions/tournaments.ts, finalizer auto-advance) — e840b18. Realtime publication (tournament_matches, tournaments, matches) — 0bfb2b6.
- DONE: M5 schema (badges, notifications+prefs, push_subscriptions, leaderboard/Impacto, dashboard RPCs, realtime; 402 pgTAP) — 7a21dc9.
- DONE: badge engine + awarding, notifications + web push, engagement actions, notify hooks — 234357a (assist_king = 3+ assists in one match, repeatable).
- DONE: PWA (Serwist/Turbopack SW at /sw.js, manifest, icons, push + notificationclick), lib/push/client.ts, /api/og/card share image (public, live-checked).
- DONE (M6, partial): DB privilege audit + revoke TRUNCATE/REFERENCES/TRIGGER/MAINTAIN from client roles (c714695); open-redirect guard hardened (1dabfe0); Playwright e2e: groups/invite + full match flow through cron finalizer (3dfd1fc, 10 tests green).
- DECIDED (user): score-only matches finalize with unattributed goals; admins assign them later (amend_match_stats) — 801e6d4. UI: T-027.
- DONE: demo seeder `npm run seed:demo` (10 players, 3 finalized friendlies, 50 scouting ballots; needs `npm run dev`).
- DONE: GK quick-mode scouting backend (div/han/kic/ref/pos → gk_*) — 13febb1; UI in T-020 step 11.
- NEXT (FATHER): tournament e2e once T-019 lands, final full verification, then deploy decision with user.

