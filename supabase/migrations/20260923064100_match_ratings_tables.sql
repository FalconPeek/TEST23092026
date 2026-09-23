-- Match ratings (post-match peer/spectator 1-10 ratings + up to 2 "standout" sub-attribute tags
-- per rating). RLS is enabled here with no policies yet (deny-all interim state); policies (own
-- rows only -- votes are anonymous) + grants are added in 20260923064104_match_ratings_rls.sql.
-- Writes go through the SECURITY DEFINER RPC in 20260923064107_match_ratings_rpcs.sql; there are
-- no insert/update/delete grants to authenticated at all.

-- The 34 sub-attribute keys a rating can tag as "standout" (29 outfield + 5 GK -- face-stat keys
-- like pac/sho/... are not valid here, same list as public.scouting_votes.attribute minus the
-- face stats). Not used directly by any RLS policy, only in a table check constraint below and
-- from inside the submit_match_ratings RPC body, so it's revoked from public and NOT granted to
-- authenticated (matching private.playstyle_codes()).
create or replace function private.sub_attribute_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'acceleration', 'sprint_speed',
    'positioning', 'finishing', 'shot_power', 'long_shots', 'volleys', 'penalties',
    'vision', 'crossing', 'free_kick', 'short_passing', 'long_passing', 'curve',
    'agility', 'balance', 'reactions', 'ball_control', 'dribbling', 'composure',
    'interceptions', 'heading', 'def_awareness', 'standing_tackle', 'sliding_tackle',
    'jumping', 'stamina', 'strength', 'aggression',
    'gk_diving', 'gk_handling', 'gk_kicking', 'gk_reflexes', 'gk_positioning'
  ]::text[];
$$;

revoke execute on function private.sub_attribute_keys() from public;

-- One current rating per (match, rater, target). Upserted by submit_match_ratings until
-- rating_deadline. rater_role is captured at submit time from match_participants (player or
-- spectator) so the aggregation pipeline can apply spectator_weight without re-joining later.
create table if not exists public.match_ratings (
  match_id uuid not null references public.matches (id) on delete cascade,
  rater_player_id uuid not null references public.players (id) on delete cascade,
  target_player_id uuid not null references public.players (id) on delete cascade,
  rating int not null check (rating between 1 and 10),
  standout_attributes text[] not null default '{}'::text[],
  rater_role public.participant_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, rater_player_id, target_player_id),
  constraint match_ratings_no_self_rating check (rater_player_id <> target_player_id),
  constraint match_ratings_standout_max_2 check (coalesce(array_length(standout_attributes, 1), 0) <= 2),
  constraint match_ratings_standout_valid check (standout_attributes <@ private.sub_attribute_keys())
);

create index if not exists match_ratings_rater_idx on public.match_ratings (rater_player_id);
create index if not exists match_ratings_target_idx on public.match_ratings (target_player_id);
create index if not exists match_ratings_match_idx on public.match_ratings (match_id);

alter table public.match_ratings enable row level security;
