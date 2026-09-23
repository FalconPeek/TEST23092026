-- Select-only grants for authenticated; anon gets nothing. All writes go through SECURITY
-- DEFINER RPCs in 20260923061622_matches_rpcs.sql (owned by postgres, which bypasses RLS as
-- table owner), so no insert/update/delete grants are given here at all.

grant select on public.matches to authenticated;
grant select on public.match_teams to authenticated;
grant select on public.match_participants to authenticated;

create policy matches_select_member on public.matches
for select
to authenticated
using (private.is_member(group_id));

create policy match_teams_select_member on public.match_teams
for select
to authenticated
using (
  exists (
    select 1 from public.matches m
    where m.id = match_teams.match_id
      and private.is_member(m.group_id)
  )
);

create policy match_participants_select_member on public.match_participants
for select
to authenticated
using (
  exists (
    select 1 from public.matches m
    where m.id = match_participants.match_id
      and private.is_member(m.group_id)
  )
);
