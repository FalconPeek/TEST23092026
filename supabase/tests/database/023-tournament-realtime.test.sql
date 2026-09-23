begin;
select plan(4);

select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tournament_matches'),
  'tournament_matches is in the realtime publication'
);
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tournaments'),
  'tournaments is in the realtime publication'
);
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches'),
  'matches is in the realtime publication'
);
-- Vote/report tables must never be broadcast: they are anonymous.
select ok(
  not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('scouting_votes', 'playstyle_votes', 'star_votes', 'match_ratings', 'score_reports', 'stat_reports')
  ),
  'vote and report tables are not in the realtime publication'
);

select * from finish();
rollback;
