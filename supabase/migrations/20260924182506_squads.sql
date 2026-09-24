-- M7 squads (FUT-style "plantillas"): players placed on a pitch formation.
--   kind = 'dream'  → a member's own fantasy squad; private until published, then visible to the
--                     group, likeable, shareable, and eligible for the weekly featured squad.
--   kind = 'lineup' → an admin's pitch lineup for one side of a scheduled match; the TS action
--                     applies it to the match with set_match_lineup.
-- Formation layouts, team rating and chemistry are computed in TS (lib/squads); SQL validates
-- structure (slots, positions, players of the group) and authorization.

do $$ begin
  create type public.squad_kind as enum ('dream', 'lineup');
exception when duplicate_object then null; end $$;

create table if not exists public.squads (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  owner_player_id uuid not null references public.players (id) on delete cascade,
  kind public.squad_kind not null,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  team_size int not null check (team_size in (5, 6, 7, 8, 9, 11)),
  formation text not null check (formation ~ '^[0-9](-[0-9]){1,4}$'),
  club_id uuid references public.clubs (id) on delete set null,
  match_id uuid references public.matches (id) on delete cascade,
  side smallint check (side in (1, 2)),
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'lineup') = (match_id is not null and side is not null)),
  check (kind = 'dream' or not published)
);
create index if not exists squads_group_id_idx on public.squads (group_id);
create index if not exists squads_owner_player_id_idx on public.squads (owner_player_id);
create index if not exists squads_published_idx on public.squads (group_id, published_at) where published;
create unique index if not exists squads_match_side_uidx on public.squads (match_id, side) where kind = 'lineup';

create table if not exists public.squad_slots (
  squad_id uuid not null references public.squads (id) on delete cascade,
  slot int not null check (slot between 0 and 10),
  position text not null check (position in (
    'POR', 'LI', 'DFC', 'LD', 'CAI', 'CAD', 'MCD', 'MC', 'MCO', 'MI', 'MD', 'EI', 'ED', 'SD', 'DC'
  )),
  player_id uuid not null references public.players (id) on delete cascade,
  primary key (squad_id, slot),
  unique (squad_id, player_id)
);
create index if not exists squad_slots_player_id_idx on public.squad_slots (player_id);

create table if not exists public.squad_likes (
  squad_id uuid not null references public.squads (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (squad_id, player_id)
);
create index if not exists squad_likes_player_id_idx on public.squad_likes (player_id);

-- ### Visibility
create or replace function private.can_see_squad(p_squad_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.squads s
    where s.id = p_squad_id
      and private.is_member(s.group_id)
      and (s.kind = 'lineup' or s.published or s.owner_player_id = private.my_player_id(s.group_id))
  );
$$;
revoke execute on function private.can_see_squad(uuid) from public, anon;
grant execute on function private.can_see_squad(uuid) to authenticated;

alter table public.squads enable row level security;
alter table public.squad_slots enable row level security;
alter table public.squad_likes enable row level security;

grant select on public.squads, public.squad_slots, public.squad_likes to authenticated;
grant select on public.squads, public.squad_slots, public.squad_likes to service_role;

create policy squads_select_visible on public.squads
  for select to authenticated
  using (
    private.is_member(group_id)
    and (kind = 'lineup' or published or owner_player_id = private.my_player_id(group_id))
  );

create policy squad_slots_select_visible on public.squad_slots
  for select to authenticated
  using (private.can_see_squad(squad_id));

create policy squad_likes_select_visible on public.squad_likes
  for select to authenticated
  using (private.can_see_squad(squad_id));

-- ### save_squad: create (p_squad_id null) or update; slots are replaced wholesale.
-- p_slots = [{ slot, position, player_id }] (unfilled slots are simply omitted).
create or replace function public.save_squad(
  p_squad_id uuid,
  p_group_id uuid,
  p_kind text,
  p_name text,
  p_team_size int,
  p_formation text,
  p_slots jsonb,
  p_club_id uuid default null,
  p_match_id uuid default null,
  p_side int default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  v_existing public.squads%rowtype;
  v_id uuid;
  v_elem jsonb;
  v_slot int;
  v_player uuid;
  v_slots int[] := '{}'::int[];
  v_players uuid[] := '{}'::uuid[];
  v_formation_total int;
begin
  if not private.is_member(p_group_id) then
    raise exception 'PICADO_NOT_MEMBER: you are not a member of this group';
  end if;
  v_me := private.my_player_id(p_group_id);
  if v_me is null then
    raise exception 'PICADO_FORBIDDEN: you need a player profile in this group';
  end if;
  if p_kind not in ('dream', 'lineup') then
    raise exception 'PICADO_VALIDATION: kind must be dream or lineup';
  end if;

  if p_squad_id is not null then
    select * into v_existing from public.squads s where s.id = p_squad_id;
    if v_existing.id is null or v_existing.group_id <> p_group_id or v_existing.kind::text <> p_kind then
      raise exception 'PICADO_VALIDATION: squad not found';
    end if;
  end if;

  if p_kind = 'dream' then
    if p_squad_id is not null and v_existing.owner_player_id <> v_me then
      raise exception 'PICADO_FORBIDDEN: only the owner can edit this squad';
    end if;
    if p_match_id is not null or p_side is not null then
      raise exception 'PICADO_VALIDATION: a dream squad has no match';
    end if;
  else
    if not private.is_group_admin(p_group_id) then
      raise exception 'PICADO_FORBIDDEN: only group admins can set match lineups';
    end if;
    if p_side not in (1, 2) then
      raise exception 'PICADO_VALIDATION: side must be 1 or 2';
    end if;
    if not exists (
      select 1 from public.matches m where m.id = p_match_id and m.group_id = p_group_id and m.status = 'scheduled'
    ) then
      raise exception 'PICADO_VALIDATION: lineups can only be set for a scheduled match of this group';
    end if;
    if p_squad_id is not null and (v_existing.match_id <> p_match_id or v_existing.side <> p_side) then
      raise exception 'PICADO_VALIDATION: a lineup squad cannot change match or side';
    end if;
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 1 and 40 then
    raise exception 'PICADO_VALIDATION: squad name must be 1-40 characters';
  end if;
  if p_team_size not in (5, 6, 7, 8, 9, 11) then
    raise exception 'PICADO_VALIDATION: invalid team size';
  end if;
  if p_formation is null or p_formation !~ '^[0-9](-[0-9]){1,4}$' then
    raise exception 'PICADO_VALIDATION: invalid formation';
  end if;
  select sum(d::int) into v_formation_total from unnest(string_to_array(p_formation, '-')) d;
  if v_formation_total <> p_team_size - 1 then
    raise exception 'PICADO_VALIDATION: formation does not match the team size';
  end if;
  if p_club_id is not null and not exists (select 1 from public.clubs c where c.id = p_club_id and c.group_id = p_group_id) then
    raise exception 'PICADO_VALIDATION: club not found in this group';
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'PICADO_VALIDATION: slots must be a json array';
  end if;
  for v_elem in select * from jsonb_array_elements(p_slots)
  loop
    v_slot := (v_elem ->> 'slot')::int;
    v_player := nullif(v_elem ->> 'player_id', '')::uuid;
    if v_slot is null or v_slot < 0 or v_slot >= p_team_size or v_slot = any (v_slots) then
      raise exception 'PICADO_VALIDATION: invalid or repeated slot';
    end if;
    if v_player is null or v_player = any (v_players) then
      raise exception 'PICADO_VALIDATION: a player can only be placed once';
    end if;
    if (v_elem ->> 'position') is null or (v_elem ->> 'position') not in (
      'POR', 'LI', 'DFC', 'LD', 'CAI', 'CAD', 'MCD', 'MC', 'MCO', 'MI', 'MD', 'EI', 'ED', 'SD', 'DC'
    ) then
      raise exception 'PICADO_VALIDATION: invalid position';
    end if;
    if not exists (
      select 1 from public.players p where p.id = v_player and p.group_id = p_group_id and p.left_at is null
    ) then
      raise exception 'PICADO_VALIDATION: player is not an active member of this group';
    end if;
    v_slots := v_slots || v_slot;
    v_players := v_players || v_player;
  end loop;

  if p_squad_id is null then
    insert into public.squads (group_id, owner_player_id, kind, name, team_size, formation, club_id, match_id, side)
    values (p_group_id, v_me, p_kind::public.squad_kind, btrim(p_name), p_team_size, p_formation, p_club_id, p_match_id, p_side)
    returning id into v_id;
  else
    v_id := p_squad_id;
    update public.squads
    set name = btrim(p_name), team_size = p_team_size, formation = p_formation, club_id = p_club_id, updated_at = now()
    where id = v_id;
    delete from public.squad_slots where squad_id = v_id;
  end if;

  insert into public.squad_slots (squad_id, slot, position, player_id)
  select v_id, (e ->> 'slot')::int, e ->> 'position', (e ->> 'player_id')::uuid
  from jsonb_array_elements(p_slots) e;

  return v_id;
end;
$$;

create or replace function public.delete_squad(p_squad_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_squad public.squads%rowtype;
begin
  select * into v_squad from public.squads s where s.id = p_squad_id;
  if v_squad.id is null then
    raise exception 'PICADO_VALIDATION: squad not found';
  end if;
  -- Owners delete their dream squads; admins can also remove any squad (moderation, lineups).
  if not (
    (v_squad.kind = 'dream' and v_squad.owner_player_id = private.my_player_id(v_squad.group_id))
    or private.is_group_admin(v_squad.group_id)
  ) then
    raise exception 'PICADO_FORBIDDEN: you cannot delete this squad';
  end if;
  delete from public.squads where id = p_squad_id;
end;
$$;

create or replace function public.set_squad_published(p_squad_id uuid, p_published boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_squad public.squads%rowtype;
begin
  select * into v_squad from public.squads s where s.id = p_squad_id;
  if v_squad.id is null or v_squad.kind <> 'dream' then
    raise exception 'PICADO_VALIDATION: squad not found';
  end if;
  if v_squad.owner_player_id is distinct from private.my_player_id(v_squad.group_id) then
    raise exception 'PICADO_FORBIDDEN: only the owner can publish this squad';
  end if;
  update public.squads
  set published = p_published,
      published_at = case when p_published then coalesce(published_at, now()) else null end
  where id = p_squad_id;
  if not p_published then
    delete from public.squad_likes where squad_id = p_squad_id;
  end if;
end;
$$;

create or replace function public.like_squad(p_squad_id uuid, p_like boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_squad public.squads%rowtype;
  v_me uuid;
begin
  select * into v_squad from public.squads s where s.id = p_squad_id;
  if v_squad.id is null or not v_squad.published or not private.is_member(v_squad.group_id) then
    raise exception 'PICADO_VALIDATION: squad not found';
  end if;
  v_me := private.my_player_id(v_squad.group_id);
  if v_me is null then
    raise exception 'PICADO_FORBIDDEN: you need a player profile in this group';
  end if;
  if v_me = v_squad.owner_player_id then
    raise exception 'PICADO_SELF_VOTE: you cannot like your own squad';
  end if;
  if p_like then
    insert into public.squad_likes (squad_id, player_id) values (p_squad_id, v_me) on conflict do nothing;
  else
    delete from public.squad_likes where squad_id = p_squad_id and player_id = v_me;
  end if;
end;
$$;

-- Pairs of group players and how many finalized matches they played on the same side (the
-- "link" input of squad chemistry). Members only.
create or replace function public.get_shared_appearances(p_group_id uuid)
returns table (player_a uuid, player_b uuid, matches int)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not private.is_member(p_group_id) then
    raise exception 'PICADO_NOT_MEMBER: you are not a member of this group';
  end if;
  return query
    select a.player_id, b.player_id, count(distinct a.match_id)::int
    from public.match_participants a
    join public.match_participants b
      on b.match_id = a.match_id and b.team_id = a.team_id and b.player_id > a.player_id
    join public.matches m on m.id = a.match_id
    where m.group_id = p_group_id and m.status = 'finalized'
      and a.role = 'player' and b.role = 'player' and a.team_id is not null
    group by a.player_id, b.player_id;
end;
$$;

-- The most-liked squad published in the last p_window_days (ties → earliest published). Members only.
create or replace function public.get_featured_squad(p_group_id uuid, p_window_days int default 7)
returns table (squad_id uuid, likes int)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not private.is_member(p_group_id) then
    raise exception 'PICADO_NOT_MEMBER: you are not a member of this group';
  end if;
  if p_window_days is null or p_window_days not between 1 and 60 then
    raise exception 'PICADO_VALIDATION: window must be between 1 and 60 days';
  end if;
  return query
    select s.id, count(l.player_id)::int as n
    from public.squads s
    join public.squad_likes l on l.squad_id = s.id
    where s.group_id = p_group_id and s.kind = 'dream' and s.published
      and s.published_at >= now() - make_interval(days => p_window_days)
    group by s.id, s.published_at
    order by n desc, s.published_at asc
    limit 1;
end;
$$;

revoke execute on function public.save_squad(uuid, uuid, text, text, int, text, jsonb, uuid, uuid, int) from public, anon;
revoke execute on function public.delete_squad(uuid) from public, anon;
revoke execute on function public.set_squad_published(uuid, boolean) from public, anon;
revoke execute on function public.like_squad(uuid, boolean) from public, anon;
revoke execute on function public.get_shared_appearances(uuid) from public, anon;
revoke execute on function public.get_featured_squad(uuid, int) from public, anon;
grant execute on function public.save_squad(uuid, uuid, text, text, int, text, jsonb, uuid, uuid, int) to authenticated;
grant execute on function public.delete_squad(uuid) to authenticated;
grant execute on function public.set_squad_published(uuid, boolean) to authenticated;
grant execute on function public.like_squad(uuid, boolean) to authenticated;
grant execute on function public.get_shared_appearances(uuid) to authenticated;
grant execute on function public.get_featured_squad(uuid, int) to authenticated;
