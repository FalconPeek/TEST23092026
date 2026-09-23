-- SECURITY DEFINER helpers shared by the report/rating RPCs. Kept in `private` (not exposed by
-- the Data API). Not used directly by any RLS policy in this migration set, only from inside
-- other SECURITY DEFINER function bodies (nested calls execute as the function owner), so,
-- matching private.slugify / private.apply_player_update, they are revoked from public and NOT
-- granted to authenticated.

-- The caller's own participant row (any role) for a given match, joined through their player
-- identity in that match's group. Returns zero rows if the caller isn't a participant.
create or replace function private.my_match_participant(p_match_id uuid)
returns table (player_id uuid, group_id uuid, role public.participant_role, team_id uuid)
language sql
security definer
set search_path = ''
stable
as $$
  select mp.player_id, m.group_id, mp.role, mp.team_id
  from public.match_participants mp
  join public.matches m on m.id = mp.match_id
  join public.players p on p.id = mp.player_id
  where mp.match_id = p_match_id
    and p.user_id = (select auth.uid());
$$;

revoke execute on function private.my_match_participant(uuid) from public;

-- True if p_player_id is a team player (role = 'player') of p_match_id -- used to validate stat
-- report subjects and rating targets.
create or replace function private.is_match_team_player(p_match_id uuid, p_player_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.match_participants mp
    where mp.match_id = p_match_id
      and mp.player_id = p_player_id
      and mp.role = 'player'
  );
$$;

revoke execute on function private.is_match_team_player(uuid, uuid) from public;
