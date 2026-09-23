-- Ratings are anonymous: select policy = own rows only (the caller is the rater). Grants are
-- select-only for authenticated; there are no insert/update/delete grants at all -- writes go
-- through the SECURITY DEFINER RPC in 20260923064107_match_ratings_rpcs.sql. service_role gets a
-- plain select grant (RLS doesn't apply to it, but the Data API still requires an explicit table
-- grant before any statement is even attempted): the TS finalizer reads every rating row directly
-- to compute median_rating / MVP / form.

grant select on public.match_ratings to authenticated;
grant select on public.match_ratings to service_role;

create policy match_ratings_select_own on public.match_ratings
for select
to authenticated
using (
  exists (
    select 1 from public.players p
    where p.id = match_ratings.rater_player_id
      and p.user_id = (select auth.uid())
  )
);
