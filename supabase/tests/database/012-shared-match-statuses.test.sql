-- private.shared_match (exercised indirectly via get_scouting_status, since it has no grant to
-- authenticated): counts any match that was actually played -- reporting, disputed,
-- pending_finalize, finalized -- but NOT scheduled (hasn't happened yet) or cancelled (never
-- happened). pending_finalize/disputed/finalized have no RPC yet, so they're set directly as
-- the table-owning postgres role.
begin;

select plan(5);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_sm_owner');
select tests.create_supabase_user('test_sm_target');

select tests.authenticate_as('test_sm_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Shared Match Statuses Group')::text;

insert into test_scratch (key, value) select 'code_target', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_sm_target');
select public.accept_invite((select value from test_scratch where key = 'code_target'));

select tests.authenticate_as('test_sm_owner');
insert into test_scratch (key, value)
  select 'owner_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_sm_owner');
insert into test_scratch (key, value)
  select 'target_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_sm_target');

insert into test_scratch (key, value)
  select 'match_id', public.create_match((select value::uuid from test_scratch where key = 'group_id'), now(), 5)::text;
select public.set_match_lineup(
  (select value::uuid from test_scratch where key = 'match_id'),
  jsonb_build_object('name', 'A', 'players', jsonb_build_array(jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'owner_player_id')))),
  jsonb_build_object('name', 'B', 'players', jsonb_build_array(jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'target_player_id')))),
  '{}'::uuid[]
);

-- 1. scheduled: hasn't happened yet -> no_shared_match
select tests.authenticate_as('test_sm_owner');
select results_eq(
  format($$ select can_vote, reason from public.get_scouting_status(%L) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  $$ values (false, 'no_shared_match') $$,
  'a scheduled match does not count as a shared match'
);

-- 2. cancelled: never happened -> still no_shared_match
select public.cancel_match((select value::uuid from test_scratch where key = 'match_id'));
select results_eq(
  format($$ select can_vote, reason from public.get_scouting_status(%L) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  $$ values (false, 'no_shared_match') $$,
  'a cancelled match does not count as a shared match'
);

-- 3. pending_finalize: played, windows closed, awaiting the finalize job -> counts
reset role;
update public.matches set status = 'pending_finalize' where id = (select value::uuid from test_scratch where key = 'match_id');
select tests.authenticate_as('test_sm_owner');
select results_eq(
  format($$ select can_vote, reason from public.get_scouting_status(%L) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  $$ values (true, 'ok') $$,
  'a pending_finalize match counts as a shared match'
);

-- 4. disputed: played, score/stats contested -> still counts
reset role;
update public.matches set status = 'disputed' where id = (select value::uuid from test_scratch where key = 'match_id');
select tests.authenticate_as('test_sm_owner');
select results_eq(
  format($$ select can_vote, reason from public.get_scouting_status(%L) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  $$ values (true, 'ok') $$,
  'a disputed match counts as a shared match'
);

-- 5. finalized -> still counts
reset role;
update public.matches set status = 'finalized' where id = (select value::uuid from test_scratch where key = 'match_id');
select tests.authenticate_as('test_sm_owner');
select results_eq(
  format($$ select can_vote, reason from public.get_scouting_status(%L) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  $$ values (true, 'ok') $$,
  'a finalized match counts as a shared match'
);

select * from finish();

rollback;
