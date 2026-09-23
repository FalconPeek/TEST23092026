-- Grand-final reset (double_elim): GF2 is archived when the WB-path entrant wins GF1, activated
-- when the LB-path entrant wins -- mirrors lib/brackets/engine.ts handleGrandFinalTransition.
-- Also: seed_knockout_from_groups resolving a vacant qualifier slot cascades a BYE through
-- private.tm_set_slot exactly like lib/brackets/propagation.ts's tryAutoResolveBye/propagateResult,
-- including a double-BYE match propagating BYE onward into the next round.
begin;

select plan(13);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_gf_owner');
select tests.authenticate_as('test_gf_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Grand Final Group')::text;

-- ### Scenario A: the WB-path entrant wins GF1 -> GF2 (the reset match) is archived, never played.
insert into test_scratch (key, value)
  select 'archive_tid', public.create_tournament(
    (select value::uuid from test_scratch where key = 'group_id'), 'DE Archive', 'double_elim', 5, 'teams'
  )::text;
select public.save_tournament_entries(
  (select value::uuid from test_scratch where key = 'archive_tid'),
  jsonb_build_array(jsonb_build_object('name', 'P1', 'seed', 1), jsonb_build_object('name', 'P2', 'seed', 2))
);
insert into test_scratch (key, value)
  select 'a_p1', id::text from public.tournament_entries
  where tournament_id = (select value::uuid from test_scratch where key = 'archive_tid') and seed = 1;
insert into test_scratch (key, value)
  select 'a_p2', id::text from public.tournament_entries
  where tournament_id = (select value::uuid from test_scratch where key = 'archive_tid') and seed = 2;

-- Degenerate 2-entry double-elim (lib/brackets/double-elim.ts): WB1's winner -> GF1 slot1, WB1's
-- loser -> GF1 slot2 directly (no losers bracket at all for k=1).
select public.persist_bracket(
  (select value::uuid from test_scratch where key = 'archive_tid'),
  jsonb_build_object(
    'stages', jsonb_build_array(jsonb_build_object('id', 's1', 'kind', 'double_elim', 'order', 1)),
    'groups', '[]'::jsonb,
    'matches', jsonb_build_array(
      jsonb_build_object(
        'id', 's1-wb-r1-m1', 'stageId', 's1', 'groupId', null, 'bracket', 'winners', 'round', 1, 'number', 1,
        'entry1Id', (select value from test_scratch where key = 'a_p1'),
        'entry2Id', (select value from test_scratch where key = 'a_p2'),
        'status', 'ready',
        'nextMatchId', 's1-gf-r1-m1', 'nextSlot', 1,
        'nextLoserMatchId', 's1-gf-r1-m1', 'nextLoserSlot', 2
      ),
      jsonb_build_object(
        'id', 's1-gf-r1-m1', 'stageId', 's1', 'groupId', null, 'bracket', 'final', 'round', 1, 'number', 1,
        'entry1Id', null, 'entry2Id', null, 'status', 'locked'
      ),
      jsonb_build_object(
        'id', 's1-gf-r2-m1', 'stageId', 's1', 'groupId', null, 'bracket', 'final', 'round', 2, 'number', 1,
        'entry1Id', null, 'entry2Id', null, 'status', 'locked'
      )
    )
  )
);

-- 1. confirming WB1 fills both slots of GF1 at once (winner -> slot1, loser -> slot2).
select lives_ok(
  format(
    $$ select public.confirm_match_result(id, 3, 0) from public.tournament_matches
       where tournament_id = %L and engine_key = 's1-wb-r1-m1' $$,
    (select value::uuid from test_scratch where key = 'archive_tid')
  ),
  'confirming WB1 fills both slots of GF1'
);
select is(
  (
    select status::text from public.tournament_matches
    where tournament_id = (select value::uuid from test_scratch where key = 'archive_tid') and engine_key = 's1-gf-r1-m1'
  ),
  'ready',
  'GF1 is ready with both the WB winner and the WB loser'
);

-- 2. the WB-path entrant (slot 1, P1) wins GF1 -> GF2 is archived.
select public.confirm_match_result(
  (select id from public.tournament_matches
   where tournament_id = (select value::uuid from test_scratch where key = 'archive_tid') and engine_key = 's1-gf-r1-m1'),
  2, 0
);
select is(
  (
    select status::text from public.tournament_matches
    where tournament_id = (select value::uuid from test_scratch where key = 'archive_tid') and engine_key = 's1-gf-r2-m1'
  ),
  'archived',
  'GF2 is archived when the WB-path entrant wins GF1'
);

-- ### Scenario B: the LB-path entrant wins GF1 -> GF2 (the reset) is activated and playable.
insert into test_scratch (key, value)
  select 'reset_tid', public.create_tournament(
    (select value::uuid from test_scratch where key = 'group_id'), 'DE Reset', 'double_elim', 5, 'teams'
  )::text;
select public.save_tournament_entries(
  (select value::uuid from test_scratch where key = 'reset_tid'),
  jsonb_build_array(jsonb_build_object('name', 'P1', 'seed', 1), jsonb_build_object('name', 'P2', 'seed', 2))
);
insert into test_scratch (key, value)
  select 'b_p1', id::text from public.tournament_entries
  where tournament_id = (select value::uuid from test_scratch where key = 'reset_tid') and seed = 1;
insert into test_scratch (key, value)
  select 'b_p2', id::text from public.tournament_entries
  where tournament_id = (select value::uuid from test_scratch where key = 'reset_tid') and seed = 2;

select public.persist_bracket(
  (select value::uuid from test_scratch where key = 'reset_tid'),
  jsonb_build_object(
    'stages', jsonb_build_array(jsonb_build_object('id', 's1', 'kind', 'double_elim', 'order', 1)),
    'groups', '[]'::jsonb,
    'matches', jsonb_build_array(
      jsonb_build_object(
        'id', 's1-wb-r1-m1', 'stageId', 's1', 'groupId', null, 'bracket', 'winners', 'round', 1, 'number', 1,
        'entry1Id', (select value from test_scratch where key = 'b_p1'),
        'entry2Id', (select value from test_scratch where key = 'b_p2'),
        'status', 'ready',
        'nextMatchId', 's1-gf-r1-m1', 'nextSlot', 1,
        'nextLoserMatchId', 's1-gf-r1-m1', 'nextLoserSlot', 2
      ),
      jsonb_build_object(
        'id', 's1-gf-r1-m1', 'stageId', 's1', 'groupId', null, 'bracket', 'final', 'round', 1, 'number', 1,
        'entry1Id', null, 'entry2Id', null, 'status', 'locked'
      ),
      jsonb_build_object(
        'id', 's1-gf-r2-m1', 'stageId', 's1', 'groupId', null, 'bracket', 'final', 'round', 2, 'number', 1,
        'entry1Id', null, 'entry2Id', null, 'status', 'locked'
      )
    )
  )
);
select public.confirm_match_result(
  (select id from public.tournament_matches
   where tournament_id = (select value::uuid from test_scratch where key = 'reset_tid') and engine_key = 's1-wb-r1-m1'),
  3, 0
);

-- 3-4. the LB-path entrant (slot 2, P2) wins GF1 -> GF2 activates with both entries filled.
select public.confirm_match_result(
  (select id from public.tournament_matches
   where tournament_id = (select value::uuid from test_scratch where key = 'reset_tid') and engine_key = 's1-gf-r1-m1'),
  1, 2
);
select is(
  (
    select status::text from public.tournament_matches
    where tournament_id = (select value::uuid from test_scratch where key = 'reset_tid') and engine_key = 's1-gf-r2-m1'
  ),
  'ready',
  'GF2 activates when the LB-path entrant wins GF1'
);
select results_eq(
  format(
    $$ select entry1_id, entry2_id from public.tournament_matches
       where tournament_id = %L and engine_key = 's1-gf-r2-m1' $$,
    (select value::uuid from test_scratch where key = 'reset_tid')
  ),
  format(
    $$ values (%L::text, %L::text) $$,
    (select value from test_scratch where key = 'b_p1'),
    (select value from test_scratch where key = 'b_p2')
  ),
  'GF2 is seeded with the same two entries as GF1'
);

-- 5. once GF2 has started (here: completed), editing GF1 is blocked.
select public.confirm_match_result(
  (select id from public.tournament_matches
   where tournament_id = (select value::uuid from test_scratch where key = 'reset_tid') and engine_key = 's1-gf-r2-m1'),
  2, 1
);
select throws_like(
  format(
    $$ select public.edit_match_result(id, 0, 3) from public.tournament_matches
       where tournament_id = %L and engine_key = 's1-gf-r1-m1' $$,
    (select value::uuid from test_scratch where key = 'reset_tid')
  ),
  'PICADO_NOT_EDITABLE:%',
  'GF1 cannot be edited once GF2 (the reset) has started'
);

-- ### Scenario C: seed_knockout_from_groups cascades a BYE (and a double-BYE cascades further).
insert into test_scratch (key, value)
  select 'ko_tid', public.create_tournament(
    (select value::uuid from test_scratch where key = 'group_id'), 'Groups KO', 'groups_ko', 5, 'teams'
  )::text;
select public.save_tournament_entries(
  (select value::uuid from test_scratch where key = 'ko_tid'),
  jsonb_build_array(jsonb_build_object('name', 'Qualifier X', 'seed', 1))
);
insert into test_scratch (key, value)
  select 'x', id::text from public.tournament_entries
  where tournament_id = (select value::uuid from test_scratch where key = 'ko_tid') and seed = 1;

-- Round 1: m1 = A#1 v B#1 (B is a vacant/bye group) -> feeds round 2 slot 1.
--          m2 = C#1 v D#1 (both vacant/bye groups)   -> feeds round 2 slot 2.
-- Round 2 (the final) starts locked; once both round-1 matches resolve it should itself cascade
-- (one real entry X vs a BYE) straight to `completed`.
select public.persist_bracket(
  (select value::uuid from test_scratch where key = 'ko_tid'),
  jsonb_build_object(
    'stages', jsonb_build_array(jsonb_build_object('id', 's2', 'kind', 'knockout', 'order', 2)),
    'groups', '[]'::jsonb,
    'matches', jsonb_build_array(
      jsonb_build_object(
        'id', 's2-wb-r1-m1', 'stageId', 's2', 'groupId', null, 'bracket', 'winners', 'round', 1, 'number', 1,
        'entry1Id', null, 'entry2Id', null,
        'entry1From', jsonb_build_object('fromGroup', 'A', 'rank', 1),
        'entry2From', jsonb_build_object('fromGroup', 'B', 'rank', 1),
        'status', 'locked', 'nextMatchId', 's2-wb-r2-m1', 'nextSlot', 1
      ),
      jsonb_build_object(
        'id', 's2-wb-r1-m2', 'stageId', 's2', 'groupId', null, 'bracket', 'winners', 'round', 1, 'number', 2,
        'entry1Id', null, 'entry2Id', null,
        'entry1From', jsonb_build_object('fromGroup', 'C', 'rank', 1),
        'entry2From', jsonb_build_object('fromGroup', 'D', 'rank', 1),
        'status', 'locked', 'nextMatchId', 's2-wb-r2-m1', 'nextSlot', 2
      ),
      jsonb_build_object(
        'id', 's2-wb-r2-m1', 'stageId', 's2', 'groupId', null, 'bracket', 'final', 'round', 2, 'number', 1,
        'entry1Id', null, 'entry2Id', null, 'status', 'locked'
      )
    )
  )
);

select public.seed_knockout_from_groups(
  (select value::uuid from test_scratch where key = 'ko_tid'),
  jsonb_build_array(
    jsonb_build_object('group', 'A', 'entries', jsonb_build_array((select value from test_scratch where key = 'x'))),
    jsonb_build_object('group', 'C', 'entries', jsonb_build_array(null))
  )
);

-- 6. m1 is `waiting` (only its group-A slot resolved so far).
select is(
  (
    select status::text from public.tournament_matches
    where tournament_id = (select value::uuid from test_scratch where key = 'ko_tid') and engine_key = 's2-wb-r1-m1'
  ),
  'waiting',
  'round 1 match 1 is waiting on group B''s qualifier'
);

select public.seed_knockout_from_groups(
  (select value::uuid from test_scratch where key = 'ko_tid'),
  jsonb_build_array(
    jsonb_build_object('group', 'B', 'entries', jsonb_build_array(null)),
    jsonb_build_object('group', 'D', 'entries', jsonb_build_array(null))
  )
);

-- 7-8. m1 auto-completed (X vs BYE) once group B resolved to a vacant slot.
select is(
  (
    select status::text from public.tournament_matches
    where tournament_id = (select value::uuid from test_scratch where key = 'ko_tid') and engine_key = 's2-wb-r1-m1'
  ),
  'completed',
  'round 1 match 1 auto-completed once its BYE slot resolved'
);
select is(
  (
    select winner_entry_id::text from public.tournament_matches
    where tournament_id = (select value::uuid from test_scratch where key = 'ko_tid') and engine_key = 's2-wb-r1-m1'
  ),
  (select value from test_scratch where key = 'x'),
  'the real entry (not the BYE) is recorded as the winner'
);

-- 9-10. m2 also auto-completed, as a double-BYE (both C and D were vacant): no winner, and BYE
-- itself propagates onward into round 2's slot 2.
select is(
  (
    select decided_by::text from public.tournament_matches
    where tournament_id = (select value::uuid from test_scratch where key = 'ko_tid') and engine_key = 's2-wb-r1-m2'
  ),
  'bye',
  'round 1 match 2 (a double-BYE) completed via a bye decision'
);
select ok(
  (
    select winner_entry_id is null from public.tournament_matches
    where tournament_id = (select value::uuid from test_scratch where key = 'ko_tid') and engine_key = 's2-wb-r1-m2'
  ),
  'round 1 match 2 (a double-BYE) has no winner'
);

-- 11-12. the cascade reaches the final: X (real) vs BYE (propagated from m2) -> auto-completes too.
select is(
  (
    select status::text from public.tournament_matches
    where tournament_id = (select value::uuid from test_scratch where key = 'ko_tid') and engine_key = 's2-wb-r2-m1'
  ),
  'completed',
  'the final auto-completed: the BYE cascaded two levels deep'
);
select is(
  (
    select winner_entry_id::text from public.tournament_matches
    where tournament_id = (select value::uuid from test_scratch where key = 'ko_tid') and engine_key = 's2-wb-r2-m1'
  ),
  (select value from test_scratch where key = 'x'),
  'X is the tournament champion, having faced two BYEs'
);

select * from finish();

rollback;
