# Picado — PLAN (FATHER-owned; approved 2026-09-23)

## Context
Empty dir `C:\Users\Lucas\Documents\TEST23092026`. Build "Picado": mobile-first PWA for real-football competitions among friends —
OAuth login, peer-voted full FC 26-style cards, all tournament formats with automatic brackets/advancement, post-match stat reconciliation,
peer + spectator ratings that continuously update attributes, OpenSkill impact rating, profiles/dashboards/leaderboards/history.
Built by 3 sessions: FATHER (me, + Sonnet subagents), WORKER (Sonnet), VERIFIER (Opus), coordinating only via `.orchestra/`.
Env: Node 24.13, npm 11.19, git 2.55, Docker installed (user will start it + `supabase login`); Supabase CLI via `npx supabase`.
Research (4 parallel subagents) is complete; findings are baked into the decisions below.

## Final decisions (user-approved)
**Product**
- Real football only now. EA FC video-game mode = later (v2), separate match kind, never touches real card.
- Multiple groups; admins create/organize, members join by invite link. Roles: owner / admin / member / **spectator** (admin-assigned; can rate players, cannot play/vote scouting).
- Tournaments: teams (organizer builds or auto-balance) **and individual sign-up with auto-drawn balanced teams** (OVR + OpenSkill snake draft). Friendlies also count.
- Team size configurable (5/6/7/8/9/11), default 5. Guest players (placeholder profiles, claimable on sign-up, cannot vote).
- Name: **Picado**. UI es-AR voseo, dates es-AR, tz America/Argentina/Buenos_Aires; code/comments English.
- **Everything configurable** with sane defaults: group-level settings (rating params, spectator weight, windows) and tournament-level settings (points, tiebreaker order, draw resolution, etc.), stored as validated JSON (zod schemas shared client/server).

**Stack**: Next 16.3 (App Router, `proxy.ts`, Server Actions, Turbopack), React 19.3, **TypeScript ^5.9** (not 7), Tailwind 4 + shadcn 4, `@supabase/ssr` 0.12 + supabase-js 2.117 (publishable/secret keys, `getClaims()`),
zod 4, Recharts 3 (radar/line), Serwist (Turbopack) for PWA/push, `web-push`, `openskill` (JS), `next/og` for card images. Tests: Vitest 5 + Testing Library, pgTAP (basejump helpers), Playwright. ESLint 10 flat config. npm.
**Infra**: **cloud Supabase dev project** (free, created via connected Supabase account at M0) + later prod; Vercel Hobby. pg_cron for window-close finalization (Vercel Hobby cron is daily-only).
Local Docker stack optional for running pgTAP in isolation. Auth: Google + Discord OAuth (creds requested from user at M1); email+password test users created via admin API for dev/e2e.
Git init, local commit per verified milestone.

**Attributes (full FC 26 model)**
- 29 outfield sub-attributes → 6 face stats via EA weights: RIT(Aceleración, Velocidad), TIR(Definición, Potencia, Tiros lejanos, Posicionamiento, Voleas, Penales),
  PAS(Visión, Centros, Tiro libre, Pase corto, Pase largo, Efecto), REG(Agilidad, Equilibrio, Reacciones, Control, Regate, Compostura),
  DEF(Intercepciones, Cabezazo, Marcaje/Conciencia def., Entrada de pie, Entrada barrida), FIS(Salto, Resistencia, Fuerza, Agresividad).
- GK: Estirada, Manejo, Saque, Reflejos, Colocación (+ Velocidad from RIT).
- Extras: pie hábil, pierna mala ★1–5, filigranas ★1–5, PlayStyles (voted tags, + "PlayStyle+" at high consensus), altura optional.
- 15 positions (POR, LI, DFC, LD, CAI, CAD, MCD, MC, MCO, MI, MD, EI, ED, SD, DC); primary + alternates; OVR per position = EA-style weights over sub-attributes (table in `lib/rating/positions.ts`); card shows primary-position OVR.
- Tiers: bronze <65, silver 65–74, gold ≥75, special (≥85 / figura del partido / TOTW-style); provisional grey until ≥3 distinct raters.

**Rating formula** (per sub-attribute, all params group-configurable)
- Scouting votes: quick mode (vote a face stat 1–10 → applies to its subs) or detailed (vote subs). One ballot per rater→target, editable every 30 days; rater must have shared a match with target.
- Post-match: participants + assigned spectators rate each other 1–10 + up to 2 "se destacó en" tags; window 72h; spectator weight default 0.75.
- Aggregate: s = 30 + 6.5·x → rater bias correction (≥10 votes) → MAD trim 2.5 (n≥5) → weight = 0.5^(age/90d) · reliability(0.5–1.5) · role weight, single-rater cap 20%
  → weighted mean → Bayesian shrink toward group mean (m=3) → + form F = Σ 0.5^(age/30d)·clamp(0.5·(M−6.5),−1,1) on position-primary + tagged attrs, |F|≤3 → rate limit ±2/match, ±4/30d.
- Anti-abuse: no self-rating, eligibility checks, collusion flag (mutual inflation >2σ → weight ×0.5), writes only via SECURITY DEFINER RPCs; votes anonymous (RLS: own votes only; others see aggregates + counts).
- **OpenSkill (Plackett-Luce)** on match results now: μ−3σ shown as "Impacto"; used for team balancing (primary) with OVR tie-break.

**Stats & reconciliation** (rule A): goals, assists, own goals, saves; derived clean sheet, figura (MVP = highest median rating).
Score first (one reporter per team must agree, else dispute → organizer) → per-player per-stat median of reports → Σ goals(+opp OG) = score; drop least-supported claims, else dispute
→ 48h window, pg_cron auto-finalize → finalize triggers rating recompute, OpenSkill update, badges, bracket advancement.

**Tournaments** (all 5 now): league (single/double RR, Berger), single elim (+3rd place), double elim (+GF reset option), groups + KO (snake seeding, A1vB2 crossover, same-group avoidance), **Swiss** (Dutch-simplified, rematch avoidance, bye to lowest, Buchholz/SB).
Seeding by team avg OVR (manual override). Points 3/1/0, tiebreaker order configurable (default Pts>GD>GF>H2H>sorteo). KO draws → penalties (stored separately). Result confirmation → auto-advance in one DB transaction; edits allowed only if downstream unplayed (clears downstream).

**Extra features in v1** (user: "do it now"): personal dashboard (OVR/attribute history charts, form, stats trends), OpenSkill, Swiss, Web Push notifications (pending reports/ratings, next match, results), Supabase Realtime (live bracket/match updates), badges/achievements, share card as image (`next/og`), PWA installable.

## Architecture & data model (outline; full version goes into CLAUDE.md)
- `app/` routes (es-AR): `/login`, `/auth/callback`, `/g/[groupId]` (home feed), `/g/[id]/jugadores/[playerId]` (card/profile), `/g/[id]/partidos/[matchId]`, `/g/[id]/torneos/[tid]`, `/g/[id]/rankings`, `/yo` (dashboard), `/invitacion/[code]`.
- `lib/supabase/{client,server,proxy,admin}.ts`; `lib/brackets/` (pure TS: seed order, RR, SE, DE, groups, swiss, standings, advance); `lib/rating/` (pure TS formula + positions + OpenSkill wrapper); `lib/reconcile/` (pure TS); `lib/settings/` (zod schemas + defaults); `messages/es.ts`.
- Pure engines are the source of truth and unit-tested; server-side finalization runs in Server Actions/route handlers with the secret key after RPC-validated inputs, or in SQL functions where atomicity is required (advancement, vote submission).
- Tables (all RLS, explicit GRANTs, `(select auth.uid())`, private-schema helpers): profiles, groups, group_members(role), invites, players (user or guest, per group), player_positions,
  scouting_votes, match_ratings, attribute_ratings (derived, select-only), attribute_history, openskill_ratings, matches, match_teams, match_participants(role player/spectator),
  score_reports, stat_reports, match_stats (derived), tournaments(settings jsonb, format), tournament_entries, stages, tournament_matches (next_match_id/slot, next_loser_match_id/slot, decided_by, pens),
  badges, player_badges, push_subscriptions, notifications.

## Phase 2 — Setup (first actions after approval)
1. `CLAUDE.md` (as /init would, + full spec above: stack, architecture, data model, formulas, tournament rules, conventions, security rules, commands, team protocol).
2. `.claude/agents/*.md` (`model: sonnet`): `db-architect`, `bracket-engine`, `rating-engine`, `ui-builder`.
3. `.orchestra/{tasks,reports}/`, `BOARD.md`, `wait-for-task.sh <status> [assignee]` (bash; polls every 15s; prints first matching task path; exits; exits 2 if `.orchestra/DONE`),
   `WORKER_PROMPT.md` + `VERIFIER_PROMPT.md` for the user to paste into the other terminals.
4. `.orchestra/PLAN.md` with the milestones below.

## Milestones
- **M0 Scaffold**: git init; Next 16 + TS 5.9 + Tailwind/shadcn + ESLint + Vitest + Playwright; `supabase init`; create cloud dev project `picado-dev` via Supabase MCP (free) & link; `.env.local` from `.env.example`; scripts `lint`, `typecheck`, `test`, `test:db`, `e2e`, `db:types`, `build`.
- **M1 Auth, groups, roles**: SSR clients, `proxy.ts`, callback, login (Google/Discord; ask user for creds here), profiles, groups, members/roles incl. spectator, invite links, guest players + claim, settings schemas. RLS + pgTAP.
- **M2 Cards & scouting**: full attribute schema, positions, rating engine (TS, tests), submit_scouting_vote RPC, recompute pipeline, FUT card component (tiers, PlayStyles, stars), radar, player profile.
- **M3 Matches**: friendlies, lineups (players + spectators), auto-balance teams (OVR + OpenSkill), score/stat reports, reconciliation engine, post-match ratings, finalize (pg_cron + manual), OpenSkill update, disputes UI, match pages/history.
- **M4 Tournaments**: bracket engine (RR, SE, DE, groups+KO, Swiss) with exhaustive tests, generate/advance RPCs, team & individual sign-up flows, tournament pages (bracket view, tables, fixtures, standings), Realtime updates.
- **M5 Engagement**: leaderboards, personal dashboard + charts, badges, push notifications (VAPID keys — I generate), share-card images, home feed/pending actions, PWA.
- **M6 Hardening & deploy**: security review (RLS/RPC, Supabase advisors), full green lint/typecheck/tests/build, seed data, e2e happy paths; (with user approval) prod Supabase + Vercel, OAuth redirect config; write `.orchestra/DONE`.

Split: FATHER (+subagents) = schema/RLS/RPC, engines (brackets/rating/reconcile/OpenSkill), integration. WORKER = pages, components, forms, seed data, styling, tests. VERIFIER = every Worker task. Files declared per task; no overlap.

## User interrupts (only)
Creating cloud resources (Supabase dev project at M0 is covered by this plan approval; prod + Vercel at M6), OAuth client IDs/secrets (Google, Discord), Supabase DB password if CLI link needs it, irreversible decisions.

## Verification
`npm run lint && npm run typecheck && npm test` (engines: seed order, byes, DE drop order/no early rematches, RR fairness, Swiss no-rematch, tiebreakers, rating formula incl. trims/caps/limits, reconciliation, OpenSkill);
`npm run test:db` (pgTAP: non-members see nothing, spectators can rate but not play, no self-vote, no direct writes to derived tables, votes private); `npm run build`;
Playwright e2e against dev project: sign in → create group → invite → friendly → reports → finalize → card/OVR/Impacto updated → tournament generated → results auto-advance → leaderboards; `npm run dev` manual check on mobile viewport.

## M7 Plantillas (user request 2026-09-24): FUT-style squads + clubs
User decisions: both "equipo ideal" (per user, fun) and real match lineups on a pitch; chemistry, team OVR, formations,
publish/share/vote ("Equipo de la semana"); predefined teams ("clubes") with uploaded crest + colors.
- **Clubs** (group-scoped): name, short_name, primary/secondary color, crest in Storage bucket `club-crests`
  (png/jpeg/webp ≤ 512 KB, no SVG; public read; admins write), roster `club_players(club_id, player_id, shirt_number)`.
  Usable as a match team (`match_teams.club_id` → name/colors/crest) and as a tournament entry (`tournament_entries.club_id`).
- **Squads**: `squads(id, group_id, owner_player_id, kind dream|lineup, name, formation, team_size, club_id?, match_id?, side?,
  published, created_at, updated_at)` + `squad_slots(squad_id, slot, position, player_id)`; `squad_likes(squad_id, player_id)`.
  Owners write their own dream squads; admins write lineup squads; "Aplicar al partido" → set_match_lineup.
- **Pure engine `lib/squads/`**: formation catalog per team size (slots with position + pitch x/y), team OVR (FUT:
  mean of slot OVRs from player_cards.ovr_by_position + Σ max(0, ovr−mean)/n), chemistry (per player 0–3: position
  primary +2 / alt +1, link +1 if ≥ `link_min_matches` shared team appearances with another squad member, club +1 if
  ≥ `club_min` squad members share their club; team chem = Σ, max 3n). All params in group settings `squads.*`.
- **Share/vote**: public OG image `/api/og/squad/[id]` for published squads; likes; weekly "Equipo de la semana" =
  most-liked squad published in the last 7 days (computed on read).
