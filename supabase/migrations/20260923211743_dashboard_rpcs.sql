-- Public RPC feeding the personal dashboard (/yo). SECURITY DEFINER, search_path pinned to '',
-- fully-qualified names, revoked from public/anon, granted to authenticated only.

-- ### public.get_my_dashboard(p_group_id uuid) returns jsonb
-- One aggregate call for the caller's own player in p_group_id: OVR history, last 10 finalized
-- matches, career totals, current Impacto and badges. Returned as a single jsonb object rather
-- than several RPCs / a wide table: the pieces have unrelated shapes (a time series, a row list, a
-- totals object, a scalar, a badge list) that don't share a natural tabular representation, and
-- /yo wants them all in one round trip. Each field defaults to an empty array/null rather than
-- omitting the key, so the caller never has to special-case a brand new player with no history.
create or replace function public.get_my_dashboard(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_uid uuid := (select auth.uid());
  v_player_id uuid;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'PICADO_FORBIDDEN: authentication required';
  end if;

  select p.id into v_player_id
  from public.players p
  where p.group_id = p_group_id and p.user_id = v_uid and p.left_at is null;

  if v_player_id is null then
    raise exception 'PICADO_NOT_MEMBER: you do not have an active player in this group';
  end if;

  select jsonb_build_object(
    'player_id', v_player_id,
    'ovr_history', (
      select coalesce(jsonb_agg(jsonb_build_object('snapshot_at', h.snapshot_at, 'ovr', h.ovr) order by h.snapshot_at), '[]'::jsonb)
      from public.attribute_history h
      where h.player_id = v_player_id
    ),
    'recent_matches', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.played_at desc nulls last), '[]'::jsonb)
      from (
        select
          ms.match_id,
          m.played_at,
          ms.goals,
          ms.assists,
          ms.own_goals,
          ms.saves,
          ms.clean_sheet,
          ms.is_mvp,
          ms.median_rating
        from public.match_stats ms
        join public.matches m on m.id = ms.match_id
        where ms.player_id = v_player_id
        order by m.played_at desc nulls last
        limit 10
      ) s
    ),
    'totals', (
      select jsonb_build_object(
        'matches_played', count(distinct ms.match_id),
        'goals', coalesce(sum(ms.goals), 0),
        'assists', coalesce(sum(ms.assists), 0),
        'own_goals', coalesce(sum(ms.own_goals), 0),
        'saves', coalesce(sum(ms.saves), 0),
        'clean_sheets', coalesce(sum((ms.clean_sheet)::int), 0),
        'mvps', coalesce(sum((ms.is_mvp)::int), 0)
      )
      from public.match_stats ms
      where ms.player_id = v_player_id
    ),
    'impacto', (select ci.impacto from private.compute_impacto(p_group_id) ci where ci.player_id = v_player_id),
    'card', (
      select to_jsonb(pc) - 'player_id'
      from public.player_cards pc
      where pc.player_id = v_player_id
    ),
    'badges', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'badge_code', pb.badge_code,
        'awarded_at', pb.awarded_at,
        'count', pb.count
      ) order by pb.awarded_at desc), '[]'::jsonb)
      from public.player_badges pb
      where pb.player_id = v_player_id
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.get_my_dashboard(uuid) from public;
grant execute on function public.get_my_dashboard(uuid) to authenticated;
