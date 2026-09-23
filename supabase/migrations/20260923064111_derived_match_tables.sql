-- Derived match tables: written only by the service role / SECURITY DEFINER functions, never by
-- client writes. match_results / match_stats are select-only for group members. match_audit is
-- select-only for group admins (it can carry authoritative dispute-resolution overrides, which
-- rank-and-file members don't need to see).

create table if not exists public.match_results (
  match_id uuid primary key references public.matches (id) on delete cascade,
  team1_goals int not null check (team1_goals between 0 and 99),
  team2_goals int not null check (team2_goals between 0 and 99),
  pens1 int check (pens1 is null or pens1 between 0 and 99),
  pens2 int check (pens2 is null or pens2 between 0 and 99),
  decided_by text not null default 'regular' check (decided_by in ('regular', 'pens', 'walkover', 'manual')),
  winner_side smallint check (winner_side is null or winner_side in (1, 2)),
  finalized_at timestamptz not null default now()
);

alter table public.match_results enable row level security;

create table if not exists public.match_stats (
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  goals int not null default 0 check (goals >= 0),
  assists int not null default 0 check (assists >= 0),
  own_goals int not null default 0 check (own_goals >= 0),
  saves int not null default 0 check (saves >= 0),
  clean_sheet boolean not null default false,
  is_mvp boolean not null default false,
  median_rating numeric,
  n_ratings int not null default 0,
  primary key (match_id, player_id)
);

create index if not exists match_stats_player_id_idx on public.match_stats (player_id);

alter table public.match_stats enable row level security;

-- Organizer / group admin dispute resolutions and other match-lifecycle overrides, for
-- accountability. actor_user_id is nullable + ON DELETE SET NULL: the audit trail must survive
-- the acting user's account being deleted.
create table if not exists public.match_audit (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists match_audit_match_id_idx on public.match_audit (match_id);

alter table public.match_audit enable row level security;

-- ### service_role grants (the admin client / TS finalizer writes these tables directly).
grant select, insert, update, delete on public.match_results to service_role;
grant select, insert, update, delete on public.match_stats to service_role;
grant select, insert, update, delete on public.match_audit to service_role;

-- ### Grants + select policies for the client-visible derived tables.

grant select on public.match_results to authenticated;
grant select on public.match_stats to authenticated;
grant select on public.match_audit to authenticated;

create policy match_results_select_member on public.match_results
for select
to authenticated
using (
  exists (
    select 1 from public.matches m
    where m.id = match_results.match_id
      and private.is_member(m.group_id)
  )
);

create policy match_stats_select_member on public.match_stats
for select
to authenticated
using (
  exists (
    select 1 from public.matches m
    where m.id = match_stats.match_id
      and private.is_member(m.group_id)
  )
);

-- match_audit: admins/owner only (it can contain authoritative dispute-resolution overrides).
create policy match_audit_select_admin on public.match_audit
for select
to authenticated
using (
  exists (
    select 1 from public.matches m
    where m.id = match_audit.match_id
      and private.is_group_admin(m.group_id)
  )
);
