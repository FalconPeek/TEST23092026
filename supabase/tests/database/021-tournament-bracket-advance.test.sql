-- persist_bracket inserts a whole generated bracket atomically (and rejects a second call once
-- one exists, and rolls back entirely on a bad payload), confirm_match_result advances the winner
-- into the right next-round slot (mirroring lib/brackets/engine.ts applyResult), and
-- edit_match_result is blocked once the downstream match it feeds has started.
begin;

select plan(22);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_ba_owner');
select tests.create_supabase_user('test_ba_member');

select tests.authenticate_as('test_ba_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Bracket Advance Group')::text;

insert into test_scratch (key, value)
  select 'code_member', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'), 'member');
select tests.authenticate_as('test_ba_member');
select public.accept_invite((select value from test_scratch where key = 'code_member'));

select tests.authenticate_as('test_ba_owner');
insert into test_scratch (key, value)
  select 'tournament_id', public.create_tournament(
    (select value::uuid from test_scratch where key = 'group_id'), 'Single Elim 4', 'single_elim', 5, 'teams'
  )::text;

-- 4 entries -> a standard single-elim bracket, no byes: round 1 has 2 matches (ready), round 2
-- (the final) is locked until both feed into it. Matches lib/brackets standardSeedOrder(4) = [1,4,2,3].
select public.save_tournament_entries(
  (select value::uuid from test_scratch where key = 'tournament_id'),
  jsonb_build_array(
    jsonb_build_object('name', 'Seed 1', 'seed', 1),
    jsonb_build_object('name', 'Seed 2', 'seed', 2),
    jsonb_build_object('name', 'Seed 3', 'seed', 3),
    jsonb_build_object('name', 'Seed 4', 'seed', 4)
  )
);

insert into test_scratch (key, value)
  select 'e1', id::text from public.tournament_entries
  where tournament_id = (select value::uuid from test_scratch where key = 'tournament_id') and seed = 1;
insert into test_scratch (key, value)
  select 'e2', id::text from public.tournament_entries
  where tournament_id = (select value::uuid from test_scratch where key = 'tournament_id') and seed = 2;
insert into test_scratch (key, value)
  select 'e3', id::text from public.tournament_entries
  where tournament_id = (select value::uuid from test_scratch where key = 'tournament_id') and seed = 3;
insert into test_scratch (key, value)
  select 'e4', id::text from public.tournament_entries
  where tournament_id = (select value::uuid from test_scratch where key = 'tournament_id') and seed = 4;

-- 1. a payload referencing an unknown stage rolls back entirely (atomicity).
select throws_like(
  format(
    $$ select public.persist_bracket(%L, jsonb_build_object(
         'stages', jsonb_build_array(jsonb_build_object('id', 's1', 'kind', 'single_elim', 'order', 1)),
         'groups', '[]'::jsonb,
         'matches', jsonb_build_array(jsonb_build_object(
           'id', 's1-wb-r1-m1', 'stageId', 'unknown-stage', 'groupId', null, 'bracket', 'winners',
           'round', 1, 'number', 1, 'entry1Id', %L, 'entry2Id', %L, 'status', 'ready'
         ))
       )) $$,
    (select value::uuid from test_scratch where key = 'tournament_id'),
    (select value from test_scratch where key = 'e1'),
    (select value from test_scratch where key = 'e2')
  ),
  'PICADO_VALIDATION:%',
  'persist_bracket rejects a match referencing an unknown stage'
);
select is(
  (select count(*)::int from public.stages where tournament_id = (select value::uuid from test_scratch where key = 'tournament_id')),
  0,
  'the failed persist_bracket call left no stage behind (atomic rollback)'
);

-- 2. the real payload persists successfully.
select lives_ok(
  format(
    $$ select public.persist_bracket(%L, jsonb_build_object(
         'stages', jsonb_build_array(jsonb_build_object('id', 's1', 'kind', 'single_elim', 'order', 1)),
         'groups', '[]'::jsonb,
         'matches', jsonb_build_array(
           jsonb_build_object(
             'id', 's1-wb-r1-m1', 'stageId', 's1', 'groupId', null, 'bracket', 'winners', 'round', 1, 'number', 1,
             'entry1Id', %L, 'entry2Id', %L, 'status', 'ready',
             'nextMatchId', 's1-wb-r2-m1', 'nextSlot', 1
           ),
           jsonb_build_object(
             'id', 's1-wb-r1-m2', 'stageId', 's1', 'groupId', null, 'bracket', 'winners', 'round', 1, 'number', 2,
             'entry1Id', %L, 'entry2Id', %L, 'status', 'ready',
             'nextMatchId', 's1-wb-r2-m1', 'nextSlot', 2
           ),
           jsonb_build_object(
             'id', 's1-wb-r2-m1', 'stageId', 's1', 'groupId', null, 'bracket', 'final', 'round', 2, 'number', 1,
             'entry1Id', null, 'entry2Id', null, 'status', 'locked'
           )
         )
       )) $$,
    (select value::uuid from test_scratch where key = 'tournament_id'),
    (select value from test_scratch where key = 'e1'),
    (select value from test_scratch where key = 'e4'),
    (select value from test_scratch where key = 'e2'),
    (select value from test_scratch where key = 'e3')
  ),
  'persist_bracket succeeds with a valid payload'
);

-- 3. the tournament flipped to in_progress.
select is(
  (select status::text from public.tournaments where id = (select value::uuid from test_scratch where key = 'tournament_id')),
  'in_progress',
  'persist_bracket moved the tournament to in_progress'
);

-- 4. next_match_id / next_slot were resolved from the engine keys.
select results_eq(
  format(
    $$ select next_slot from public.tournament_matches
       where tournament_id = %L and engine_key in ('s1-wb-r1-m1', 's1-wb-r1-m2') order by engine_key $$,
    (select value::uuid from test_scratch where key = 'tournament_id')
  ),
  $$ values (1::smallint), (2::smallint) $$,
  'both round-1 matches point at the correct slot of the final'
);

-- 5. a second persist_bracket call is rejected.
select throws_like(
  format($$ select public.persist_bracket(%L, '{}'::jsonb) $$, (select value::uuid from test_scratch where key = 'tournament_id')),
  'PICADO_ALREADY_GENERATED:%',
  'a second persist_bracket call is rejected'
);

-- 6. a plain member cannot confirm a result.
select tests.authenticate_as('test_ba_member');
select throws_like(
  format(
    $$ select public.confirm_match_result(id, 3, 1) from public.tournament_matches
       where tournament_id = %L and engine_key = 's1-wb-r1-m1' $$,
    (select value::uuid from test_scratch where key = 'tournament_id')
  ),
  'PICADO_FORBIDDEN:%',
  'a plain member cannot confirm a tournament match result'
);

-- 7-8. the admin confirms round 1 match 1 (seed1 beats seed4); the winner lands in the final's slot 1.
select tests.authenticate_as('test_ba_owner');
select lives_ok(
  format(
    $$ select public.confirm_match_result(id, 3, 1) from public.tournament_matches
       where tournament_id = %L and engine_key = 's1-wb-r1-m1' $$,
    (select value::uuid from test_scratch where key = 'tournament_id')
  ),
  'the admin can confirm round 1 match 1'
);
select is(
  (
    select entry1_id from public.tournament_matches
    where tournament_id = (select value::uuid from test_scratch where key = 'tournament_id') and engine_key = 's1-wb-r2-m1'
  ),
  (select value from test_scratch where key = 'e1'),
  'the winner of round 1 match 1 advanced into the final''s slot 1'
);

-- 9. the final is still `waiting` (only one slot filled).
select is(
  (
    select status::text from public.tournament_matches
    where tournament_id = (select value::uuid from test_scratch where key = 'tournament_id') and engine_key = 's1-wb-r2-m1'
  ),
  'waiting',
  'the final is waiting on its second slot'
);

-- 10. editing round 1 match 1 is still allowed (the final hasn't started).
select lives_ok(
  format(
    $$ select public.edit_match_result(id, 4, 1) from public.tournament_matches
       where tournament_id = %L and engine_key = 's1-wb-r1-m1' $$,
    (select value::uuid from test_scratch where key = 'tournament_id')
  ),
  'editing round 1 match 1 is allowed while the final has not started'
);
select is(
  (
    select score1 from public.tournament_matches
    where tournament_id = (select value::uuid from test_scratch where key = 'tournament_id') and engine_key = 's1-wb-r1-m1'
  ),
  4,
  'the edited score was recorded'
);

-- 11-12. confirm round 1 match 2 (seed2 beats seed3); the final becomes ready with both slots.
select lives_ok(
  format(
    $$ select public.confirm_match_result(id, 2, 0) from public.tournament_matches
       where tournament_id = %L and engine_key = 's1-wb-r1-m2' $$,
    (select value::uuid from test_scratch where key = 'tournament_id')
  ),
  'the admin can confirm round 1 match 2'
);
select is(
  (
    select status::text from public.tournament_matches
    where tournament_id = (select value::uuid from test_scratch where key = 'tournament_id') and engine_key = 's1-wb-r2-m1'
  ),
  'ready',
  'the final became ready once both semifinal winners resolved'
);

-- 13. editing round 1 match 1 is now blocked (the final has started, i.e. it's ready with a result pending is NOT started --
-- but per canEditResult only in_progress/completed downstream blocks editing, so it is still allowed here).
select lives_ok(
  format(
    $$ select public.edit_match_result(id, 5, 1) from public.tournament_matches
       where tournament_id = %L and engine_key = 's1-wb-r1-m1' $$,
    (select value::uuid from test_scratch where key = 'tournament_id')
  ),
  'editing round 1 match 1 is still allowed while the final is only ready, not started'
);

-- 14. re-propagate: the final's slot 1 reflects the latest edit's winner (still seed 1).
select is(
  (
    select entry1_id from public.tournament_matches
    where tournament_id = (select value::uuid from test_scratch where key = 'tournament_id') and engine_key = 's1-wb-r2-m1'
  ),
  (select value from test_scratch where key = 'e1'),
  'the final still points at seed 1 after the edit'
);

-- 15. confirm the final; the tournament now has a champion.
select lives_ok(
  format(
    $$ select public.confirm_match_result(id, 2, 2, 5, 4) from public.tournament_matches
       where tournament_id = %L and engine_key = 's1-wb-r2-m1' $$,
    (select value::uuid from test_scratch where key = 'tournament_id')
  ),
  'the admin can confirm the final via penalties'
);
select is(
  (
    select decided_by::text from public.tournament_matches
    where tournament_id = (select value::uuid from test_scratch where key = 'tournament_id') and engine_key = 's1-wb-r2-m1'
  ),
  'pens',
  'the final was decided by penalties'
);

-- 16. now editing round 1 match 1 is blocked: the final has status `completed`.
select throws_like(
  format(
    $$ select public.edit_match_result(id, 1, 1) from public.tournament_matches
       where tournament_id = %L and engine_key = 's1-wb-r1-m1' $$,
    (select value::uuid from test_scratch where key = 'tournament_id')
  ),
  'PICADO_NOT_EDITABLE:%',
  'editing round 1 match 1 is blocked once the final is completed'
);

-- 17. a tied knockout match without pens or a manual decision is rejected (KO_DRAW).
insert into test_scratch (key, value)
  select 'tournament_id_2', public.create_tournament(
    (select value::uuid from test_scratch where key = 'group_id'), 'Single Elim 2', 'single_elim', 5, 'teams'
  )::text;
select public.save_tournament_entries(
  (select value::uuid from test_scratch where key = 'tournament_id_2'),
  jsonb_build_array(jsonb_build_object('name', 'A', 'seed', 1), jsonb_build_object('name', 'B', 'seed', 2))
);
insert into test_scratch (key, value)
  select 'e1b', id::text from public.tournament_entries
  where tournament_id = (select value::uuid from test_scratch where key = 'tournament_id_2') and seed = 1;
insert into test_scratch (key, value)
  select 'e2b', id::text from public.tournament_entries
  where tournament_id = (select value::uuid from test_scratch where key = 'tournament_id_2') and seed = 2;
select public.persist_bracket(
  (select value::uuid from test_scratch where key = 'tournament_id_2'),
  jsonb_build_object(
    'stages', jsonb_build_array(jsonb_build_object('id', 's1', 'kind', 'single_elim', 'order', 1)),
    'groups', '[]'::jsonb,
    'matches', jsonb_build_array(jsonb_build_object(
      'id', 's1-wb-r1-m1', 'stageId', 's1', 'groupId', null, 'bracket', 'final', 'round', 1, 'number', 1,
      'entry1Id', (select value from test_scratch where key = 'e1b'),
      'entry2Id', (select value from test_scratch where key = 'e2b'),
      'status', 'ready'
    ))
  )
);
select throws_like(
  format(
    $$ select public.confirm_match_result(id, 1, 1) from public.tournament_matches
       where tournament_id = %L and engine_key = 's1-wb-r1-m1' $$,
    (select value::uuid from test_scratch where key = 'tournament_id_2')
  ),
  'PICADO_KO_DRAW:%',
  'a tied knockout match without pens or a manual decision is rejected'
);

-- 18. the service role (the finalizer) can confirm a result too, despite not being a group admin.
select tests.authenticate_as_service_role();
select lives_ok(
  format(
    $$ select public.confirm_match_result(id, 1, 1, 5, 4) from public.tournament_matches
       where tournament_id = %L and engine_key = 's1-wb-r1-m1' $$,
    (select value::uuid from test_scratch where key = 'tournament_id_2')
  ),
  'the service role can confirm a tournament match result'
);
select is(
  (
    select decided_by::text from public.tournament_matches
    where tournament_id = (select value::uuid from test_scratch where key = 'tournament_id_2') and engine_key = 's1-wb-r1-m1'
  ),
  'pens',
  'the service-role-confirmed result was recorded'
);

select * from finish();

rollback;
