-- Match lifecycle: automatic + organizer-driven transitions into `pending_finalize`, and the
-- service-role grants the TS finalizer (lib/actions/finalize.ts, admin client) needs to read the
-- raw report/rating tables and write matches.status/finalized_at + the derived match tables.

alter table public.matches add column if not exists finalized_at timestamptz;

-- service_role reads: the finalizer loads the full match graph with the admin client.
grant select on public.matches to service_role;
grant select on public.match_teams to service_role;
grant select on public.match_participants to service_role;

-- service_role writes: only status/finalized_at on matches -- everything else on matches is
-- either set by the create_match/set_match_lineup/start_reporting RPCs or immutable.
grant update (status, finalized_at) on public.matches to service_role;

-- ### private.close_expired_windows() returns int
-- Marks every `reporting` match whose report_deadline has passed as `pending_finalize`. Returns
-- how many rows were transitioned. Not a policy helper -- called from the SECURITY DEFINER
-- wrapper below and (if available) directly from a pg_cron job, so it's revoked from public and
-- NOT granted to authenticated.
create or replace function private.close_expired_windows()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.matches
  set status = 'pending_finalize'
  where status = 'reporting'
    and report_deadline is not null
    and report_deadline < pg_catalog.now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function private.close_expired_windows() from public;

-- ### public.close_expired_windows() returns int
-- SECURITY DEFINER wrapper so the cron route handler (app/api/cron/finalize, authenticated with
-- the admin/service_role client) can trigger the same transition on demand. Deliberately NOT
-- callable by authenticated or anon -- this is an internal maintenance operation, not a
-- user-facing one.
create or replace function public.close_expired_windows()
returns int
language sql
security definer
set search_path = ''
as $$
  select private.close_expired_windows();
$$;

revoke execute on function public.close_expired_windows() from public, anon, authenticated;
grant execute on function public.close_expired_windows() to service_role;

-- ### public.request_finalize(p_match_id) — admins only.
-- Lets an organizer close the report window early (reporting -> pending_finalize) instead of
-- waiting for report_deadline, e.g. once every team player has already reported.
create or replace function public.request_finalize(p_match_id uuid)
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
    raise exception 'PICADO_FORBIDDEN: only group admins can request finalization';
  end if;
  if v_status <> 'reporting' then
    raise exception 'PICADO_VALIDATION: only a match in reporting can be moved to pending_finalize';
  end if;

  -- Early finalization closes both windows now: the finalizer only processes pending_finalize
  -- matches whose rating window has ended, so ratings are never cut off silently.
  update public.matches
     set status = 'pending_finalize',
         report_deadline = least(report_deadline, pg_catalog.now()),
         rating_deadline = least(rating_deadline, pg_catalog.now())
   where id = p_match_id;
end;
$$;

revoke execute on function public.request_finalize(uuid) from public;
grant execute on function public.request_finalize(uuid) to authenticated;

-- ### public.resolve_dispute(p_match_id, p_team1_goals, p_team2_goals, p_stats) — admins only.
-- Only for a `disputed` match. Logs the organizer's authoritative values in match_audit (the TS
-- finalizer reads this row instead of re-running Rule A reconciliation when it processes a match
-- that came from `disputed`) and moves the match to `pending_finalize`. p_stats is optional:
-- [{ "subject_player_id": uuid, "goals": int, "assists": int, "own_goals": int, "saves": int },
-- ...]; every subject must be a team player of this match.
create or replace function public.resolve_dispute(
  p_match_id uuid,
  p_team1_goals int,
  p_team2_goals int,
  p_stats jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_status public.match_status;
  v_elem jsonb;
  v_subject uuid;
  v_seen uuid[] := '{}'::uuid[];
begin
  select m.group_id, m.status into v_group_id, v_status from public.matches m where m.id = p_match_id;
  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: match not found';
  end if;
  if not private.is_group_admin(v_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can resolve a dispute';
  end if;
  if v_status <> 'disputed' then
    raise exception 'PICADO_VALIDATION: only a disputed match can be resolved this way';
  end if;
  if p_team1_goals is null or p_team1_goals < 0 or p_team1_goals > 99
    or p_team2_goals is null or p_team2_goals < 0 or p_team2_goals > 99 then
    raise exception 'PICADO_VALIDATION: goals must be between 0 and 99';
  end if;

  if p_stats is not null then
    if jsonb_typeof(p_stats) <> 'array' then
      raise exception 'PICADO_VALIDATION: stats must be a json array';
    end if;

    for v_elem in select * from jsonb_array_elements(p_stats)
    loop
      v_subject := nullif(v_elem ->> 'subject_player_id', '')::uuid;
      if v_subject is null then
        raise exception 'PICADO_VALIDATION: subject_player_id is required for every stat override';
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
    end loop;
  end if;

  insert into public.match_audit (match_id, actor_user_id, action, payload)
  values (
    p_match_id,
    (select auth.uid()),
    'resolve_dispute',
    jsonb_build_object('team1_goals', p_team1_goals, 'team2_goals', p_team2_goals, 'stats', p_stats)
  );

  update public.matches set status = 'pending_finalize' where id = p_match_id;
end;
$$;

revoke execute on function public.resolve_dispute(uuid, int, int, jsonb) from public;
grant execute on function public.resolve_dispute(uuid, int, int, jsonb) to authenticated;

-- ### pg_cron: schedule private.close_expired_windows() every 10 minutes, if the extension is
-- available on this Postgres instance. Guarded so the migration never fails on a project/host
-- where pg_cron isn't offered (e.g. some local/CI setups) -- in that case, the
-- app/api/cron/finalize route handler (hit by an external scheduler, secured with CRON_SECRET)
-- calling public.close_expired_windows() is the only trigger.
do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
  end if;
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    select jobid into v_job_id from cron.job where jobname = 'picado-close-windows';
    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;
    perform cron.schedule('picado-close-windows', '*/10 * * * *', 'select private.close_expired_windows();');
  end if;
end;
$$;
