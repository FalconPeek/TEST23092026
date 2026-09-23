-- M5 engagement: badge catalog + award ledger. `badges` is a small static reference table (like
-- a lookup enum) seeded right here (not in supabase/seed.sql, which is dev-data only) so it ships
-- with every environment. The TS badge engine (lib/rating or a new lib/badges, run from the
-- finalizer with the admin client) is the source of truth for *awarding* -- this migration only
-- defines the catalog shape and the ledger table. RLS is enabled here with no policies yet
-- (deny-all interim state); policies + grants are added in 20260923211707_badges_rls.sql.

create table if not exists public.badges (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  -- Key into messages/es.ts (e.g. "badges.first_match.name" / "badges.first_match.description");
  -- the SQL layer never stores user-facing copy, matching "UI strings only from messages/es.ts".
  name_key text not null,
  icon text not null,
  category text not null check (category in ('participation', 'performance', 'social', 'tournament', 'card')),
  sort int not null default 0
);

alter table public.badges enable row level security;

-- One-time badges (e.g. first_match) get a single row with count = 1. Repeatable badges (e.g.
-- mvp, awarded again every time it's earned) reuse the SAME (player_id, badge_code) row: the
-- awarding engine increments `count` and bumps `awarded_at`/`match_id` to the latest occurrence
-- instead of inserting a new row per occurrence. This keeps "has this badge" a simple existence
-- check and "how many times" a single column, at the cost of losing individual award timestamps
-- for repeats (acceptable: player_badges is a ledger of *current standing*, not an event log --
-- match_audit / notifications already carry the per-event trail).
create table if not exists public.player_badges (
  player_id uuid not null references public.players (id) on delete cascade,
  badge_code text not null references public.badges (code) on delete cascade,
  awarded_at timestamptz not null default now(),
  match_id uuid references public.matches (id) on delete set null,
  tournament_id uuid references public.tournaments (id) on delete set null,
  count int not null default 1 check (count > 0),
  primary key (player_id, badge_code)
);

create index if not exists player_badges_badge_code_idx on public.player_badges (badge_code);

alter table public.player_badges enable row level security;

-- ### Seed the catalog (idempotent: `on conflict do nothing`, safe to re-run / replay).
insert into public.badges (code, name_key, icon, category, sort) values
  ('first_match', 'badges.first_match', 'whistle', 'participation', 10),
  ('matches_10', 'badges.matches_10', 'shirt', 'participation', 20),
  ('matches_50', 'badges.matches_50', 'shirt', 'participation', 30),
  ('first_goal', 'badges.first_goal', 'ball', 'performance', 40),
  ('hat_trick', 'badges.hat_trick', 'hat-trick', 'performance', 50),
  ('goals_25', 'badges.goals_25', 'ball', 'performance', 60),
  ('assist_king', 'badges.assist_king', 'boot', 'performance', 70),
  ('mvp', 'badges.mvp', 'star', 'performance', 80),
  ('mvp_5', 'badges.mvp_5', 'star', 'performance', 90),
  ('clean_sheet', 'badges.clean_sheet', 'shield', 'performance', 100),
  ('clean_sheets_10', 'badges.clean_sheets_10', 'shield', 'performance', 110),
  ('streak_3_wins', 'badges.streak_3_wins', 'flame', 'performance', 120),
  ('tournament_champion', 'badges.tournament_champion', 'trophy', 'tournament', 130),
  ('scout_10', 'badges.scout_10', 'eye', 'social', 140),
  ('gold_card', 'badges.gold_card', 'card-gold', 'card', 150)
on conflict (code) do nothing;

-- ### service_role grants (the admin client / TS badge engine awards these directly).
grant select, insert, update, delete on public.player_badges to service_role;
grant select on public.badges to service_role;
