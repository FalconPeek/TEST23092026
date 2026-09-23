-- Select-only grants for authenticated (group members read everything about their group's
-- tournaments); anon gets nothing. All writes go through SECURITY DEFINER RPCs in the
-- 20260923161336_/20260923161339_/20260923161342_ migrations that follow (owned by postgres,
-- which bypasses RLS as table owner), so no insert/update/delete grants are given here at all.
-- service_role also gets select (the finalizer / TS tournament-progression layer reads this data
-- with the admin client to rebuild TournamentState for lib/brackets `standings`/`nextSwissRound`),
-- matching the service_role_read_grants precedent for other server-pipeline tables.

grant select on public.tournaments to authenticated, service_role;
grant select on public.tournament_entries to authenticated, service_role;
grant select on public.tournament_registrations to authenticated, service_role;
grant select on public.stages to authenticated, service_role;
grant select on public.stage_groups to authenticated, service_role;
grant select on public.tournament_matches to authenticated, service_role;

create policy tournaments_select_member on public.tournaments
for select
to authenticated
using (private.is_member(group_id));

create policy tournament_entries_select_member on public.tournament_entries
for select
to authenticated
using (
  exists (
    select 1 from public.tournaments t
    where t.id = tournament_entries.tournament_id
      and private.is_member(t.group_id)
  )
);

create policy tournament_registrations_select_member on public.tournament_registrations
for select
to authenticated
using (
  exists (
    select 1 from public.tournaments t
    where t.id = tournament_registrations.tournament_id
      and private.is_member(t.group_id)
  )
);

create policy stages_select_member on public.stages
for select
to authenticated
using (
  exists (
    select 1 from public.tournaments t
    where t.id = stages.tournament_id
      and private.is_member(t.group_id)
  )
);

create policy stage_groups_select_member on public.stage_groups
for select
to authenticated
using (
  exists (
    select 1 from public.tournaments t
    where t.id = stage_groups.tournament_id
      and private.is_member(t.group_id)
  )
);

create policy tournament_matches_select_member on public.tournament_matches
for select
to authenticated
using (
  exists (
    select 1 from public.tournaments t
    where t.id = tournament_matches.tournament_id
      and private.is_member(t.group_id)
  )
);
