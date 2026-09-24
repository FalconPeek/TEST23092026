-- public.amend_match_stats: admins assign unattributed goals of a finalized match. Admin-only,
-- finalized-only, bounded by the official score, and audited.
begin;

select plan(11);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_am_owner');
select tests.create_supabase_user('test_am_member');

select tests.authenticate_as('test_am_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Amend Test Group')::text;
insert into test_scratch (key, value) select 'code', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_am_member');
select public.accept_invite((select value from test_scratch where key = 'code'));

select tests.authenticate_as('test_am_owner');
insert into test_scratch (key, value)
  select 'owner_pid', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_am_owner');
insert into test_scratch (key, value)
  select 'member_pid', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_am_member');
insert into test_scratch (key, value)
  select 'match_id', public.create_match((select value::uuid from test_scratch where key = 'group_id'), now(), 5)::text;
select public.set_match_lineup(
  (select value::uuid from test_scratch where key = 'match_id'),
  jsonb_build_object('name', 'A', 'players', jsonb_build_array(jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'owner_pid')))),
  jsonb_build_object('name', 'B', 'players', jsonb_build_array(jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'member_pid')))),
  '{}'::uuid[]
);
select public.start_reporting((select value::uuid from test_scratch where key = 'match_id'), now());

-- 1. not yet finalized → rejected
select throws_ok(
  format($$ select public.amend_match_stats(%L::uuid, '[{"subject_player_id": "%s", "goals": 1}]'::jsonb) $$,
    (select value from test_scratch where key = 'match_id'), (select value from test_scratch where key = 'owner_pid')),
  'P0001', 'PICADO_VALIDATION: only a finalized match can be amended',
  'a match that is not finalized cannot be amended'
);

-- Simulate the finalizer: a 3-1 result with no goals attributed (as the service role would write it).
reset role;
update public.matches set status = 'finalized', finalized_at = now()
  where id = (select value::uuid from test_scratch where key = 'match_id');
insert into public.match_results (match_id, team1_goals, team2_goals, decided_by, winner_side)
  values ((select value::uuid from test_scratch where key = 'match_id'), 3, 1, 'regular', 1);
insert into public.match_stats (match_id, player_id)
  values ((select value::uuid from test_scratch where key = 'match_id'), (select value::uuid from test_scratch where key = 'owner_pid')),
         ((select value::uuid from test_scratch where key = 'match_id'), (select value::uuid from test_scratch where key = 'member_pid'));

-- 2. a non-admin member cannot amend
select tests.authenticate_as('test_am_member');
select throws_ok(
  format($$ select public.amend_match_stats(%L::uuid, '[{"subject_player_id": "%s", "goals": 1}]'::jsonb) $$,
    (select value from test_scratch where key = 'match_id'), (select value from test_scratch where key = 'member_pid')),
  'P0001', 'PICADO_FORBIDDEN: only group admins can amend match stats',
  'members cannot amend match stats'
);

-- 3. anon cannot call it at all
select tests.clear_authentication();
select throws_ok(
  format($$ select public.amend_match_stats(%L::uuid, '[]'::jsonb) $$, (select value from test_scratch where key = 'match_id')),
  '42501', null, 'anon cannot call amend_match_stats'
);

-- 4-5. the admin assigns 2 of the 3 team-A goals and 1 assist
select tests.authenticate_as('test_am_owner');
select lives_ok(
  format($$ select public.amend_match_stats(%L::uuid, '[{"subject_player_id": "%s", "goals": 2, "assists": 1}]'::jsonb) $$,
    (select value from test_scratch where key = 'match_id'), (select value from test_scratch where key = 'owner_pid')),
  'an admin can attribute goals within the score'
);
select is(
  (select goals || '/' || assists from public.match_stats
    where match_id = (select value::uuid from test_scratch where key = 'match_id') and player_id = (select value::uuid from test_scratch where key = 'owner_pid')),
  '2/1',
  'the amended goals and assists are stored'
);

-- 6. more goals than the score is rejected, and nothing changes
select throws_ok(
  format($$ select public.amend_match_stats(%L::uuid, '[{"subject_player_id": "%s", "goals": 4}]'::jsonb) $$,
    (select value from test_scratch where key = 'match_id'), (select value from test_scratch where key = 'owner_pid')),
  'P0001', 'PICADO_VALIDATION: team 1 would have more attributed goals than its score',
  'attributed goals cannot exceed the official score'
);
select is(
  (select goals from public.match_stats
    where match_id = (select value::uuid from test_scratch where key = 'match_id') and player_id = (select value::uuid from test_scratch where key = 'owner_pid')),
  2,
  'a rejected amendment leaves the stats unchanged'
);

-- 8. an opponent own goal counts toward the score: team B's own goal + 2 attributed = 3 is fine,
--    but then a third attributed goal would overflow
select lives_ok(
  format($$ select public.amend_match_stats(%L::uuid, '[{"subject_player_id": "%s", "own_goals": 1}]'::jsonb) $$,
    (select value from test_scratch where key = 'match_id'), (select value from test_scratch where key = 'member_pid')),
  'an opponent own goal fills the remaining team-A goal'
);
select throws_ok(
  format($$ select public.amend_match_stats(%L::uuid, '[{"subject_player_id": "%s", "goals": 3}]'::jsonb) $$,
    (select value from test_scratch where key = 'match_id'), (select value from test_scratch where key = 'owner_pid')),
  'P0001', 'PICADO_VALIDATION: team 1 would have more attributed goals than its score',
  'own goals by the opponent count toward the cap'
);

-- 10. non-team players are rejected
select throws_ok(
  format($$ select public.amend_match_stats(%L::uuid, '[{"subject_player_id": "%s", "goals": 1}]'::jsonb) $$,
    (select value from test_scratch where key = 'match_id'), gen_random_uuid()),
  'P0001', 'PICADO_VALIDATION: subject is not a team player of this match',
  'only team players of the match can be amended'
);

-- 11. every successful amendment is audited
reset role;
select is(
  (select count(*)::int from public.match_audit
    where match_id = (select value::uuid from test_scratch where key = 'match_id') and action = 'amend_stats'),
  2,
  'each successful amendment is logged to match_audit'
);

select * from finish();
rollback;
