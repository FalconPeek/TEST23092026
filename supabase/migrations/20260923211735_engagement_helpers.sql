-- SECURITY DEFINER helper shared by get_group_leaderboard and get_player_impacto (M5). Kept in
-- `private` (not exposed by the Data API); only called from inside other SECURITY DEFINER
-- function bodies, so (matching private.playstyle_codes() / private.sub_attribute_keys()) it's
-- revoked from public and NOT granted to authenticated.

-- ### private.compute_impacto(p_group_id uuid) returns table(player_id uuid, impacto int)
-- Per CLAUDE.md "Rating system": displayed "Impacto" = OpenSkill ordinal (mu - 3*sigma) mapped to
-- 1..99 via a percentile *within the group*. Only players with an openskill_ratings row and at
-- least one finalized match are ranked (a player with matches_played = 0 still carries the default
-- mu/sigma seed row from the first match they're added to a lineup for, which isn't a real signal
-- yet). percent_rank() is 0..1 (0 for the single-row case, by definition), so the mapping is
-- clamped to keep the documented 1..99 bounds even with a 1-player group.
create or replace function private.compute_impacto(p_group_id uuid)
returns table (player_id uuid, impacto int)
language sql
security definer
set search_path = ''
stable
as $$
  select
    os.player_id,
    greatest(1, least(99, round(1 + percent_rank() over (order by os.ordinal) * 98)))::int as impacto
  from public.openskill_ratings os
  join public.players p on p.id = os.player_id
  where p.group_id = p_group_id
    and p.left_at is null
    and os.matches_played > 0;
$$;

revoke execute on function private.compute_impacto(uuid) from public;
