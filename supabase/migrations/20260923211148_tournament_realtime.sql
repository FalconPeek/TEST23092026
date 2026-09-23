-- Live bracket/fixture views subscribe to postgres_changes on these tables. Realtime evaluates
-- the existing select policies per subscriber, so members still only receive rows of their own
-- groups. `matches` is included so a linked real match changing status refreshes the bracket.
alter publication supabase_realtime add table public.tournament_matches;
alter publication supabase_realtime add table public.tournaments;
alter publication supabase_realtime add table public.matches;
