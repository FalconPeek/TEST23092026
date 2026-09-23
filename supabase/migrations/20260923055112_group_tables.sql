-- Core group/roster tables. RLS is enabled here with no policies yet (deny-all interim state);
-- policies + grants are added in 20260923055121_group_rls.sql once the private.* helpers exist.

create type public.group_role as enum ('owner', 'admin', 'member', 'spectator');
create type public.preferred_foot as enum ('left', 'right', 'both');

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  slug text not null unique,
  owner_id uuid not null references auth.users (id) on delete restrict,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.groups enable row level security;

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.group_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_members_user_id_idx on public.group_members (user_id);

alter table public.group_members enable row level security;

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  code text not null unique,
  role public.group_role not null default 'member',
  created_by uuid not null references auth.users (id) on delete restrict,
  expires_at timestamptz,
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invites_role_not_owner check (role <> 'owner')
);

create index if not exists invites_group_id_idx on public.invites (group_id);

alter table public.invites enable row level security;

-- 15 real-football position codes (see CLAUDE.md "Data model").
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  is_guest boolean not null default false,
  claimed_at timestamptz,
  left_at timestamptz,
  primary_position text check (
    primary_position is null or primary_position in (
      'POR', 'LI', 'DFC', 'LD', 'CAI', 'CAD', 'MCD', 'MC', 'MCO', 'MI', 'MD', 'EI', 'ED', 'SD', 'DC'
    )
  ),
  alt_positions text[] not null default '{}'::text[] check (
    alt_positions <@ array[
      'POR', 'LI', 'DFC', 'LD', 'CAI', 'CAD', 'MCD', 'MC', 'MCO', 'MI', 'MD', 'EI', 'ED', 'SD', 'DC'
    ]::text[]
  ),
  preferred_foot public.preferred_foot,
  height_cm int check (height_cm is null or height_cm between 120 and 230),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists players_group_id_idx on public.players (group_id);
create unique index if not exists players_group_user_unique on public.players (group_id, user_id)
  where user_id is not null;

alter table public.players enable row level security;
