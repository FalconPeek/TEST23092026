-- Public RPCs for match writes. Every function is SECURITY DEFINER, search_path pinned to '',
-- fully-qualified names, revoked from public/anon, granted to authenticated only. Errors are
-- raised with a stable `PICADO_<CODE>: ` prefix that Server Actions map to Spanish messages.

-- ### public.create_match(p_group_id, p_scheduled_at, p_team_size, p_venue) returns uuid
-- Admin only for now (no members_can_create_matches setting yet).
create or replace function public.create_match(
  p_group_id uuid,
  p_scheduled_at timestamptz,
  p_team_size int,
  p_venue text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if not private.is_group_admin(p_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can create matches';
  end if;
  if p_team_size is null or p_team_size < 3 or p_team_size > 11 then
    raise exception 'PICADO_VALIDATION: team_size must be between 3 and 11';
  end if;
  if p_scheduled_at is null then
    raise exception 'PICADO_VALIDATION: scheduled_at is required';
  end if;

  insert into public.matches (group_id, scheduled_at, team_size, venue, created_by)
  values (p_group_id, p_scheduled_at, p_team_size, nullif(trim(p_venue), ''), v_uid)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_match(uuid, timestamptz, int, text) from public;
grant execute on function public.create_match(uuid, timestamptz, int, text) to authenticated;

-- ### public.set_match_lineup(p_match_id, p_team1, p_team2, p_spectators)
-- Admin only, and only while the match is still `scheduled`. p_team1/p_team2 shape:
-- { "name": text, "color": text|null, "players": [{ "player_id": uuid, "position": text|null }] }
-- p_spectators is a flat array of player_id. Replaces the whole lineup (teams + participants)
-- atomically: previous rows for this match are deleted and the new ones inserted.
create or replace function public.set_match_lineup(
  p_match_id uuid,
  p_team1 jsonb,
  p_team2 jsonb,
  p_spectators uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_status public.match_status;
  v_team1_id uuid;
  v_team2_id uuid;
  v_all_ids uuid[];
  v_elem jsonb;
  v_player_id uuid;
  v_position text;
  v_left_at timestamptz;
  v_row_group_id uuid;
  v_role public.group_role;
  v_user_id uuid;
begin
  select m.group_id, m.status into v_group_id, v_status
  from public.matches m
  where m.id = p_match_id;

  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: match not found';
  end if;
  if not private.is_group_admin(v_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can set the match lineup';
  end if;
  if v_status <> 'scheduled' then
    raise exception 'PICADO_VALIDATION: the lineup can only be set while the match is scheduled';
  end if;

  if p_team1 is null or p_team2 is null
    or jsonb_typeof(p_team1) <> 'object' or jsonb_typeof(p_team2) <> 'object' then
    raise exception 'PICADO_VALIDATION: team1 and team2 must be json objects';
  end if;
  if coalesce(nullif(trim(p_team1 ->> 'name'), ''), null) is null
    or coalesce(nullif(trim(p_team2 ->> 'name'), ''), null) is null then
    raise exception 'PICADO_VALIDATION: both teams need a name';
  end if;
  if jsonb_typeof(coalesce(p_team1 -> 'players', 'null'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_team2 -> 'players', 'null'::jsonb)) <> 'array' then
    raise exception 'PICADO_VALIDATION: team players must be a json array';
  end if;

  -- Every player_id referenced anywhere in the lineup (teams + spectators) must be unique: no
  -- player on both teams, and no player listed both as a team player and as a spectator.
  select array_agg(pid) into v_all_ids
  from (
    select (elem ->> 'player_id')::uuid as pid from jsonb_array_elements(p_team1 -> 'players') elem
    union all
    select (elem ->> 'player_id')::uuid as pid from jsonb_array_elements(p_team2 -> 'players') elem
    union all
    select unnest(coalesce(p_spectators, '{}'::uuid[])) as pid
  ) all_ids;

  if v_all_ids is null or array_length(v_all_ids, 1) = 0 then
    raise exception 'PICADO_VALIDATION: the lineup must include at least one player';
  end if;
  if array_length(v_all_ids, 1) <> (select count(distinct x) from unnest(v_all_ids) x) then
    raise exception 'PICADO_VALIDATION: a player cannot appear more than once in the lineup';
  end if;

  -- Validate every team player: belongs to the group, hasn't left, and (if a linked group
  -- member) isn't a spectator-role member -- spectator-role members can only be spectators.
  for v_elem in
    select elem from jsonb_array_elements(p_team1 -> 'players') elem
    union all
    select elem from jsonb_array_elements(p_team2 -> 'players') elem
  loop
    v_player_id := (v_elem ->> 'player_id')::uuid;
    v_position := nullif(v_elem ->> 'position', '');
    if v_player_id is null then
      raise exception 'PICADO_VALIDATION: player_id is required for every team player';
    end if;
    if v_position is not null and v_position not in (
      'POR', 'LI', 'DFC', 'LD', 'CAI', 'CAD', 'MCD', 'MC', 'MCO', 'MI', 'MD', 'EI', 'ED', 'SD', 'DC'
    ) then
      raise exception 'PICADO_VALIDATION: invalid position code %', v_position;
    end if;

    select p.group_id, p.left_at, p.user_id into v_row_group_id, v_left_at, v_user_id
    from public.players p
    where p.id = v_player_id;

    if v_row_group_id is null or v_row_group_id <> v_group_id then
      raise exception 'PICADO_VALIDATION: player does not belong to this group';
    end if;
    if v_left_at is not null then
      raise exception 'PICADO_VALIDATION: player has left the group';
    end if;
    if v_user_id is not null then
      select gm.role into v_role from public.group_members gm
      where gm.group_id = v_group_id and gm.user_id = v_user_id;
      if v_role = 'spectator' then
        raise exception 'PICADO_VALIDATION: a spectator-role member cannot be a team player';
      end if;
    end if;
  end loop;

  -- Validate spectators: belong to the group, haven't left. (Any group role may attend as a
  -- spectator for a given match; only team players are restricted against spectator-role
  -- members, see above.)
  foreach v_player_id in array coalesce(p_spectators, '{}'::uuid[])
  loop
    select p.group_id, p.left_at into v_row_group_id, v_left_at
    from public.players p
    where p.id = v_player_id;

    if v_row_group_id is null or v_row_group_id <> v_group_id then
      raise exception 'PICADO_VALIDATION: spectator does not belong to this group';
    end if;
    if v_left_at is not null then
      raise exception 'PICADO_VALIDATION: spectator has left the group';
    end if;
  end loop;

  delete from public.match_participants where match_id = p_match_id;
  delete from public.match_teams where match_id = p_match_id;

  insert into public.match_teams (match_id, side, name, color)
  values (p_match_id, 1, trim(p_team1 ->> 'name'), nullif(p_team1 ->> 'color', ''))
  returning id into v_team1_id;

  insert into public.match_teams (match_id, side, name, color)
  values (p_match_id, 2, trim(p_team2 ->> 'name'), nullif(p_team2 ->> 'color', ''))
  returning id into v_team2_id;

  insert into public.match_participants (match_id, player_id, team_id, role, position)
  select p_match_id, (elem ->> 'player_id')::uuid, v_team1_id, 'player', nullif(elem ->> 'position', '')
  from jsonb_array_elements(p_team1 -> 'players') elem;

  insert into public.match_participants (match_id, player_id, team_id, role, position)
  select p_match_id, (elem ->> 'player_id')::uuid, v_team2_id, 'player', nullif(elem ->> 'position', '')
  from jsonb_array_elements(p_team2 -> 'players') elem;

  insert into public.match_participants (match_id, player_id, team_id, role, position)
  select p_match_id, pid, null, 'spectator', null
  from unnest(coalesce(p_spectators, '{}'::uuid[])) pid;
end;
$$;

revoke execute on function public.set_match_lineup(uuid, jsonb, jsonb, uuid[]) from public;
grant execute on function public.set_match_lineup(uuid, jsonb, jsonb, uuid[]) to authenticated;

-- ### public.cancel_match(p_match_id) — admin only; not for finalized/already-cancelled matches.
create or replace function public.cancel_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_status public.match_status;
begin
  select m.group_id, m.status into v_group_id, v_status from public.matches m where m.id = p_match_id;
  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: match not found';
  end if;
  if not private.is_group_admin(v_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can cancel a match';
  end if;
  if v_status in ('finalized', 'cancelled') then
    raise exception 'PICADO_VALIDATION: a finalized or already cancelled match cannot be cancelled';
  end if;

  update public.matches set status = 'cancelled' where id = p_match_id;
end;
$$;

revoke execute on function public.cancel_match(uuid) from public;
grant execute on function public.cancel_match(uuid) to authenticated;

-- ### public.start_reporting(p_match_id, p_played_at) — admin only; scheduled -> reporting.
-- report_deadline/rating_deadline are computed from groups.settings->windows (defaults 48h/72h).
create or replace function public.start_reporting(p_match_id uuid, p_played_at timestamptz default pg_catalog.now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_status public.match_status;
  v_settings jsonb;
  v_report_hours int;
  v_rating_hours int;
  v_played_at timestamptz := coalesce(p_played_at, pg_catalog.now());
begin
  select m.group_id, m.status into v_group_id, v_status from public.matches m where m.id = p_match_id;
  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: match not found';
  end if;
  if not private.is_group_admin(v_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can start reporting';
  end if;
  if v_status <> 'scheduled' then
    raise exception 'PICADO_VALIDATION: only a scheduled match can move to reporting';
  end if;

  select g.settings into v_settings from public.groups g where g.id = v_group_id;
  v_report_hours := coalesce((v_settings -> 'windows' ->> 'report_hours')::int, 48);
  v_rating_hours := coalesce((v_settings -> 'windows' ->> 'rating_hours')::int, 72);

  update public.matches
  set status = 'reporting',
      played_at = v_played_at,
      report_deadline = v_played_at + make_interval(hours => v_report_hours),
      rating_deadline = v_played_at + make_interval(hours => v_rating_hours)
  where id = p_match_id;
end;
$$;

revoke execute on function public.start_reporting(uuid, timestamptz) from public;
grant execute on function public.start_reporting(uuid, timestamptz) to authenticated;
