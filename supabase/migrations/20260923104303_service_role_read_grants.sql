-- The server-side pipelines (card recompute, match finalizer) read these tables with the admin
-- client. BYPASSRLS skips policies but not table privileges, and CLI migrations don't give
-- service_role DML/select by default, so grant read access explicitly. No writes: those stay
-- behind RPCs or the derived-table grants.
grant select on public.profiles to service_role;
grant select on public.groups to service_role;
grant select on public.group_members to service_role;
grant select on public.players to service_role;
grant select on public.scouting_votes to service_role;
grant select on public.playstyle_votes to service_role;
grant select on public.star_votes to service_role;
