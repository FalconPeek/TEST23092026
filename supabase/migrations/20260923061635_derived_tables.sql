-- Derived tables: written only by the service role / SECURITY DEFINER functions, never by
-- client writes. attribute_ratings / player_cards / attribute_history / openskill_ratings are
-- select-only for group members. rater_stats / collusion_flags / recompute_queue are internal:
-- no grants to authenticated at all (RLS is still enabled, but with zero table privileges the
-- Data API rejects access before policies are even evaluated).

create type public.card_tier as enum ('bronze', 'silver', 'gold', 'special');

create table if not exists public.attribute_ratings (
  player_id uuid not null references public.players (id) on delete cascade,
  attribute text not null,
  value int not null check (value between 1 and 99),
  n_votes int not null default 0,
  n_raters int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (player_id, attribute)
);

alter table public.attribute_ratings enable row level security;

create table if not exists public.player_cards (
  player_id uuid primary key references public.players (id) on delete cascade,
  ovr int not null check (ovr between 1 and 99),
  position text,
  tier public.card_tier not null default 'bronze',
  is_provisional boolean not null default true,
  face jsonb not null default '{}'::jsonb,
  ovr_by_position jsonb not null default '{}'::jsonb,
  weak_foot int check (weak_foot is null or weak_foot between 1 and 5),
  skill_moves int check (skill_moves is null or skill_moves between 1 and 5),
  playstyles jsonb not null default '[]'::jsonb,
  n_raters int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.player_cards enable row level security;

create table if not exists public.attribute_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  ovr int not null check (ovr between 1 and 99),
  attrs jsonb not null default '{}'::jsonb,
  reason text not null check (reason in ('scouting', 'match', 'manual')),
  match_id uuid references public.matches (id) on delete set null
);

create index if not exists attribute_history_player_id_idx on public.attribute_history (player_id);

alter table public.attribute_history enable row level security;

create table if not exists public.openskill_ratings (
  player_id uuid primary key references public.players (id) on delete cascade,
  mu numeric not null default 25,
  sigma numeric not null default (25.0 / 3),
  ordinal numeric,
  matches_played int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.openskill_ratings enable row level security;

-- Internal only: no select grant for authenticated (rater bias/reliability must stay private
-- to prevent gaming the aggregation pipeline).
create table if not exists public.rater_stats (
  player_id uuid primary key references public.players (id) on delete cascade,
  bias numeric not null default 0,
  rmse numeric not null default 0,
  reliability numeric not null default 1,
  n_votes int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.rater_stats enable row level security;

-- Internal only: no select grant for authenticated.
create table if not exists public.collusion_flags (
  rater_player_id uuid not null references public.players (id) on delete cascade,
  target_player_id uuid not null references public.players (id) on delete cascade,
  flagged_at timestamptz not null default now(),
  primary key (rater_player_id, target_player_id)
);

alter table public.collusion_flags enable row level security;

-- Internal only: no select grant for authenticated. Drained by the TS recompute worker using
-- the service role.
create table if not exists public.recompute_queue (
  player_id uuid primary key references public.players (id) on delete cascade,
  reason text not null,
  enqueued_at timestamptz not null default now()
);

alter table public.recompute_queue enable row level security;

-- ### service_role grants (the admin client / TS recompute worker writes these tables directly).
-- New tables created via migrations do NOT automatically grant anything beyond
-- TRUNCATE/REFERENCES/TRIGGER to service_role (see the `postgres` default ACL for schema
-- `public`), so every table the admin client needs to write needs an explicit grant here.

grant select, insert, update, delete on public.attribute_ratings to service_role;
grant select, insert, update, delete on public.player_cards to service_role;
grant select, insert, update, delete on public.attribute_history to service_role;
grant select, insert, update, delete on public.rater_stats to service_role;
grant select, insert, update, delete on public.collusion_flags to service_role;
grant select, insert, update, delete on public.openskill_ratings to service_role;
grant select, insert, update, delete on public.recompute_queue to service_role;

-- ### Grants + select policies for the client-visible derived tables.

grant select on public.attribute_ratings to authenticated;
grant select on public.player_cards to authenticated;
grant select on public.attribute_history to authenticated;
grant select on public.openskill_ratings to authenticated;

create policy attribute_ratings_select_member on public.attribute_ratings
for select
to authenticated
using (
  exists (
    select 1 from public.players p
    where p.id = attribute_ratings.player_id
      and private.is_member(p.group_id)
  )
);

create policy player_cards_select_member on public.player_cards
for select
to authenticated
using (
  exists (
    select 1 from public.players p
    where p.id = player_cards.player_id
      and private.is_member(p.group_id)
  )
);

create policy attribute_history_select_member on public.attribute_history
for select
to authenticated
using (
  exists (
    select 1 from public.players p
    where p.id = attribute_history.player_id
      and private.is_member(p.group_id)
  )
);

create policy openskill_ratings_select_member on public.openskill_ratings
for select
to authenticated
using (
  exists (
    select 1 from public.players p
    where p.id = openskill_ratings.player_id
      and private.is_member(p.group_id)
  )
);

-- rater_stats, collusion_flags, recompute_queue intentionally get NO grants at all (not even
-- select) for authenticated/anon: nobody but the service role should ever read them.

-- ### Recompute queue trigger: any new (current) scouting/playstyle/star vote enqueues its
-- target player for the TS recompute worker (which drains this table with the service role).

create or replace function private.enqueue_recompute()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.recompute_queue (player_id, reason)
  values (new.target_player_id, tg_argv[0])
  on conflict (player_id) do update
    set reason = excluded.reason,
        enqueued_at = pg_catalog.now();
  return new;
end;
$$;

revoke execute on function private.enqueue_recompute() from public;

create trigger scouting_votes_enqueue_recompute
  after insert on public.scouting_votes
  for each row execute function private.enqueue_recompute('scouting');

create trigger playstyle_votes_enqueue_recompute
  after insert on public.playstyle_votes
  for each row execute function private.enqueue_recompute('playstyle');

create trigger star_votes_enqueue_recompute
  after insert on public.star_votes
  for each row execute function private.enqueue_recompute('star');
