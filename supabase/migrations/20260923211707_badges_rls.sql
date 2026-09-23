-- badges: a global static catalog, readable by every authenticated user (not group-scoped).
-- player_badges: readable only by members of the awarded player's group. Neither table gets any
-- insert/update/delete grant for authenticated -- badges are awarded only by the TS badge engine
-- via the service_role admin client (see 20260923211703_badges_tables.sql).

grant select on public.badges to authenticated;
grant select on public.player_badges to authenticated;

create policy badges_select_all on public.badges
for select
to authenticated
using (true);

create policy player_badges_select_group_member on public.player_badges
for select
to authenticated
using (
  exists (
    select 1 from public.players p
    where p.id = player_badges.player_id
      and private.is_member(p.group_id)
  )
);
