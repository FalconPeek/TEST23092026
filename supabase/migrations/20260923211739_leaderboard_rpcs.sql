-- Public RPCs for group leaderboards + a single player's Impacto. Every function is SECURITY
-- DEFINER, search_path pinned to '', fully-qualified names, revoked from public/anon, granted to
-- authenticated only. Errors use a stable `PICADO_<CODE>: ` prefix that Server Actions map to
-- Spanish messages. Both aggregate ONLY p_group_id's own data (players who left, or belonging to
-- another group, are never included), so a member can't use these to peek at another group.

-- ### public.get_group_leaderboard(p_group_id, p_metric, p_limit default 20)
-- returns table(player_id, display_name, avatar_url, value, rank, matches_played)
-- p_metric in: ovr | impacto | goals | assists | mvps | clean_sheets | avg_rating | matches.
-- avg_rating requires at least 3 rated matches (median_rating not null) to appear at all, per
-- CLAUDE.md. Players with a null value for the chosen metric (e.g. no player_cards row yet for
-- `ovr`) are excluded rather than ranked at 0 -- an unranked player isn't "last", they just have no
-- data yet. Ties share a rank (rank(), not row_number()).
create or replace function public.get_group_leaderboard(p_group_id uuid, p_metric text, p_limit int default 20)
returns table (
  player_id uuid,
  display_name text,
  avatar_url text,
  value numeric,
  rank int,
  matches_played int
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_limit int := coalesce(p_limit, 20);
begin
  if not private.is_member(p_group_id) then
    raise exception 'PICADO_NOT_MEMBER: you are not a member of this group';
  end if;
  if p_metric not in ('ovr', 'impacto', 'goals', 'assists', 'mvps', 'clean_sheets', 'avg_rating', 'matches') then
    raise exception 'PICADO_VALIDATION: unknown leaderboard metric %', p_metric;
  end if;
  if v_limit < 1 or v_limit > 100 then
    raise exception 'PICADO_VALIDATION: limit must be between 1 and 100';
  end if;

  return query
  with base as (
    select
      p.id as player_id,
      p.display_name,
      p.avatar_url,
      (
        select count(distinct ms.match_id)::int
        from public.match_stats ms
        where ms.player_id = p.id
      ) as matches_played
    from public.players p
    where p.group_id = p_group_id
      and p.left_at is null
  ),
  metric_values as (
    select
      b.player_id,
      b.display_name,
      b.avatar_url,
      b.matches_played,
      case p_metric
        when 'ovr' then (select pc.ovr::numeric from public.player_cards pc where pc.player_id = b.player_id)
        when 'impacto' then (select ci.impacto::numeric from private.compute_impacto(p_group_id) ci where ci.player_id = b.player_id)
        when 'goals' then (select sum(ms.goals)::numeric from public.match_stats ms where ms.player_id = b.player_id)
        when 'assists' then (select sum(ms.assists)::numeric from public.match_stats ms where ms.player_id = b.player_id)
        when 'mvps' then (select count(*)::numeric from public.match_stats ms where ms.player_id = b.player_id and ms.is_mvp)
        when 'clean_sheets' then (select count(*)::numeric from public.match_stats ms where ms.player_id = b.player_id and ms.clean_sheet)
        when 'avg_rating' then (
          select avg(ms.median_rating)
          from public.match_stats ms
          where ms.player_id = b.player_id and ms.median_rating is not null
          having count(*) >= 3
        )
        when 'matches' then b.matches_played::numeric
      end as value
    from base b
  )
  select
    mv.player_id,
    mv.display_name,
    mv.avatar_url,
    mv.value,
    rank() over (order by mv.value desc)::int as rank,
    mv.matches_played
  from metric_values mv
  where mv.value is not null
  order by mv.value desc, mv.display_name asc
  limit v_limit;
end;
$$;

revoke execute on function public.get_group_leaderboard(uuid, text, int) from public;
grant execute on function public.get_group_leaderboard(uuid, text, int) to authenticated;

-- ### public.get_player_impacto(p_player_id uuid) returns int
-- Same 1..99 group-percentile value as the `impacto` leaderboard metric, for one player (used by
-- the profile card / /yo dashboard). Null if the player has no finalized matches yet. Callable by
-- any member of the player's group (matching the attribute_ratings / player_cards select policy
-- scope), not just the player themself.
create or replace function public.get_player_impacto(p_player_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_group_id uuid;
begin
  select p.group_id into v_group_id from public.players p where p.id = p_player_id;
  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: player not found';
  end if;
  if not private.is_member(v_group_id) then
    raise exception 'PICADO_NOT_MEMBER: you are not a member of this group';
  end if;

  return (select ci.impacto from private.compute_impacto(v_group_id) ci where ci.player_id = p_player_id);
end;
$$;

revoke execute on function public.get_player_impacto(uuid) from public;
grant execute on function public.get_player_impacto(uuid) to authenticated;
