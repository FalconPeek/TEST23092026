-- private.close_expired_windows / public.close_expired_windows (service_role only) transition
-- expired `reporting` matches to `pending_finalize`, leaving non-expired ones alone.
-- request_finalize / resolve_dispute are admin-only and state-gated, and resolve_dispute logs an
-- authoritative override into match_audit.
begin;

select plan(15);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_l_owner');
select tests.create_supabase_user('test_l_member');

select tests.authenticate_as('test_l_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Lifecycle Test Group')::text;

insert into test_scratch (key, value) select 'code_member', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_l_member');
select public.accept_invite((select value from test_scratch where key = 'code_member'));

select tests.authenticate_as('test_l_owner');
insert into test_scratch (key, value)
  select 'owner_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_l_owner');
insert into test_scratch (key, value)
  select 'member_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_l_member');

-- match_1: report window already expired
insert into test_scratch (key, value)
  select 'match_id_1', public.create_match((select value::uuid from test_scratch where key = 'group_id'), now(), 5)::text;
select public.set_match_lineup(
  (select value::uuid from test_scratch where key = 'match_id_1'),
  jsonb_build_object('name', 'A', 'players', jsonb_build_array(jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'owner_player_id')))),
  jsonb_build_object('name', 'B', 'players', jsonb_build_array(jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'member_player_id')))),
  '{}'::uuid[]
);
select public.start_reporting((select value::uuid from test_scratch where key = 'match_id_1'), now() - interval '49 hours');

-- match_2: report window still open
insert into test_scratch (key, value)
  select 'match_id_2', public.create_match((select value::uuid from test_scratch where key = 'group_id'), now(), 5)::text;
select public.set_match_lineup(
  (select value::uuid from test_scratch where key = 'match_id_2'),
  jsonb_build_object('name', 'A', 'players', jsonb_build_array(jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'owner_player_id')))),
  jsonb_build_object('name', 'B', 'players', jsonb_build_array(jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'member_player_id')))),
  '{}'::uuid[]
);
select public.start_reporting((select value::uuid from test_scratch where key = 'match_id_2'), now());

-- 1. public.close_expired_windows is not executable by authenticated
select tests.authenticate_as('test_l_owner');
select throws_ok(
  $$ select public.close_expired_windows() $$,
  '42501', null, 'authenticated cannot call public.close_expired_windows'
);

-- 2. public.close_expired_windows is not executable by anon
select tests.clear_authentication();
select throws_ok(
  $$ select public.close_expired_windows() $$,
  '42501', null, 'anon cannot call public.close_expired_windows'
);

-- 3-5. the service role can call it, it transitions only the expired match, and reports how many
select tests.authenticate_as_service_role();
select is(
  (select public.close_expired_windows()),
  1,
  'close_expired_windows reports 1 transitioned match'
);
reset role;
select is(
  (select status::text from public.matches where id = (select value::uuid from test_scratch where key = 'match_id_1')),
  'pending_finalize',
  'the match past its report_deadline moved to pending_finalize'
);
select is(
  (select status::text from public.matches where id = (select value::uuid from test_scratch where key = 'match_id_2')),
  'reporting',
  'the match still within its report window is untouched'
);

-- 6. a plain member cannot request_finalize
select tests.authenticate_as('test_l_member');
select throws_like(
  format($$ select public.request_finalize(%L) $$, (select value::uuid from test_scratch where key = 'match_id_2')),
  'PICADO_FORBIDDEN:%',
  'a plain member cannot request_finalize'
);

-- 7. an admin can request_finalize on a reporting match
select tests.authenticate_as('test_l_owner');
select lives_ok(
  format($$ select public.request_finalize(%L) $$, (select value::uuid from test_scratch where key = 'match_id_2')),
  'an admin can request_finalize on a reporting match'
);
select is(
  (select status::text from public.matches where id = (select value::uuid from test_scratch where key = 'match_id_2')),
  'pending_finalize',
  'request_finalize moved the match to pending_finalize'
);
select ok(
  (select rating_deadline <= now() and report_deadline <= now() from public.matches where id = (select value::uuid from test_scratch where key = 'match_id_2')),
  'request_finalize closes the report and rating windows'
);

-- 8. request_finalize rejects a match that is not in reporting
select throws_like(
  format($$ select public.request_finalize(%L) $$, (select value::uuid from test_scratch where key = 'match_id_2')),
  'PICADO_VALIDATION:%',
  'request_finalize rejects a match that is not in reporting'
);

-- Manually mark match_id_1 as disputed to exercise resolve_dispute.
reset role;
update public.matches set status = 'disputed' where id = (select value::uuid from test_scratch where key = 'match_id_1');

-- 9. a plain member cannot resolve_dispute
select tests.authenticate_as('test_l_member');
select throws_like(
  format($$ select public.resolve_dispute(%L, 2, 1) $$, (select value::uuid from test_scratch where key = 'match_id_1')),
  'PICADO_FORBIDDEN:%',
  'a plain member cannot resolve_dispute'
);

-- 10. an admin can resolve a disputed match
select tests.authenticate_as('test_l_owner');
select lives_ok(
  format(
    $$ select public.resolve_dispute(%L, 2, 1, jsonb_build_array(jsonb_build_object('subject_player_id', %L, 'goals', 2))) $$,
    (select value::uuid from test_scratch where key = 'match_id_1'),
    (select value::uuid from test_scratch where key = 'owner_player_id')
  ),
  'an admin can resolve a disputed match'
);
select is(
  (select status::text from public.matches where id = (select value::uuid from test_scratch where key = 'match_id_1')),
  'pending_finalize',
  'resolve_dispute moved the match to pending_finalize'
);

-- 11. resolve_dispute logged the override into match_audit
select is(
  (
    select count(*)::int from public.match_audit
    where match_id = (select value::uuid from test_scratch where key = 'match_id_1')
      and action = 'resolve_dispute'
  ),
  1,
  'resolve_dispute logged a match_audit row'
);

-- 12. resolve_dispute rejects a match that is not disputed
select throws_like(
  format($$ select public.resolve_dispute(%L, 1, 1) $$, (select value::uuid from test_scratch where key = 'match_id_1')),
  'PICADO_VALIDATION:%',
  'resolve_dispute rejects a match that is not disputed'
);

select * from finish();

rollback;
