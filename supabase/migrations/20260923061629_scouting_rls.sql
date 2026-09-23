-- Votes are anonymous: select policy = own rows only (the caller is the rater). Grants are
-- select-only; there are no insert/update/delete grants for authenticated at all -- writes go
-- through the SECURITY DEFINER RPCs in 20260923061632_scouting_rpcs.sql.

grant select on public.scouting_votes to authenticated;
grant select on public.playstyle_votes to authenticated;
grant select on public.star_votes to authenticated;

create policy scouting_votes_select_own on public.scouting_votes
for select
to authenticated
using (
  exists (
    select 1 from public.players p
    where p.id = scouting_votes.rater_player_id
      and p.user_id = (select auth.uid())
  )
);

create policy playstyle_votes_select_own on public.playstyle_votes
for select
to authenticated
using (
  exists (
    select 1 from public.players p
    where p.id = playstyle_votes.rater_player_id
      and p.user_id = (select auth.uid())
  )
);

create policy star_votes_select_own on public.star_votes
for select
to authenticated
using (
  exists (
    select 1 from public.players p
    where p.id = star_votes.rater_player_id
      and p.user_id = (select auth.uid())
  )
);
