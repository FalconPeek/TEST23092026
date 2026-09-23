-- Scouting & extras vote tables. RLS is enabled here with no policies yet (deny-all interim
-- state); policies (own rows only -- votes are anonymous) + grants are added in
-- 20260923061629_scouting_rls.sql. Writes go through SECURITY DEFINER RPCs in
-- 20260923061632_scouting_rpcs.sql; there are no insert/update/delete grants at all.

create type public.vote_mode as enum ('quick', 'detailed');
create type public.star_kind as enum ('weak_foot', 'skill_moves');

-- One current ballot per (rater, target, attribute); history is kept via superseded_at.
-- attribute is either one of the 29 outfield + 5 GK sub-attributes (detailed mode) or one of
-- the 6 face-stat keys (quick mode) -- see CLAUDE.md "Rating system".
create table if not exists public.scouting_votes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  rater_player_id uuid not null references public.players (id) on delete cascade,
  target_player_id uuid not null references public.players (id) on delete cascade,
  attribute text not null check (attribute in (
    'acceleration', 'sprint_speed',
    'positioning', 'finishing', 'shot_power', 'long_shots', 'volleys', 'penalties',
    'vision', 'crossing', 'free_kick', 'short_passing', 'long_passing', 'curve',
    'agility', 'balance', 'reactions', 'ball_control', 'dribbling', 'composure',
    'interceptions', 'heading', 'def_awareness', 'standing_tackle', 'sliding_tackle',
    'jumping', 'stamina', 'strength', 'aggression',
    'gk_diving', 'gk_handling', 'gk_kicking', 'gk_reflexes', 'gk_positioning',
    'pac', 'sho', 'pas', 'dri', 'def', 'phy'
  )),
  value int not null check (value between 1 and 10),
  mode public.vote_mode not null,
  created_at timestamptz not null default now(),
  superseded_at timestamptz
);

create unique index if not exists scouting_votes_current_unique
  on public.scouting_votes (rater_player_id, target_player_id, attribute)
  where superseded_at is null;
create index if not exists scouting_votes_rater_idx on public.scouting_votes (rater_player_id);
create index if not exists scouting_votes_target_idx on public.scouting_votes (target_player_id);
create index if not exists scouting_votes_group_idx on public.scouting_votes (group_id);

alter table public.scouting_votes enable row level security;

create table if not exists public.playstyle_votes (
  rater_player_id uuid not null references public.players (id) on delete cascade,
  target_player_id uuid not null references public.players (id) on delete cascade,
  playstyle text not null,
  created_at timestamptz not null default now(),
  primary key (rater_player_id, target_player_id, playstyle)
);

create index if not exists playstyle_votes_target_idx on public.playstyle_votes (target_player_id);

alter table public.playstyle_votes enable row level security;

create table if not exists public.star_votes (
  rater_player_id uuid not null references public.players (id) on delete cascade,
  target_player_id uuid not null references public.players (id) on delete cascade,
  kind public.star_kind not null,
  value int not null check (value between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (rater_player_id, target_player_id, kind)
);

create index if not exists star_votes_target_idx on public.star_votes (target_player_id);

alter table public.star_votes enable row level security;
