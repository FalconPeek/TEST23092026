-- match_results / match_stats: select-only for group members, invisible to non-members, and
-- reject every authenticated write with 42501 (written only by the service role / finalizer).
-- match_audit: select-only for group admins (a plain member sees 0 rows, not an error), also
-- write-rejected for authenticated; anon is denied everywhere.
begin;

select plan(15);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_dm_owner');
select tests.create_supabase_user('test_dm_member');
select tests.create_supabase_user('test_dm_outsider');

select tests.authenticate_as('test_dm_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Derived Match Test Group')::text;

insert into test_scratch (key, value) select 'code_member', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_dm_member');
select public.accept_invite((select value from test_scratch where key = 'code_member'));

select tests.authenticate_as('test_dm_owner');
insert into test_scratch (key, value)
  select 'owner_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_dm_owner');
insert into test_scratch (key, value)
  select 'member_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_dm_member');

insert into test_scratch (key, value)
  select 'match_id', public.create_match((select value::uuid from test_scratch where key = 'group_id'), now(), 5)::text;

-- Seed derived rows directly as the table-owning postgres role (this is what the TS finalizer,
-- running with the admin client / service_role, would otherwise do).
reset role;
insert into public.match_results (match_id, team1_goals, team2_goals, winner_side)
values ((select value::uuid from test_scratch where key = 'match_id'), 2, 1, 1);
insert into public.match_stats (match_id, player_id, goals, median_rating, n_ratings)
values ((select value::uuid from test_scratch where key = 'match_id'), (select value::uuid from test_scratch where key = 'owner_player_id'), 2, 7.5, 3);
insert into public.match_audit (match_id, actor_user_id, action, payload)
values (
  (select value::uuid from test_scratch where key = 'match_id'),
  tests.get_supabase_uid('test_dm_owner'),
  'resolve_dispute',
  jsonb_build_object('team1_goals', 2, 'team2_goals', 1)
);

-- 1-2. a group member can select match_results / match_stats
select tests.authenticate_as('test_dm_member');
select is(
  (select count(*)::int from public.match_results where match_id = (select value::uuid from test_scratch where key = 'match_id')),
  1,
  'a group member can select match_results'
);
select is(
  (select count(*)::int from public.match_stats where match_id = (select value::uuid from test_scratch where key = 'match_id')),
  1,
  'a group member can select match_stats'
);

-- 3. a non-member sees no match_results rows
select tests.authenticate_as('test_dm_outsider');
select is(
  (select count(*)::int from public.match_results where match_id = (select value::uuid from test_scratch where key = 'match_id')),
  0,
  'a non-member sees no match_results rows'
);

-- 4-8. authenticated cannot write match_results / match_stats
select tests.authenticate_as('test_dm_member');
select throws_ok(
  format($$ insert into public.match_results (match_id, team1_goals, team2_goals) values (%L, 0, 0) $$, (select value::uuid from test_scratch where key = 'match_id')),
  '42501', null, 'authenticated cannot insert into match_results'
);
select throws_ok(
  format($$ update public.match_results set team1_goals = 5 where match_id = %L $$, (select value::uuid from test_scratch where key = 'match_id')),
  '42501', null, 'authenticated cannot update match_results'
);
select throws_ok(
  format($$ delete from public.match_results where match_id = %L $$, (select value::uuid from test_scratch where key = 'match_id')),
  '42501', null, 'authenticated cannot delete from match_results'
);
select throws_ok(
  format(
    $$ insert into public.match_stats (match_id, player_id) values (%L, %L) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'member_player_id')
  ),
  '42501', null, 'authenticated cannot insert into match_stats'
);
select throws_ok(
  format($$ update public.match_stats set goals = 9 where match_id = %L $$, (select value::uuid from test_scratch where key = 'match_id')),
  '42501', null, 'authenticated cannot update match_stats'
);

-- 9-10. match_audit is admin-only: the owner (admin) sees it, a plain member sees 0 rows
select tests.authenticate_as('test_dm_owner');
select is(
  (select count(*)::int from public.match_audit where match_id = (select value::uuid from test_scratch where key = 'match_id')),
  1,
  'a group admin can select match_audit'
);
select tests.authenticate_as('test_dm_member');
select is(
  (select count(*)::int from public.match_audit where match_id = (select value::uuid from test_scratch where key = 'match_id')),
  0,
  'a plain member sees no match_audit rows'
);

-- 11. authenticated cannot write match_audit even as an admin
select tests.authenticate_as('test_dm_owner');
select throws_ok(
  format(
    $$ insert into public.match_audit (match_id, action) values (%L, 'manual') $$,
    (select value::uuid from test_scratch where key = 'match_id')
  ),
  '42501', null, 'authenticated cannot insert into match_audit'
);

-- 12-14. anon is denied select on all three
select tests.clear_authentication();
select throws_ok(
  $$ select * from public.match_results $$,
  '42501', null, 'anon cannot select match_results'
);
select throws_ok(
  $$ select * from public.match_stats $$,
  '42501', null, 'anon cannot select match_stats'
);
select throws_ok(
  $$ select * from public.match_audit $$,
  '42501', null, 'anon cannot select match_audit'
);

-- 15. RLS is enabled on all three
reset role;
select tests.rls_enabled('public', 'match_results');

select * from finish();

rollback;
