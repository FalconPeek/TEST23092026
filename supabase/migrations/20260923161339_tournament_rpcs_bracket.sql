-- Public RPCs for bracket generation and linking a tournament fixture to a real match. Every
-- function is SECURITY DEFINER, search_path pinned to '', fully-qualified names, revoked from
-- public/anon, granted to authenticated (and, where the finalizer may also need to call it, to
-- service_role via private.can_manage_tournament / private.is_service_role).

-- ### public.persist_bracket(p_tournament_id, p_payload) — admin (or service_role) only.
-- p_payload mirrors lib/brackets/types.ts's TournamentState almost verbatim:
-- { "stages": Stage[], "groups": Group[], "matches": Match[] } with the *original* camelCase keys
-- (id, stageId, groupId, entry1Id, entry2Id, nextMatchId, ...) -- see the design note at the top of
-- 20260923161327_tournament_tables.sql. Rejects a tournament that already has a bracket (stages
-- exist): generation happens exactly once, re-generation is not supported (swiss round 2+ and
-- groups_ko qualifiers append/resolve into the existing bracket instead, see
-- 20260923161342_tournament_rpcs_advance.sql). Runs as a single transaction (the whole function
-- body), so the bracket can never be left half-inserted.
create or replace function public.persist_bracket(p_tournament_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.tournament_status;
  v_stage jsonb;
  v_group jsonb;
  v_match jsonb;
  v_stage_id uuid;
  v_group_id_local uuid;
  v_match_id uuid;
begin
  select t.status into v_status from public.tournaments t where t.id = p_tournament_id;
  if v_status is null then
    raise exception 'PICADO_VALIDATION: tournament not found';
  end if;
  if not private.can_manage_tournament(p_tournament_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can generate the bracket';
  end if;
  -- Checked before the status check: once a bracket exists the tournament is already
  -- in_progress, and we want callers to see ALREADY_GENERATED, not a generic status error.
  if exists (select 1 from public.stages s where s.tournament_id = p_tournament_id) then
    raise exception 'PICADO_ALREADY_GENERATED: this tournament already has a bracket';
  end if;
  if v_status not in ('draft', 'registration') then
    raise exception 'PICADO_VALIDATION: the bracket can only be generated while the tournament is in draft or registration';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'PICADO_VALIDATION: payload must be a json object';
  end if;
  if jsonb_typeof(coalesce(p_payload -> 'stages', 'null'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_payload -> 'groups', 'null'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_payload -> 'matches', 'null'::jsonb)) <> 'array' then
    raise exception 'PICADO_VALIDATION: payload must contain stages, groups and matches arrays';
  end if;
  if jsonb_array_length(p_payload -> 'stages') = 0 or jsonb_array_length(p_payload -> 'matches') = 0 then
    raise exception 'PICADO_VALIDATION: payload must contain at least one stage and one match';
  end if;

  -- Explicitly dropped first (rather than relying on `on commit drop`): this function can be
  -- called more than once per transaction (e.g. a pgTAP test file, or several tournaments
  -- generated back-to-back before anything commits), and a leftover temp table from a previous
  -- call in the same session/transaction would otherwise collide.
  drop table if exists pg_temp.tmp_stage_map;
  drop table if exists pg_temp.tmp_group_map;
  drop table if exists pg_temp.tmp_match_map;
  create temporary table tmp_stage_map (engine_key text primary key, id uuid) on commit drop;
  create temporary table tmp_group_map (engine_key text primary key, id uuid) on commit drop;
  create temporary table tmp_match_map (engine_key text primary key, id uuid) on commit drop;

  for v_stage in select * from jsonb_array_elements(p_payload -> 'stages')
  loop
    insert into public.stages (tournament_id, kind, stage_order, settings, engine_key)
    values (
      p_tournament_id,
      (v_stage ->> 'kind')::public.stage_kind,
      (v_stage ->> 'order')::int,
      coalesce(v_stage -> 'settings', '{}'::jsonb),
      v_stage ->> 'id'
    )
    returning id into v_stage_id;
    insert into tmp_stage_map values (v_stage ->> 'id', v_stage_id);
  end loop;

  for v_group in select * from jsonb_array_elements(p_payload -> 'groups')
  loop
    select id into v_stage_id from tmp_stage_map where engine_key = (v_group ->> 'stageId');
    if v_stage_id is null then
      raise exception 'PICADO_VALIDATION: group references unknown stage %', v_group ->> 'stageId';
    end if;
    insert into public.stage_groups (tournament_id, stage_id, number, label, engine_key)
    values (p_tournament_id, v_stage_id, (v_group ->> 'number')::int, v_group ->> 'label', v_group ->> 'id')
    returning id into v_group_id_local;
    insert into tmp_group_map values (v_group ->> 'id', v_group_id_local);
  end loop;

  -- Pass 1: insert every match without its next_*_id links (those are self-referencing FKs that
  -- may point at matches later in this same array), keyed by engine id.
  for v_match in select * from jsonb_array_elements(p_payload -> 'matches')
  loop
    select id into v_stage_id from tmp_stage_map where engine_key = (v_match ->> 'stageId');
    if v_stage_id is null then
      raise exception 'PICADO_VALIDATION: match references unknown stage %', v_match ->> 'stageId';
    end if;
    v_group_id_local := null;
    if (v_match ->> 'groupId') is not null then
      select id into v_group_id_local from tmp_group_map where engine_key = (v_match ->> 'groupId');
    end if;

    v_match_id := private.tm_insert_match(p_tournament_id, v_stage_id, v_group_id_local, v_match);
    insert into tmp_match_map values (v_match ->> 'id', v_match_id);
  end loop;

  -- Pass 2: resolve next_match_id / next_loser_match_id via engine-key lookups now that every
  -- match has a row.
  for v_match in select * from jsonb_array_elements(p_payload -> 'matches')
  loop
    if (v_match ->> 'nextMatchId') is not null or (v_match ->> 'nextLoserMatchId') is not null then
      update public.tournament_matches tm
      set next_match_id = (select id from tmp_match_map where engine_key = (v_match ->> 'nextMatchId')),
          next_slot = nullif(v_match ->> 'nextSlot', '')::smallint,
          next_loser_match_id = (select id from tmp_match_map where engine_key = (v_match ->> 'nextLoserMatchId')),
          next_loser_slot = nullif(v_match ->> 'nextLoserSlot', '')::smallint
      where tm.tournament_id = p_tournament_id and tm.engine_key = (v_match ->> 'id');
    end if;
  end loop;

  update public.tournaments set status = 'in_progress' where id = p_tournament_id;
end;
$$;

revoke execute on function public.persist_bracket(uuid, jsonb) from public;
grant execute on function public.persist_bracket(uuid, jsonb) to authenticated, service_role;

-- ### public.link_tournament_match(p_tournament_match_id, p_scheduled_at, p_venue) returns uuid
-- Admin only. Creates the real `matches` row (+ its two match_teams + match_participants, named
-- and rostered from the tournament entries) for a `ready` tournament match, and links both ways
-- (tournament_matches.match_id / matches.tournament_match_id). Mirrors create_match's validation.
create or replace function public.link_tournament_match(
  p_tournament_match_id uuid,
  p_scheduled_at timestamptz,
  p_venue text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tournament_id uuid;
  v_group_id uuid;
  v_team_size int;
  v_status public.tournament_match_status;
  v_e1 text;
  v_e2 text;
  v_existing_match uuid;
  v_entry1_name text;
  v_entry2_name text;
  v_entry1_players uuid[];
  v_entry2_players uuid[];
  v_match_id uuid;
  v_team1_id uuid;
  v_team2_id uuid;
  v_pid uuid;
  v_row_group_id uuid;
  v_left_at timestamptz;
begin
  select tm.tournament_id, tm.status, tm.entry1_id, tm.entry2_id, tm.match_id
  into v_tournament_id, v_status, v_e1, v_e2, v_existing_match
  from public.tournament_matches tm
  where tm.id = p_tournament_match_id
  for update;

  if v_tournament_id is null then
    raise exception 'PICADO_VALIDATION: tournament match not found';
  end if;

  select t.group_id, t.team_size into v_group_id, v_team_size from public.tournaments t where t.id = v_tournament_id;
  if not private.is_group_admin(v_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can link a real match to a tournament match';
  end if;
  if v_status <> 'ready' then
    raise exception 'PICADO_VALIDATION: the tournament match must be ready (both entries resolved) to link a real match';
  end if;
  if v_existing_match is not null then
    raise exception 'PICADO_VALIDATION: this tournament match is already linked to a real match';
  end if;
  if v_e1 is null or v_e1 = '__bye__' or v_e2 is null or v_e2 = '__bye__' then
    raise exception 'PICADO_VALIDATION: a match involving a bye does not need a real match';
  end if;
  if p_scheduled_at is null then
    raise exception 'PICADO_VALIDATION: scheduled_at is required';
  end if;

  select te.name, te.player_ids into v_entry1_name, v_entry1_players
  from public.tournament_entries te where te.id = v_e1::uuid;
  select te.name, te.player_ids into v_entry2_name, v_entry2_players
  from public.tournament_entries te where te.id = v_e2::uuid;

  foreach v_pid in array coalesce(v_entry1_players, '{}'::uuid[]) || coalesce(v_entry2_players, '{}'::uuid[])
  loop
    select p.group_id, p.left_at into v_row_group_id, v_left_at from public.players p where p.id = v_pid;
    if v_row_group_id is null or v_row_group_id <> v_group_id then
      raise exception 'PICADO_VALIDATION: entry player does not belong to this group';
    end if;
    if v_left_at is not null then
      raise exception 'PICADO_VALIDATION: entry player has left the group';
    end if;
  end loop;

  insert into public.matches (group_id, tournament_match_id, team_size, scheduled_at, venue, created_by)
  values (v_group_id, p_tournament_match_id, v_team_size, p_scheduled_at, nullif(trim(p_venue), ''), v_uid)
  returning id into v_match_id;

  insert into public.match_teams (match_id, side, name) values (v_match_id, 1, v_entry1_name) returning id into v_team1_id;
  insert into public.match_teams (match_id, side, name) values (v_match_id, 2, v_entry2_name) returning id into v_team2_id;

  insert into public.match_participants (match_id, player_id, team_id, role)
  select v_match_id, pid, v_team1_id, 'player' from unnest(coalesce(v_entry1_players, '{}'::uuid[])) pid;

  insert into public.match_participants (match_id, player_id, team_id, role)
  select v_match_id, pid, v_team2_id, 'player' from unnest(coalesce(v_entry2_players, '{}'::uuid[])) pid;

  update public.tournament_matches set match_id = v_match_id, status = 'in_progress' where id = p_tournament_match_id;

  return v_match_id;
end;
$$;

revoke execute on function public.link_tournament_match(uuid, timestamptz, text) from public;
grant execute on function public.link_tournament_match(uuid, timestamptz, text) to authenticated;
