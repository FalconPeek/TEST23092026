-- Matches core: enums + tables. RLS is enabled here with no policies yet (deny-all interim
-- state); policies + grants are added in 20260923061619_matches_rls.sql once the private.*
-- helpers exist. Writes go through SECURITY DEFINER RPCs in 20260923061622_matches_rpcs.sql.

create type public.match_status as enum (
  'scheduled', 'reporting', 'disputed', 'pending_finalize', 'finalized', 'cancelled'
);
create type public.participant_role as enum ('player', 'spectator');

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  -- No FK yet: tournaments land in a later migration.
  tournament_match_id uuid,
  kind text not null default 'real' check (kind = 'real'),
  team_size int not null check (team_size between 3 and 11),
  scheduled_at timestamptz not null,
  played_at timestamptz,
  venue text,
  status public.match_status not null default 'scheduled',
  report_deadline timestamptz,
  rating_deadline timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists matches_group_id_idx on public.matches (group_id);

alter table public.matches enable row level security;

create table if not exists public.match_teams (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  side smallint not null check (side in (1, 2)),
  name text not null check (char_length(name) between 1 and 60),
  color text,
  unique (match_id, side)
);

create index if not exists match_teams_match_id_idx on public.match_teams (match_id);

alter table public.match_teams enable row level security;

-- 15 real-football position codes, same list as public.players.
create table if not exists public.match_participants (
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  team_id uuid references public.match_teams (id) on delete cascade,
  role public.participant_role not null default 'player',
  position text check (
    position is null or position in (
      'POR', 'LI', 'DFC', 'LD', 'CAI', 'CAD', 'MCD', 'MC', 'MCO', 'MI', 'MD', 'EI', 'ED', 'SD', 'DC'
    )
  ),
  primary key (match_id, player_id),
  constraint match_participants_team_role_check check (
    (role = 'player' and team_id is not null) or (role = 'spectator' and team_id is null)
  )
);

create index if not exists match_participants_player_id_idx on public.match_participants (player_id);
create index if not exists match_participants_team_id_idx on public.match_participants (team_id);

alter table public.match_participants enable row level security;
