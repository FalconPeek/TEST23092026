-- Select-only grants for authenticated; anon gets nothing. All writes go through SECURITY DEFINER
-- RPCs in 20260923055124_group_rpcs.sql (owned by postgres, which bypasses RLS as table owner),
-- so no insert/update/delete grants are given here at all.

grant select on public.groups to authenticated;
grant select on public.group_members to authenticated;
grant select on public.invites to authenticated;
grant select on public.players to authenticated;

create policy groups_select_member on public.groups
for select
to authenticated
using (private.is_member(id));

create policy group_members_select_member on public.group_members
for select
to authenticated
using (private.is_member(group_id));

-- Invites are only visible to group admins/owner (they contain join codes).
create policy invites_select_admin on public.invites
for select
to authenticated
using (private.is_group_admin(group_id));

create policy players_select_member on public.players
for select
to authenticated
using (private.is_member(group_id));
