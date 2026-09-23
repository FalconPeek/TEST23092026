-- Public RPCs for score/stat reports + the report-status read model. Every function is SECURITY
-- DEFINER, search_path pinned to '', fully-qualified names, revoked from public/anon, granted to
-- authenticated only. Errors use a stable `PICADO_<CODE>: ` prefix that Server Actions map to
-- Spanish messages.

-- ### public.submit_score_report(p_match_id, p_team1_goals, p_team2_goals)
-- Only a team player (role = 'player') participant of the match can report the score, while the
-- match is `reporting` and before report_deadline. Upsert: editable until the deadline.
create or replace function public.submit_score_report(p_match_id uuid, p_team1_goals int, p_team2_goals int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec record;
  v_status public.match_status;
  v_deadline timestamptz;
begin
  select * into v_rec from private.my_match_participant(p_match_id);
  if v_rec.player_id is null then
    raise exception 'PICADO_NOT_PARTICIPANT: you are not a participant of this match';
  end if;
  if v_rec.role <> 'player' then
    raise exception 'PICADO_SPECTATOR: only team players can submit a score report';
  end if;

  select m.status, m.report_deadline into v_status, v_deadline
  from public.matches m
  where m.id = p_match_id;

  if v_status <> 'reporting' then
    raise exception 'PICADO_VALIDATION: the match is not open for score reporting';
  end if;
  if v_deadline is not null and pg_catalog.now() > v_deadline then
    raise exception 'PICADO_DEADLINE_PASSED: the report window has closed';
  end if;
  if p_team1_goals is null or p_team1_goals < 0 or p_team1_goals > 99
    or p_team2_goals is null or p_team2_goals < 0 or p_team2_goals > 99 then
    raise exception 'PICADO_VALIDATION: goals must be between 0 and 99';
  end if;

  insert into public.score_reports (match_id, reporter_player_id, team1_goals, team2_goals)
  values (p_match_id, v_rec.player_id, p_team1_goals, p_team2_goals)
  on conflict (match_id, reporter_player_id)
  do update set
    team1_goals = excluded.team1_goals,
    team2_goals = excluded.team2_goals,
    updated_at = pg_catalog.now();
end;
$$;

revoke execute on function public.submit_score_report(uuid, int, int) from public;
grant execute on function public.submit_score_report(uuid, int, int) to authenticated;

-- ### public.submit_stat_reports(p_match_id, p_reports)
-- p_reports = [{ "subject_player_id": uuid, "goals": int, "assists": int, "own_goals": int,
-- "saves": int }, ...]. Same eligibility/window as submit_score_report; every subject must be a
-- team player of this match; no duplicate subject within one call (upsert per row, and a
-- multi-row batch hitting the same conflict key twice would error). Missing numeric fields
-- default to 0. Upsert: editable until report_deadline.
create or replace function public.submit_stat_reports(p_match_id uuid, p_reports jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec record;
  v_status public.match_status;
  v_deadline timestamptz;
  v_elem jsonb;
  v_subject uuid;
  v_goals int;
  v_assists int;
  v_own_goals int;
  v_saves int;
  v_seen uuid[] := '{}'::uuid[];
  v_has_reports boolean := false;
begin
  select * into v_rec from private.my_match_participant(p_match_id);
  if v_rec.player_id is null then
    raise exception 'PICADO_NOT_PARTICIPANT: you are not a participant of this match';
  end if;
  if v_rec.role <> 'player' then
    raise exception 'PICADO_SPECTATOR: only team players can submit stat reports';
  end if;

  select m.status, m.report_deadline into v_status, v_deadline
  from public.matches m
  where m.id = p_match_id;

  if v_status <> 'reporting' then
    raise exception 'PICADO_VALIDATION: the match is not open for stat reporting';
  end if;
  if v_deadline is not null and pg_catalog.now() > v_deadline then
    raise exception 'PICADO_DEADLINE_PASSED: the report window has closed';
  end if;
  if p_reports is null or jsonb_typeof(p_reports) <> 'array' then
    raise exception 'PICADO_VALIDATION: reports must be a json array';
  end if;

  for v_elem in select * from jsonb_array_elements(p_reports)
  loop
    v_has_reports := true;
    v_subject := nullif(v_elem ->> 'subject_player_id', '')::uuid;
    if v_subject is null then
      raise exception 'PICADO_VALIDATION: subject_player_id is required for every stat report';
    end if;
    if v_subject = any (v_seen) then
      raise exception 'PICADO_VALIDATION: subject_player_id % appears more than once in this batch', v_subject;
    end if;
    v_seen := v_seen || v_subject;

    if not private.is_match_team_player(p_match_id, v_subject) then
      raise exception 'PICADO_VALIDATION: subject is not a team player of this match';
    end if;

    v_goals := coalesce((v_elem ->> 'goals')::int, 0);
    v_assists := coalesce((v_elem ->> 'assists')::int, 0);
    v_own_goals := coalesce((v_elem ->> 'own_goals')::int, 0);
    v_saves := coalesce((v_elem ->> 'saves')::int, 0);

    if v_goals < 0 or v_goals > 30 then
      raise exception 'PICADO_VALIDATION: goals must be between 0 and 30';
    end if;
    if v_assists < 0 or v_assists > 30 then
      raise exception 'PICADO_VALIDATION: assists must be between 0 and 30';
    end if;
    if v_own_goals < 0 or v_own_goals > 30 then
      raise exception 'PICADO_VALIDATION: own_goals must be between 0 and 30';
    end if;
    if v_saves < 0 or v_saves > 99 then
      raise exception 'PICADO_VALIDATION: saves must be between 0 and 99';
    end if;

    insert into public.stat_reports (match_id, reporter_player_id, subject_player_id, goals, assists, own_goals, saves)
    values (p_match_id, v_rec.player_id, v_subject, v_goals, v_assists, v_own_goals, v_saves)
    on conflict (match_id, reporter_player_id, subject_player_id)
    do update set
      goals = excluded.goals,
      assists = excluded.assists,
      own_goals = excluded.own_goals,
      saves = excluded.saves,
      updated_at = pg_catalog.now();
  end loop;

  if not v_has_reports then
    raise exception 'PICADO_VALIDATION: at least one stat report is required';
  end if;
end;
$$;

revoke execute on function public.submit_stat_reports(uuid, jsonb) from public;
grant execute on function public.submit_stat_reports(uuid, jsonb) to authenticated;

-- ### public.get_match_report_summary(p_match_id) returns table(side, reporters, all_agree)
-- Read model for any group member (not just participants): one row per team side with how many
-- distinct reporters on that side have submitted a score, and whether all score reports
-- submitted so far (either side) agree with each other on the final score -- never the
-- individual (team1_goals, team2_goals) values themselves.
create or replace function public.get_match_report_summary(p_match_id uuid)
returns table (side smallint, reporters int, all_agree boolean)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_group_id uuid;
  v_distinct_scores int;
  v_agree boolean;
begin
  select m.group_id into v_group_id from public.matches m where m.id = p_match_id;
  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: match not found';
  end if;
  if not private.is_member(v_group_id) then
    raise exception 'PICADO_FORBIDDEN: you are not a member of this group';
  end if;

  select count(distinct (sr.team1_goals, sr.team2_goals)) into v_distinct_scores
  from public.score_reports sr
  where sr.match_id = p_match_id;

  v_agree := coalesce(v_distinct_scores, 0) <= 1;

  return query
  select
    mt.side,
    (
      select count(distinct sr.reporter_player_id)::int
      from public.score_reports sr
      join public.match_participants mp
        on mp.match_id = sr.match_id and mp.player_id = sr.reporter_player_id
      where sr.match_id = p_match_id and mp.team_id = mt.id
    ),
    v_agree
  from public.match_teams mt
  where mt.match_id = p_match_id
  order by mt.side;
end;
$$;

revoke execute on function public.get_match_report_summary(uuid) from public;
grant execute on function public.get_match_report_summary(uuid) to authenticated;
