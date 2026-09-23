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
| T-008 | admin page: members, invites, guests | M1 | todo | deps T-007 |
| T-009 | group settings form + player profile editor | M1 | todo | deps T-008 |
| T-010 | scouting + match actions, playstyle codes, error codes | M2/M3 | todo | deps T-009 |
| T-011 | player profile: card, radar, attributes, stats | M2 | todo | deps T-010 |
| T-012 | scouting vote page | M2 | todo | deps T-011 |
| T-013 | matches list/create/lineup + auto-balance | M3 | todo | deps T-012 |
| T-014 | match detail: report score/stats, rate players | M3 | todo | deps T-013 |
| T-015 | disputes, finalize button, final result | M3 | todo | deps T-014; needs lib/actions/finalize.ts (FATHER) |

FATHER side:
- DONE: lib/settings, M1 schema (8 migrations, 77 pgTAP), lib/rating + lib/reconcile (151 tests) — commit 0b97cd8.
- DONE: lib/brackets (71 tests).
- DONE: M2 schema (matches core, scouting, derived tables; 172 pgTAP) — 248aec6.
- DONE: M3 schema (reports, match ratings, match results/stats/audit, finalize lifecycle, pg_cron; 18 pgTAP files / 242 assertions) — 6003bdb.
- DONE: service_role read grants (aac0372); lib/server recompute pipeline, live-smoke verified (2e06366).
- DONE: M4 tournament schema (6 migrations, pgTAP 020-022, 313 assertions total) — bd6bbdf. No standings table (computed on read via lib/brackets standings()).
- IN PROGRESS (subagent): match finalizer lib/server/finalize* + lib/actions/finalize.ts + app/api/cron/finalize.
- NEXT: lib/server/tournaments.ts (generate → persist_bracket; groups_ko seeding; swiss next round; finalizer → confirm_match_result for tournament matches), then M4 UI tasks.
