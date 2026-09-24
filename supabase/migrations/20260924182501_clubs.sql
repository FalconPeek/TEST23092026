-- M7 clubs: a group's predefined teams (name, short name, colors, crest, roster). A club can be
-- used as a match team (match_teams.club_id) and as a tournament entry (tournament_entries.club_id),
-- and club mates earn squad chemistry (lib/squads).
--
-- Crests live in the public Storage bucket `club-crests` at `<group_id>/<club_id>.<ext>`; only
-- that group's admins can write there (storage.objects policies below). PNG/JPEG/WebP only, ≤ 512 KB:
-- SVG is excluded on purpose (it can carry scripts).

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  short_name text not null check (short_name ~ '^[A-Z0-9]{2,4}$'),
  primary_color text not null default '#16a34a' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color text not null default '#f5f5f5' check (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  crest_path text check (crest_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, name)
);
create index if not exists clubs_group_id_idx on public.clubs (group_id);

create table if not exists public.club_players (
  club_id uuid not null references public.clubs (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  shirt_number int check (shirt_number between 1 and 99),
  primary key (club_id, player_id)
);
create index if not exists club_players_player_id_idx on public.club_players (player_id);

alter table public.match_teams add column if not exists club_id uuid references public.clubs (id) on delete set null;
alter table public.tournament_entries add column if not exists club_id uuid references public.clubs (id) on delete set null;
create index if not exists match_teams_club_id_idx on public.match_teams (club_id);
create index if not exists tournament_entries_club_id_idx on public.tournament_entries (club_id);

-- ### RLS: members read; writes only through the RPCs below.
alter table public.clubs enable row level security;
alter table public.club_players enable row level security;

grant select on public.clubs to authenticated;
grant select on public.club_players to authenticated;
grant select on public.clubs to service_role;
grant select on public.club_players to service_role;

create policy clubs_select_member on public.clubs
  for select to authenticated
  using (private.is_member(group_id));

create policy club_players_select_member on public.club_players
  for select to authenticated
  using (exists (select 1 from public.clubs c where c.id = club_id and private.is_member(c.group_id)));

-- ### RPCs (group admins)
create or replace function public.create_club(
  p_group_id uuid,
  p_name text,
  p_short_name text,
  p_primary_color text default '#16a34a',
  p_secondary_color text default '#f5f5f5'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_group_admin(p_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can manage clubs';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 40 then
    raise exception 'PICADO_VALIDATION: club name must be 1-40 characters';
  end if;
  if p_short_name is null or upper(btrim(p_short_name)) !~ '^[A-Z0-9]{2,4}$' then
    raise exception 'PICADO_VALIDATION: short name must be 2-4 letters or digits';
  end if;
  if p_primary_color !~ '^#[0-9a-fA-F]{6}$' or p_secondary_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'PICADO_VALIDATION: colors must be #RRGGBB';
  end if;
  if exists (select 1 from public.clubs c where c.group_id = p_group_id and lower(c.name) = lower(btrim(p_name))) then
    raise exception 'PICADO_VALIDATION: a club with that name already exists';
  end if;

  insert into public.clubs (group_id, name, short_name, primary_color, secondary_color, created_by)
  values (p_group_id, btrim(p_name), upper(btrim(p_short_name)), p_primary_color, p_secondary_color, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_club(
  p_club_id uuid,
  p_name text,
  p_short_name text,
  p_primary_color text,
  p_secondary_color text,
  p_crest_path text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  select c.group_id into v_group_id from public.clubs c where c.id = p_club_id;
  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: club not found';
  end if;
  if not private.is_group_admin(v_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can manage clubs';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 40 then
    raise exception 'PICADO_VALIDATION: club name must be 1-40 characters';
  end if;
  if p_short_name is null or upper(btrim(p_short_name)) !~ '^[A-Z0-9]{2,4}$' then
    raise exception 'PICADO_VALIDATION: short name must be 2-4 letters or digits';
  end if;
  if p_primary_color !~ '^#[0-9a-fA-F]{6}$' or p_secondary_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'PICADO_VALIDATION: colors must be #RRGGBB';
  end if;
  -- The crest must live in this group's folder and be named after this club.
  if p_crest_path is not null and p_crest_path !~ ('^' || v_group_id::text || '/' || p_club_id::text || '\.(png|jpg|jpeg|webp)$') then
    raise exception 'PICADO_VALIDATION: invalid crest path';
  end if;
  if exists (
    select 1 from public.clubs c
    where c.group_id = v_group_id and c.id <> p_club_id and lower(c.name) = lower(btrim(p_name))
  ) then
    raise exception 'PICADO_VALIDATION: a club with that name already exists';
  end if;

  update public.clubs
  set name = btrim(p_name),
      short_name = upper(btrim(p_short_name)),
      primary_color = p_primary_color,
      secondary_color = p_secondary_color,
      crest_path = p_crest_path
  where id = p_club_id;
end;
$$;

create or replace function public.delete_club(p_club_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  select c.group_id into v_group_id from public.clubs c where c.id = p_club_id;
  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: club not found';
  end if;
  if not private.is_group_admin(v_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can manage clubs';
  end if;
  delete from public.clubs where id = p_club_id;
end;
$$;

-- p_players = [{ player_id, shirt_number? }]: replaces the whole roster.
create or replace function public.set_club_players(p_club_id uuid, p_players jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_elem jsonb;
  v_player uuid;
  v_number int;
  v_seen uuid[] := '{}'::uuid[];
  v_numbers int[] := '{}'::int[];
begin
  select c.group_id into v_group_id from public.clubs c where c.id = p_club_id;
  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: club not found';
  end if;
  if not private.is_group_admin(v_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can manage clubs';
  end if;
  if p_players is null or jsonb_typeof(p_players) <> 'array' then
    raise exception 'PICADO_VALIDATION: players must be a json array';
  end if;

  for v_elem in select * from jsonb_array_elements(p_players)
  loop
    v_player := nullif(v_elem ->> 'player_id', '')::uuid;
    if v_player is null or v_player = any (v_seen) then
      raise exception 'PICADO_VALIDATION: every player must be given once';
    end if;
    if not exists (
      select 1 from public.players p where p.id = v_player and p.group_id = v_group_id and p.left_at is null
    ) then
      raise exception 'PICADO_VALIDATION: player is not an active member of this group';
    end if;
    v_number := nullif(v_elem ->> 'shirt_number', '')::int;
    if v_number is not null and (v_number not between 1 and 99 or v_number = any (v_numbers)) then
      raise exception 'PICADO_VALIDATION: shirt numbers must be unique and between 1 and 99';
    end if;
    v_seen := v_seen || v_player;
    if v_number is not null then v_numbers := v_numbers || v_number; end if;
  end loop;

  delete from public.club_players where club_id = p_club_id;
  insert into public.club_players (club_id, player_id, shirt_number)
  select p_club_id, (e ->> 'player_id')::uuid, nullif(e ->> 'shirt_number', '')::int
  from jsonb_array_elements(p_players) e;
end;
$$;

revoke execute on function public.create_club(uuid, text, text, text, text) from public, anon;
revoke execute on function public.update_club(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.delete_club(uuid) from public, anon;
revoke execute on function public.set_club_players(uuid, jsonb) from public, anon;
grant execute on function public.create_club(uuid, text, text, text, text) to authenticated;
grant execute on function public.update_club(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.delete_club(uuid) to authenticated;
grant execute on function public.set_club_players(uuid, jsonb) to authenticated;

-- ### Crest storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('club-crests', 'club-crests', true, 524288, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- True when `p_name` is `<group_id>/<club_id>.<ext>` for an existing club of a group the caller
-- administers. Never throws on malformed names (storage calls it for every object write).
create or replace function private.can_manage_crest(p_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_parts text[];
begin
  v_parts := regexp_match(p_name, '^([0-9a-f-]{36})/([0-9a-f-]{36})\.(png|jpg|jpeg|webp)$');
  if v_parts is null then
    return false;
  end if;
  return exists (
    select 1 from public.clubs c
    where c.id::text = v_parts[2] and c.group_id::text = v_parts[1] and private.is_group_admin(c.group_id)
  );
end;
$$;

revoke execute on function private.can_manage_crest(text) from public, anon;
grant execute on function private.can_manage_crest(text) to authenticated;

-- The bucket is public (crests are shown everywhere); upserts also need row visibility.
create policy club_crests_select_all on storage.objects
  for select to authenticated
  using (bucket_id = 'club-crests');

create policy club_crests_insert_admin on storage.objects
  for insert to authenticated
  with check (bucket_id = 'club-crests' and private.can_manage_crest(name));

create policy club_crests_update_admin on storage.objects
  for update to authenticated
  using (bucket_id = 'club-crests' and private.can_manage_crest(name))
  with check (bucket_id = 'club-crests' and private.can_manage_crest(name));

create policy club_crests_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'club-crests' and private.can_manage_crest(name));
