-- score_reports / stat_reports + submit_score_report / submit_stat_reports / get_match_report_summary:
-- only team players of the match can report, only while reporting and before report_deadline;
-- stat report subjects must be team players; reports are private (own rows only); the report
-- summary reveals agreement, never individual values, and is readable by any group member.
begin;

select plan(22);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_r_owner');
select tests.create_supabase_user('test_r_member1');
select tests.create_supabase_user('test_r_member2');
select tests.create_supabase_user('test_r_member3');
select tests.create_supabase_user('test_r_spectator');
select tests.create_supabase_user('test_r_outsider');

select tests.authenticate_as('test_r_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Reports Test Group')::text;

insert into test_scratch (key, value) select 'code_1', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_r_member1');
select public.accept_invite((select value from test_scratch where key = 'code_1'));

select tests.authenticate_as('test_r_owner');
insert into test_scratch (key, value) select 'code_2', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_r_member2');
select public.accept_invite((select value from test_scratch where key = 'code_2'));

select tests.authenticate_as('test_r_owner');
insert into test_scratch (key, value) select 'code_3', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_r_member3');
select public.accept_invite((select value from test_scratch where key = 'code_3'));

select tests.authenticate_as('test_r_owner');
insert into test_scratch (key, value) select 'code_4', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_r_spectator');
select public.accept_invite((select value from test_scratch where key = 'code_4'));
select tests.authenticate_as('test_r_owner');
select public.set_member_role((select value::uuid from test_scratch where key = 'group_id'), tests.get_supabase_uid('test_r_spectator'), 'spectator');

select tests.authenticate_as('test_r_owner');
insert into test_scratch (key, value)
  select 'member1_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_r_member1');
insert into test_scratch (key, value)
  select 'member2_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_r_member2');
insert into test_scratch (key, value)
  select 'member3_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_r_member3');
insert into test_scratch (key, value)
  select 'spectator_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_r_spectator');

-- match: member1 vs member2, spectator watching; member3 is a group member but not a participant
insert into test_scratch (key, value)
  select 'match_id', public.create_match((select value::uuid from test_scratch where key = 'group_id'), now(), 5)::text;
select public.set_match_lineup(
  (select value::uuid from test_scratch where key = 'match_id'),
  jsonb_build_object('name', 'A', 'players', jsonb_build_array(jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'member1_player_id')))),
  jsonb_build_object('name', 'B', 'players', jsonb_build_array(jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'member2_player_id')))),
  array[(select value::uuid from test_scratch where key = 'spectator_player_id')]::uuid[]
);
select public.start_reporting((select value::uuid from test_scratch where key = 'match_id'));

-- 1. a group member who isn't a participant of the match cannot submit a score report
select tests.authenticate_as('test_r_member3');
select throws_like(
  format($$ select public.submit_score_report(%L, 2, 1) $$, (select value::uuid from test_scratch where key = 'match_id')),
  'PICADO_NOT_PARTICIPANT:%',
  'a non-participant group member cannot submit a score report'
);

-- 2. a spectator cannot submit a score report
select tests.authenticate_as('test_r_spectator');
select throws_like(
  format($$ select public.submit_score_report(%L, 2, 1) $$, (select value::uuid from test_scratch where key = 'match_id')),
  'PICADO_SPECTATOR:%',
  'a spectator cannot submit a score report'
);

-- 3. a team player can submit a score report
select tests.authenticate_as('test_r_member1');
select lives_ok(
  format($$ select public.submit_score_report(%L, 2, 1) $$, (select value::uuid from test_scratch where key = 'match_id')),
  'a team player can submit a score report'
);
select is(
  (
    select count(*)::int from public.score_reports
    where match_id = (select value::uuid from test_scratch where key = 'match_id')
      and reporter_player_id = (select value::uuid from test_scratch where key = 'member1_player_id')
  ),
  1,
  'the score report row was created'
);

-- 4. resubmitting upserts instead of creating a second row
select public.submit_score_report((select value::uuid from test_scratch where key = 'match_id'), 3, 1);
select is(
  (
    select count(*)::int from public.score_reports
    where match_id = (select value::uuid from test_scratch where key = 'match_id')
      and reporter_player_id = (select value::uuid from test_scratch where key = 'member1_player_id')
  ),
  1,
  'resubmitting a score report still leaves exactly one row'
);
select is(
  (
    select team1_goals from public.score_reports
    where match_id = (select value::uuid from test_scratch where key = 'match_id')
      and reporter_player_id = (select value::uuid from test_scratch where key = 'member1_player_id')
  ),
  3,
  'resubmitting a score report updates the value'
);

-- 5. out-of-range goals rejected
select throws_like(
  format($$ select public.submit_score_report(%L, 100, 1) $$, (select value::uuid from test_scratch where key = 'match_id')),
  'PICADO_VALIDATION:%',
  'goals out of 0..99 range is rejected'
);

-- 6. reports are private: member2 cannot see member1's score report row
select tests.authenticate_as('test_r_member2');
select is(
  (
    select count(*)::int from public.score_reports
    where reporter_player_id = (select value::uuid from test_scratch where key = 'member1_player_id')
  ),
  0,
  'another reporter cannot see member1''s score report row'
);

-- 7. member2 (the other team player) submits a disagreeing score
select public.submit_score_report((select value::uuid from test_scratch where key = 'match_id'), 2, 2);

-- 8. submit_stat_reports: a spectator cannot submit stat reports
select tests.authenticate_as('test_r_spectator');
select throws_like(
  format(
    $$ select public.submit_stat_reports(%L, jsonb_build_array(jsonb_build_object('subject_player_id', %L, 'goals', 1))) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'member1_player_id')
  ),
  'PICADO_SPECTATOR:%',
  'a spectator cannot submit stat reports'
);

-- 9. submit_stat_reports: a subject who isn't a team player of the match is rejected
select tests.authenticate_as('test_r_member1');
select throws_like(
  format(
    $$ select public.submit_stat_reports(%L, jsonb_build_array(jsonb_build_object('subject_player_id', %L, 'goals', 1))) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'member3_player_id')
  ),
  'PICADO_VALIDATION:%',
  'a stat report subject who is not a team player of the match is rejected'
);

-- 10. submit_stat_reports: a duplicate subject within the same batch is rejected
select throws_like(
  format(
    $$ select public.submit_stat_reports(%L, jsonb_build_array(
         jsonb_build_object('subject_player_id', %L, 'goals', 1),
         jsonb_build_object('subject_player_id', %L, 'goals', 2)
       )) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'member1_player_id'),
    (select value::uuid from test_scratch where key = 'member1_player_id')
  ),
  'PICADO_VALIDATION:%',
  'a duplicate subject in the same stat report batch is rejected'
);

-- 11. submit_stat_reports: an empty batch is rejected
select throws_like(
  format($$ select public.submit_stat_reports(%L, '[]'::jsonb) $$, (select value::uuid from test_scratch where key = 'match_id')),
  'PICADO_VALIDATION:%',
  'an empty stat report batch is rejected'
);

-- 12. submit_stat_reports: a valid self + teammate batch succeeds
select lives_ok(
  format(
    $$ select public.submit_stat_reports(%L, jsonb_build_array(jsonb_build_object('subject_player_id', %L, 'goals', 2, 'assists', 0))) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'member1_player_id')
  ),
  'a valid stat report batch succeeds'
);
select is(
  (
    select goals from public.stat_reports
    where match_id = (select value::uuid from test_scratch where key = 'match_id')
      and reporter_player_id = (select value::uuid from test_scratch where key = 'member1_player_id')
      and subject_player_id = (select value::uuid from test_scratch where key = 'member1_player_id')
  ),
  2,
  'the stat report row was created with the submitted value'
);

-- 13-14. get_match_report_summary: any group member can call it and see per-side reporter counts;
-- since member1 and member2 disagree on the score, all_agree is false, but individual values are
-- never exposed by the function's return shape.
select tests.authenticate_as('test_r_member3');
select is(
  (
    select array_agg(reporters order by side) from public.get_match_report_summary((select value::uuid from test_scratch where key = 'match_id'))
  ),
  array[1, 1],
  'get_match_report_summary counts one reporter per side'
);
select is(
  (select bool_and(all_agree) from public.get_match_report_summary((select value::uuid from test_scratch where key = 'match_id'))),
  false,
  'get_match_report_summary reports disagreement when score reports differ'
);

-- 15. a non-member cannot call get_match_report_summary
select tests.authenticate_as('test_r_outsider');
select throws_like(
  format($$ select * from public.get_match_report_summary(%L) $$, (select value::uuid from test_scratch where key = 'match_id')),
  'PICADO_FORBIDDEN:%',
  'a non-member cannot call get_match_report_summary'
);

-- 16-17. deadline: a match whose report window already closed rejects new score/stat reports
select tests.authenticate_as('test_r_owner');
insert into test_scratch (key, value)
  select 'match_id_2', public.create_match((select value::uuid from test_scratch where key = 'group_id'), now(), 5)::text;
select public.set_match_lineup(
  (select value::uuid from test_scratch where key = 'match_id_2'),
  jsonb_build_object('name', 'A', 'players', jsonb_build_array(jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'member1_player_id')))),
  jsonb_build_object('name', 'B', 'players', jsonb_build_array(jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'member2_player_id')))),
  '{}'::uuid[]
);
select public.start_reporting((select value::uuid from test_scratch where key = 'match_id_2'), now() - interval '49 hours');

select tests.authenticate_as('test_r_member1');
select throws_like(
  format($$ select public.submit_score_report(%L, 1, 0) $$, (select value::uuid from test_scratch where key = 'match_id_2')),
  'PICADO_DEADLINE_PASSED:%',
  'submit_score_report rejects a match whose report window has closed'
);
select throws_like(
  format(
    $$ select public.submit_stat_reports(%L, jsonb_build_array(jsonb_build_object('subject_player_id', %L, 'goals', 1))) $$,
    (select value::uuid from test_scratch where key = 'match_id_2'),
    (select value::uuid from test_scratch where key = 'member1_player_id')
  ),
  'PICADO_DEADLINE_PASSED:%',
  'submit_stat_reports rejects a match whose report window has closed'
);

-- 18-20. anon is denied everywhere on reports
select tests.clear_authentication();
select throws_ok(
  $$ select * from public.score_reports $$,
  '42501', null, 'anon cannot select score_reports'
);
select throws_ok(
  $$ select * from public.stat_reports $$,
  '42501', null, 'anon cannot select stat_reports'
);
select throws_ok(
  format($$ select public.submit_score_report(%L, 1, 0) $$, (select value::uuid from test_scratch where key = 'match_id')),
  '42501', null, 'anon cannot call submit_score_report'
);

select * from finish();

rollback;
