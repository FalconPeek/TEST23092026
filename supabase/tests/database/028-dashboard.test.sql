-- get_my_dashboard: the caller's own player only (no group_id/player_id leakage), totals/history/
-- badges scoped correctly, and a clean rejection for callers without an active player in the group.
begin;

select plan(13);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_d_owner');
select tests.create_supabase_user('test_d_member');
select tests.create_supabase_user('test_d_outsider');
select tests.create_supabase_user('test_d_left');

select tests.authenticate_as('test_d_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Dashboard Test Group')::text;

insert into test_scratch (key, value) select 'code_member', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_d_member');
select public.accept_invite((select value from test_scratch where key = 'code_member'));

select tests.authenticate_as('test_d_owner');
insert into test_scratch (key, value) select 'code_left', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_d_left');
select public.accept_invite((select value from test_scratch where key = 'code_left'));

-- test_d_left then leaves the group: their players row is kept for history but user_id/left_at
-- change, so get_my_dashboard (which requires an *active* player) must reject them too.
select public.leave_group((select value::uuid from test_scratch where key = 'group_id'));

select tests.authenticate_as('test_d_owner');
insert into test_scratch (key, value)
  select 'owner_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_d_owner');
insert into test_scratch (key, value)
  select 'member_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_d_member');

insert into test_scratch (key, value) select 'm1', public.create_match((select value::uuid from test_scratch where key = 'group_id'), now(), 5)::text;
insert into test_scratch (key, value) select 'm2', public.create_match((select value::uuid from test_scratch where key = 'group_id'), now(), 5)::text;

-- Seed derived data directly as the table-owning postgres role.
reset role;

insert into public.match_stats (match_id, player_id, goals, assists, median_rating, is_mvp, clean_sheet) values
  ((select value::uuid from test_scratch where key = 'm1'), (select value::uuid from test_scratch where key = 'owner_player_id'), 2, 1, 8, true, false),
  ((select value::uuid from test_scratch where key = 'm2'), (select value::uuid from test_scratch where key = 'owner_player_id'), 1, 0, 6, false, true),
  ((select value::uuid from test_scratch where key = 'm1'), (select value::uuid from test_scratch where key = 'member_player_id'), 0, 2, 7, false, false);

insert into public.attribute_history (player_id, snapshot_at, ovr, attrs, reason) values
  ((select value::uuid from test_scratch where key = 'owner_player_id'), now() - interval '2 days', 55, '{}'::jsonb, 'scouting'),
  ((select value::uuid from test_scratch where key = 'owner_player_id'), now(), 60, '{}'::jsonb, 'match');

insert into public.player_cards (player_id, ovr, tier, is_provisional, face) values
  ((select value::uuid from test_scratch where key = 'owner_player_id'), 60, 'bronze', true, '{}'::jsonb);

insert into public.openskill_ratings (player_id, mu, sigma, ordinal, matches_played) values
  ((select value::uuid from test_scratch where key = 'owner_player_id'), 26, 8, 15, 2),
  ((select value::uuid from test_scratch where key = 'member_player_id'), 20, 8, 5, 1);

insert into public.player_badges (player_id, badge_code, count) values
  ((select value::uuid from test_scratch where key = 'owner_player_id'), 'first_match', 1);

-- 1. the owner's dashboard has the right player_id and totals
select tests.authenticate_as('test_d_owner');
select is(
  (public.get_my_dashboard((select value::uuid from test_scratch where key = 'group_id')) ->> 'player_id')::uuid,
  (select value::uuid from test_scratch where key = 'owner_player_id'),
  'get_my_dashboard reports the caller''s own player_id'
);
select is(
  (public.get_my_dashboard((select value::uuid from test_scratch where key = 'group_id')) -> 'totals' ->> 'matches_played')::int,
  2,
  'totals.matches_played counts only the caller''s matches'
);
select is(
  (public.get_my_dashboard((select value::uuid from test_scratch where key = 'group_id')) -> 'totals' ->> 'goals')::int,
  3,
  'totals.goals sums only the caller''s match_stats rows'
);
select is(
  (public.get_my_dashboard((select value::uuid from test_scratch where key = 'group_id')) -> 'totals' ->> 'mvps')::int,
  1,
  'totals.mvps is correct'
);

-- 2. ovr_history has both snapshots, oldest first
select is(
  jsonb_array_length(public.get_my_dashboard((select value::uuid from test_scratch where key = 'group_id')) -> 'ovr_history'),
  2,
  'ovr_history has both attribute_history snapshots'
);
select is(
  (public.get_my_dashboard((select value::uuid from test_scratch where key = 'group_id')) -> 'ovr_history' -> 0 ->> 'ovr')::int,
  55,
  'ovr_history is ordered oldest-first'
);

-- 3. recent_matches has 2 rows, impacto and badges are populated
select is(
  jsonb_array_length(public.get_my_dashboard((select value::uuid from test_scratch where key = 'group_id')) -> 'recent_matches'),
  2,
  'recent_matches has the caller''s 2 match_stats rows'
);
select is(
  (public.get_my_dashboard((select value::uuid from test_scratch where key = 'group_id')) ->> 'impacto')::int,
  99,
  'impacto reflects the caller''s higher ordinal within the group'
);
select is(
  jsonb_array_length(public.get_my_dashboard((select value::uuid from test_scratch where key = 'group_id')) -> 'badges'),
  1,
  'badges lists the caller''s player_badges rows'
);

-- 4. the member's dashboard never leaks the owner's data
select tests.authenticate_as('test_d_member');
select is(
  (public.get_my_dashboard((select value::uuid from test_scratch where key = 'group_id')) -> 'totals' ->> 'goals')::int,
  0,
  'the member''s own dashboard shows only their own totals, not the owner''s'
);
select is(
  jsonb_array_length(public.get_my_dashboard((select value::uuid from test_scratch where key = 'group_id')) -> 'badges'),
  0,
  'the member''s dashboard has no badges (they have none of their own)'
);

-- 5. a genuine outsider (never joined) is rejected
select tests.authenticate_as('test_d_outsider');
select throws_like(
  format($$ select public.get_my_dashboard(%L) $$, (select value::uuid from test_scratch where key = 'group_id')),
  'PICADO_NOT_MEMBER:%',
  'a non-member is rejected by get_my_dashboard'
);

-- 6. a member who left the group is rejected too (their players row is kept for history, but
-- with left_at set -- not an "active" player anymore)
select tests.authenticate_as('test_d_left');
select throws_like(
  format($$ select public.get_my_dashboard(%L) $$, (select value::uuid from test_scratch where key = 'group_id')),
  'PICADO_NOT_MEMBER:%',
  'a member who left the group is rejected by get_my_dashboard'
);

select * from finish();
rollback;
