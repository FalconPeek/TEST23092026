-- Public RPCs for scouting/extras votes + read-model helpers for the voting UI. Every function
-- is SECURITY DEFINER, search_path pinned to '', fully-qualified names, revoked from
-- public/anon, granted to authenticated only. Errors use a stable `PICADO_<CODE>: ` prefix.

-- ### public.submit_scouting_votes(p_target_player_id, p_mode, p_votes)
-- p_votes = { "<attribute>": 1..10, ... }. quick mode keys must be the 6 face-stat keys
-- (pac/sho/pas/dri/def/phy); detailed mode keys must be sub-attributes, with GK attributes
-- (gk_*) only allowed when the target's primary/alt position is POR. Supersedes any current
-- ballot rows for the submitted attributes (history is kept) and inserts fresh ones.
create or replace function public.submit_scouting_votes(p_target_player_id uuid, p_mode text, p_votes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rater_id uuid;
  v_group_id uuid;
  v_settings jsonb;
  v_revote_days int;
  v_last_vote timestamptz;
  v_key text;
  v_val jsonb;
  v_value int;
  v_target_primary text;
  v_target_alt text[];
  v_is_gk boolean;
  v_allowed text[];
  v_has_votes boolean := false;
begin
  select e.rater_player_id, e.group_id into v_rater_id, v_group_id
  from private.check_scouting_eligibility(p_target_player_id) e;

  if p_mode not in ('quick', 'detailed') then
    raise exception 'PICADO_VALIDATION: mode must be quick or detailed';
  end if;
  if p_votes is null or jsonb_typeof(p_votes) <> 'object' then
    raise exception 'PICADO_VALIDATION: votes must be a json object';
  end if;

  select p.primary_position, p.alt_positions into v_target_primary, v_target_alt
  from public.players p
  where p.id = p_target_player_id;

  v_is_gk := (v_target_primary = 'POR') or ('POR' = any (coalesce(v_target_alt, '{}'::text[])));

  if p_mode = 'quick' then
    v_allowed := array['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
  else
    v_allowed := array[
      'acceleration', 'sprint_speed',
      'positioning', 'finishing', 'shot_power', 'long_shots', 'volleys', 'penalties',
      'vision', 'crossing', 'free_kick', 'short_passing', 'long_passing', 'curve',
      'agility', 'balance', 'reactions', 'ball_control', 'dribbling', 'composure',
      'interceptions', 'heading', 'def_awareness', 'standing_tackle', 'sliding_tackle',
      'jumping', 'stamina', 'strength', 'aggression'
    ];
    if v_is_gk then
      v_allowed := v_allowed || array['gk_diving', 'gk_handling', 'gk_kicking', 'gk_reflexes', 'gk_positioning'];
    end if;
  end if;

  for v_key, v_val in select * from jsonb_each(p_votes)
  loop
    v_has_votes := true;
    if not (v_key = any (v_allowed)) then
      raise exception 'PICADO_VALIDATION: attribute % is not valid for this mode/target', v_key;
    end if;
    if jsonb_typeof(v_val) <> 'number' then
      raise exception 'PICADO_VALIDATION: vote value for % must be a number', v_key;
    end if;
    v_value := round((v_val #>> '{}')::numeric);
    if v_value < 1 or v_value > 10 then
      raise exception 'PICADO_VALIDATION: vote value must be between 1 and 10';
    end if;
  end loop;

  if not v_has_votes then
    raise exception 'PICADO_VALIDATION: at least one vote is required';
  end if;

  select g.settings into v_settings from public.groups g where g.id = v_group_id;
  v_revote_days := coalesce((v_settings -> 'scouting' ->> 'revote_days')::int, 30);

  select max(sv.created_at) into v_last_vote
  from public.scouting_votes sv
  where sv.rater_player_id = v_rater_id
    and sv.target_player_id = p_target_player_id
    and sv.superseded_at is null;

  if v_last_vote is not null and v_last_vote > pg_catalog.now() - make_interval(days => v_revote_days) then
    raise exception 'PICADO_COOLDOWN: you must wait before revoting this player';
  end if;

  update public.scouting_votes
  set superseded_at = pg_catalog.now()
  where rater_player_id = v_rater_id
    and target_player_id = p_target_player_id
    and superseded_at is null
    and attribute in (select jsonb_object_keys(p_votes));

  insert into public.scouting_votes (group_id, rater_player_id, target_player_id, attribute, value, mode)
  select v_group_id, v_rater_id, p_target_player_id, kv.key, round((kv.value #>> '{}')::numeric), p_mode::public.vote_mode
  from jsonb_each(p_votes) kv;
end;
$$;

revoke execute on function public.submit_scouting_votes(uuid, text, jsonb) from public;
grant execute on function public.submit_scouting_votes(uuid, text, jsonb) to authenticated;

-- ### public.submit_playstyle_votes(p_target_player_id, p_playstyles) — replaces the whole set.
create or replace function public.submit_playstyle_votes(p_target_player_id uuid, p_playstyles text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rater_id uuid;
  v_group_id uuid;
  v_ps text;
  v_list text[] := coalesce(p_playstyles, '{}'::text[]);
begin
  select e.rater_player_id, e.group_id into v_rater_id, v_group_id
  from private.check_scouting_eligibility(p_target_player_id) e;

  if array_length(v_list, 1) is not null and array_length(v_list, 1) > 5 then
    raise exception 'PICADO_VALIDATION: at most 5 playstyles can be selected';
  end if;
  if array_length(v_list, 1) is not null
    and array_length(v_list, 1) <> (select count(distinct x) from unnest(v_list) x) then
    raise exception 'PICADO_VALIDATION: duplicate playstyle in selection';
  end if;

  foreach v_ps in array v_list loop
    if not (v_ps = any (private.playstyle_codes())) then
      raise exception 'PICADO_VALIDATION: unknown playstyle %', v_ps;
    end if;
  end loop;

  delete from public.playstyle_votes
  where rater_player_id = v_rater_id and target_player_id = p_target_player_id;

  insert into public.playstyle_votes (rater_player_id, target_player_id, playstyle)
  select v_rater_id, p_target_player_id, ps from unnest(v_list) ps;
end;
$$;

revoke execute on function public.submit_playstyle_votes(uuid, text[]) from public;
grant execute on function public.submit_playstyle_votes(uuid, text[]) to authenticated;

-- ### public.submit_star_votes(p_target_player_id, p_weak_foot, p_skill_moves) — upserts either
-- or both; pass null to leave one of them unchanged.
create or replace function public.submit_star_votes(p_target_player_id uuid, p_weak_foot int, p_skill_moves int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rater_id uuid;
  v_group_id uuid;
begin
  select e.rater_player_id, e.group_id into v_rater_id, v_group_id
  from private.check_scouting_eligibility(p_target_player_id) e;

  if p_weak_foot is null and p_skill_moves is null then
    raise exception 'PICADO_VALIDATION: provide at least one of weak_foot or skill_moves';
  end if;
  if p_weak_foot is not null and (p_weak_foot < 1 or p_weak_foot > 5) then
    raise exception 'PICADO_VALIDATION: weak_foot must be between 1 and 5';
  end if;
  if p_skill_moves is not null and (p_skill_moves < 1 or p_skill_moves > 5) then
    raise exception 'PICADO_VALIDATION: skill_moves must be between 1 and 5';
  end if;

  if p_weak_foot is not null then
    insert into public.star_votes (rater_player_id, target_player_id, kind, value)
    values (v_rater_id, p_target_player_id, 'weak_foot', p_weak_foot)
    on conflict (rater_player_id, target_player_id, kind)
    do update set value = excluded.value, created_at = pg_catalog.now();
  end if;

  if p_skill_moves is not null then
    insert into public.star_votes (rater_player_id, target_player_id, kind, value)
    values (v_rater_id, p_target_player_id, 'skill_moves', p_skill_moves)
    on conflict (rater_player_id, target_player_id, kind)
    do update set value = excluded.value, created_at = pg_catalog.now();
  end if;
end;
$$;

revoke execute on function public.submit_star_votes(uuid, int, int) from public;
grant execute on function public.submit_star_votes(uuid, int, int) to authenticated;

-- ### public.get_my_scouting_ballot(p_target_player_id) returns table(attribute, value, mode, created_at)
-- The caller's own current ballot for a target (across all their groups sharing that target,
-- naturally scoped by the caller having at most one player per group).
create or replace function public.get_my_scouting_ballot(p_target_player_id uuid)
returns table (attribute text, value int, mode public.vote_mode, created_at timestamptz)
language sql
security definer
set search_path = ''
stable
as $$
  select sv.attribute, sv.value, sv.mode, sv.created_at
  from public.scouting_votes sv
  join public.players p on p.id = sv.rater_player_id
  where sv.target_player_id = p_target_player_id
    and sv.superseded_at is null
    and p.user_id = (select auth.uid());
$$;

revoke execute on function public.get_my_scouting_ballot(uuid) from public;
grant execute on function public.get_my_scouting_ballot(uuid) to authenticated;

-- ### public.get_scouting_status(p_target_player_id) returns table(can_vote, reason, next_vote_at)
-- Non-throwing mirror of private.check_scouting_eligibility (+ cooldown) so the UI can explain
-- why voting is disabled. reason in: not_found | target_left | not_member | self | spectator |
-- no_shared_match | cooldown | ok.
create or replace function public.get_scouting_status(p_target_player_id uuid)
returns table (can_vote boolean, reason text, next_vote_at timestamptz)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_uid uuid := (select auth.uid());
  v_group_id uuid;
  v_target_left timestamptz;
  v_rater_id uuid;
  v_rater_role public.group_role;
  v_settings jsonb;
  v_require_shared boolean;
  v_revote_days int;
  v_last_vote timestamptz;
  v_next timestamptz;
begin
  select p.group_id, p.left_at into v_group_id, v_target_left
  from public.players p
  where p.id = p_target_player_id;

  if v_group_id is null then
    return query select false, 'not_found'::text, null::timestamptz;
    return;
  end if;
  if v_target_left is not null then
    return query select false, 'target_left'::text, null::timestamptz;
    return;
  end if;

  select p.id into v_rater_id
  from public.players p
  where p.group_id = v_group_id and p.user_id = v_uid and p.left_at is null;

  if v_rater_id is null then
    return query select false, 'not_member'::text, null::timestamptz;
    return;
  end if;
  if v_rater_id = p_target_player_id then
    return query select false, 'self'::text, null::timestamptz;
    return;
  end if;

  select gm.role into v_rater_role
  from public.group_members gm
  where gm.group_id = v_group_id and gm.user_id = v_uid;

  if v_rater_role is null or v_rater_role = 'spectator' then
    return query select false, 'spectator'::text, null::timestamptz;
    return;
  end if;

  select g.settings into v_settings from public.groups g where g.id = v_group_id;
  v_require_shared := coalesce((v_settings -> 'scouting' ->> 'require_shared_match')::boolean, true);

  if v_require_shared and not private.shared_match(v_rater_id, p_target_player_id) then
    return query select false, 'no_shared_match'::text, null::timestamptz;
    return;
  end if;

  v_revote_days := coalesce((v_settings -> 'scouting' ->> 'revote_days')::int, 30);

  select max(sv.created_at) into v_last_vote
  from public.scouting_votes sv
  where sv.rater_player_id = v_rater_id
    and sv.target_player_id = p_target_player_id
    and sv.superseded_at is null;

  if v_last_vote is not null then
    v_next := v_last_vote + make_interval(days => v_revote_days);
    if v_next > pg_catalog.now() then
      return query select false, 'cooldown'::text, v_next;
      return;
    end if;
  end if;

  return query select true, 'ok'::text, null::timestamptz;
end;
$$;

revoke execute on function public.get_scouting_status(uuid) from public;
grant execute on function public.get_scouting_status(uuid) to authenticated;
