begin;
select plan(5);

select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'),
  'notifications is in the realtime publication'
);
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'player_badges'),
  'player_badges is in the realtime publication'
);
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'badges'),
  'badges is in the realtime publication'
);
-- Vote/report/subscription tables must never be broadcast: they are anonymous or per-device-private.
select ok(
  not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in (
        'scouting_votes', 'playstyle_votes', 'star_votes', 'match_ratings', 'score_reports',
        'stat_reports', 'push_subscriptions'
      )
  ),
  'vote, report and push subscription tables are not in the realtime publication'
);
-- rater_stats / collusion_flags / recompute_queue stay internal even from the realtime feed.
select ok(
  not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('rater_stats', 'collusion_flags', 'recompute_queue')
  ),
  'internal-only derived tables are not in the realtime publication'
);

select * from finish();
rollback;
