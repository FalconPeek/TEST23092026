-- SECURITY DEFINER helpers for matches. Not used directly by any RLS policy in this migration
-- set, only from inside other SECURITY DEFINER function bodies (nested calls execute as the
-- function owner), so, matching private.slugify / private.apply_player_update, they are revoked
-- from public and NOT granted to authenticated. Kept in `private` (not exposed by the Data API).

-- Two players "shared a match" if they both participated (any role) in the same match that has
-- reached at least the reporting stage (reporting or finalized) -- i.e. the match actually
-- happened, not just a scheduled fixture.
create or replace function private.shared_match(p1 uuid, p2 uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.match_participants mp1
    join public.match_participants mp2 on mp2.match_id = mp1.match_id
    join public.matches m on m.id = mp1.match_id
    where mp1.player_id = p1
      and mp2.player_id = p2
      and m.status in ('reporting', 'finalized')
  );
$$;

revoke execute on function private.shared_match(uuid, uuid) from public;

-- True if the caller's player in that match's group is a participant of p_match_id.
create or replace function private.is_participant(p_match_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.match_participants mp
    join public.players p on p.id = mp.player_id
    where mp.match_id = p_match_id
      and p.user_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_participant(uuid) from public;
