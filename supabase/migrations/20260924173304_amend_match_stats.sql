-- ### public.amend_match_stats(p_match_id, p_stats)
-- A finalized match keeps its agreed score even when not every goal was attributed to a scorer
-- (lib/reconcile leaves the rest unattributed). This lets a group admin assign those goals, and
-- fix assists/own goals/saves, afterwards.
--
-- p_stats = [{ subject_player_id, goals?, assists?, own_goals?, saves? }]: only the keys present
-- are changed. After applying, each side must still fit the official score in match_results:
--   Σ goals(side) + Σ own_goals(opponent) <= score(side)
--   Σ assists(side) <= score(side) - Σ own_goals(opponent)
-- The score, OpenSkill, MVP and ratings are untouched; the TS action awards any newly earned
-- badges. Every change is logged to match_audit with before/after values.
create or replace function public.amend_match_stats(p_match_id uuid, p_stats jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_status public.match_status;
  v_score1 int;
  v_score2 int;
  v_elem jsonb;
  v_subject uuid;
  v_seen uuid[] := '{}'::uuid[];
  v_before jsonb;
  v_side record;
begin
  select m.group_id, m.status into v_group_id, v_status from public.matches m where m.id = p_match_id;
  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: match not found';
  end if;
  if not private.is_group_admin(v_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can amend match stats';
  end if;
  if v_status <> 'finalized' then
    raise exception 'PICADO_VALIDATION: only a finalized match can be amended';
  end if;

  select r.team1_goals, r.team2_goals into v_score1, v_score2
  from public.match_results r where r.match_id = p_match_id;
  if v_score1 is null then
    raise exception 'PICADO_VALIDATION: match has no result';
  end if;

  if p_stats is null or jsonb_typeof(p_stats) <> 'array' or jsonb_array_length(p_stats) = 0 then
    raise exception 'PICADO_VALIDATION: stats must be a non-empty json array';
  end if;

  select coalesce(jsonb_agg(to_jsonb(s) - 'match_id'), '[]'::jsonb) into v_before
  from public.match_stats s where s.match_id = p_match_id;

  for v_elem in select * from jsonb_array_elements(p_stats)
  loop
    v_subject := nullif(v_elem ->> 'subject_player_id', '')::uuid;
    if v_subject is null then
      raise exception 'PICADO_VALIDATION: subject_player_id is required for every amendment';
    end if;
    if v_subject = any (v_seen) then
      raise exception 'PICADO_VALIDATION: subject_player_id % appears more than once', v_subject;
    end if;
    v_seen := v_seen || v_subject;

    if not private.is_match_team_player(p_match_id, v_subject) then
      raise exception 'PICADO_VALIDATION: subject is not a team player of this match';
    end if;
    if (v_elem ? 'goals') and ((v_elem ->> 'goals')::int < 0 or (v_elem ->> 'goals')::int > 30) then
      raise exception 'PICADO_VALIDATION: goals must be between 0 and 30';
    end if;
    if (v_elem ? 'assists') and ((v_elem ->> 'assists')::int < 0 or (v_elem ->> 'assists')::int > 30) then
      raise exception 'PICADO_VALIDATION: assists must be between 0 and 30';
    end if;
    if (v_elem ? 'own_goals') and ((v_elem ->> 'own_goals')::int < 0 or (v_elem ->> 'own_goals')::int > 30) then
      raise exception 'PICADO_VALIDATION: own_goals must be between 0 and 30';
    end if;
    if (v_elem ? 'saves') and ((v_elem ->> 'saves')::int < 0 or (v_elem ->> 'saves')::int > 99) then
      raise exception 'PICADO_VALIDATION: saves must be between 0 and 99';
    end if;

    -- A team player with no match_stats row (shouldn't happen after finalization) gets one.
    insert into public.match_stats (match_id, player_id)
    values (p_match_id, v_subject)
    on conflict (match_id, player_id) do nothing;

    update public.match_stats s
    set goals = coalesce((v_elem ->> 'goals')::int, s.goals),
        assists = coalesce((v_elem ->> 'assists')::int, s.assists),
        own_goals = coalesce((v_elem ->> 'own_goals')::int, s.own_goals),
        saves = coalesce((v_elem ->> 'saves')::int, s.saves)
    where s.match_id = p_match_id and s.player_id = v_subject;
  end loop;

  -- Re-check both sides against the official score (the whole statement rolls back on failure).
  for v_side in
    with per_player as (
      select t.side, s.goals, s.assists, s.own_goals
      from public.match_stats s
      join public.match_participants mp on mp.match_id = s.match_id and mp.player_id = s.player_id
      join public.match_teams t on t.id = mp.team_id
      where s.match_id = p_match_id and mp.role = 'player'
    ),
    sides as (
      select side,
             coalesce(sum(goals), 0) as goals,
             coalesce(sum(assists), 0) as assists,
             coalesce(sum(own_goals), 0) as own_goals
      from per_player group by side
    )
    select s.side,
           s.goals,
           s.assists,
           coalesce((select o.own_goals from sides o where o.side <> s.side), 0) as opponent_own_goals,
           case when s.side = 1 then v_score1 else v_score2 end as official
    from sides s
  loop
    if v_side.goals + v_side.opponent_own_goals > v_side.official then
      raise exception 'PICADO_VALIDATION: team % would have more attributed goals than its score', v_side.side;
    end if;
    if v_side.assists > v_side.official - v_side.opponent_own_goals then
      raise exception 'PICADO_VALIDATION: team % would have more assists than goals', v_side.side;
    end if;
  end loop;

  insert into public.match_audit (match_id, actor_user_id, action, payload)
  values (
    p_match_id,
    (select auth.uid()),
    'amend_stats',
    jsonb_build_object('before', v_before, 'changes', p_stats)
  );
end;
$$;

revoke execute on function public.amend_match_stats(uuid, jsonb) from public, anon;
grant execute on function public.amend_match_stats(uuid, jsonb) to authenticated;
