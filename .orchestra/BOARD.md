# BOARD (FATHER-maintained)

Current milestone: **M1 Auth, groups, roles** (M0 done; dev on local Supabase stack)

| id | title | milestone | status | notes |
|----|-------|-----------|--------|-------|
| T-001 | messages/es.ts + lib/format.ts | M0 | verified | |
| T-002 | theme, root layout, landing | M0 | verified | deps T-001 |
| T-003 | login page + auth actions | M1 | see task | deps T-001 |
| T-004 | FUT player card + /dev/cards | M2 | see task | deps T-002 |
| T-005 | group/invite/member actions + error map | M1 | todo | deps T-003 |
| T-006 | app shell, my groups, group home | M1 | todo | deps T-002, T-005 |
| T-007 | invite page /invitacion/[code] | M1 | todo | deps T-006 |
| T-008 | admin page: members, invites, guests | M1 | todo | deps T-007 |
| T-009 | group settings form + player profile editor | M1 | todo | deps T-008 |

FATHER side:
- DONE: lib/settings, M1 schema (8 migrations, 77 pgTAP), lib/rating + lib/reconcile (151 tests) — commit 0b97cd8.
- RUNNING: bracket-engine (lib/brackets); db-architect M2 (matches core + scouting/derived rating tables).
