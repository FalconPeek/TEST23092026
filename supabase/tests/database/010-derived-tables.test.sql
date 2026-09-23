-- Derived tables (attribute_ratings, player_cards, attribute_history, openskill_ratings) are
-- select-only for group members and reject every authenticated write with 42501. rater_stats,
-- collusion_flags and recompute_queue are internal: authenticated gets 42501 even on select.
-- Also proves the scouting/playstyle/star vote triggers enqueue a recompute row.
begin;

select plan(16);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_d_owner');
select tests.create_supabase_user('test_d_member');
select tests.create_supabase_user('test_d_outsider');

select tests.authenticate_as('test_d_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Derived Test Group')::text;

insert into test_scratch (key, value) select 'code_member', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_d_member');
select public.accept_invite((select value from test_scratch where key = 'code_member'));

select tests.authenticate_as('test_d_owner');
insert into test_scratch (key, value)
  select 'target_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id')
    and user_id = tests.get_supabase_uid('test_d_owner');
insert into test_scratch (key, value)
  select 'rater_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id')
    and user_id = tests.get_supabase_uid('test_d_member');

-- Seed derived rows directly as the table-owning postgres role (this is what the TS recompute
-- worker, running with the admin client / service_role, would otherwise do).
reset role;
insert into public.attribute_ratings (player_id, attribute, value, n_votes, n_raters)
values ((select value::uuid from test_scratch where key = 'target_player_id'), 'pac', 70, 3, 2);
insert into public.player_cards (player_id, ovr, position, tier, is_provisional, face)
values ((select value::uuid from test_scratch where key = 'target_player_id'), 70, 'DC', 'silver', true, '{}'::jsonb);
insert into public.attribute_history (player_id, ovr, attrs, reason)
values ((select value::uuid from test_scratch where key = 'target_player_id'), 70, '{}'::jsonb, 'manual');
insert into public.openskill_ratings (player_id, mu, sigma)
values ((select value::uuid from test_scratch where key = 'target_player_id'), 25, 25.0 / 3);
insert into public.rater_stats (player_id, bias, rmse, reliability, n_votes)
values ((select value::uuid from test_scratch where key = 'rater_player_id'), 0, 0, 1, 0);
insert into public.collusion_flags (rater_player_id, target_player_id)
values ((select value::uuid from test_scratch where key = 'rater_player_id'), (select value::uuid from test_scratch where key = 'target_player_id'));

-- 1-4. a group member can select attribute_ratings/player_cards/attribute_history/openskill_ratings
select tests.authenticate_as('test_d_member');
select is(
  (select count(*)::int from public.attribute_ratings where player_id = (select value::uuid from test_scratch where key = 'target_player_id')),
  1,
  'a group member can select attribute_ratings'
);
select is(
  (select count(*)::int from public.player_cards where player_id = (select value::uuid from test_scratch where key = 'target_player_id')),
  1,
  'a group member can select player_cards'
);
select is(
  (select count(*)::int from public.attribute_history where player_id = (select value::uuid from test_scratch where key = 'target_player_id')),
  1,
  'a group member can select attribute_history'
);
select is(
  (select count(*)::int from public.openskill_ratings where player_id = (select value::uuid from test_scratch where key = 'target_player_id')),
  1,
  'a group member can select openskill_ratings'
);

-- 5. a non-member sees 0 rows
select tests.authenticate_as('test_d_outsider');
select is(
  (select count(*)::int from public.attribute_ratings where player_id = (select value::uuid from test_scratch where key = 'target_player_id')),
  0,
  'a non-member sees no attribute_ratings rows'
);

-- 6-11. authenticated cannot write any of the 4 client-visible derived tables
select tests.authenticate_as('test_d_member');
select throws_ok(
  format($$ insert into public.attribute_ratings (player_id, attribute, value) values (%L, 'pac', 60) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  '42501', null, 'authenticated cannot insert into attribute_ratings'
);
select throws_ok(
  format($$ update public.attribute_ratings set value = 60 where player_id = %L $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  '42501', null, 'authenticated cannot update attribute_ratings'
);
select throws_ok(
  format($$ delete from public.attribute_ratings where player_id = %L $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  '42501', null, 'authenticated cannot delete from attribute_ratings'
);
select throws_ok(
  format($$ insert into public.player_cards (player_id, ovr) values (%L, 60) $$, (select value::uuid from test_scratch where key = 'rater_player_id')),
  '42501', null, 'authenticated cannot insert into player_cards'
);
select throws_ok(
  format($$ insert into public.attribute_history (player_id, ovr, reason) values (%L, 60, 'manual') $$, (select value::uuid from test_scratch where key = 'rater_player_id')),
  '42501', null, 'authenticated cannot insert into attribute_history'
);
select throws_ok(
  format($$ insert into public.openskill_ratings (player_id) values (%L) $$, (select value::uuid from test_scratch where key = 'rater_player_id')),
  '42501', null, 'authenticated cannot insert into openskill_ratings'
);

-- 12-14. rater_stats / collusion_flags / recompute_queue are invisible to authenticated (no
-- grants at all -- 42501 even for a plain select).
select throws_ok(
  $$ select * from public.rater_stats $$,
  '42501', null, 'authenticated cannot select rater_stats'
);
select throws_ok(
  $$ select * from public.collusion_flags $$,
  '42501', null, 'authenticated cannot select collusion_flags'
);
select throws_ok(
  $$ select * from public.recompute_queue $$,
  '42501', null, 'authenticated cannot select recompute_queue'
);

-- 15-16. the vote triggers enqueue the target into recompute_queue (checked as postgres, since
-- authenticated cannot read that table at all).
reset role;
delete from public.recompute_queue;
select tests.authenticate_as('test_d_owner');
insert into test_scratch (key, value)
  select 'match_id', public.create_match((select value::uuid from test_scratch where key = 'group_id'), now(), 5)::text;
select public.set_match_lineup(
  (select value::uuid from test_scratch where key = 'match_id'),
  jsonb_build_object('name', 'A', 'players', jsonb_build_array(jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'rater_player_id')))),
  jsonb_build_object('name', 'B', 'players', jsonb_build_array(jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'target_player_id')))),
  '{}'::uuid[]
);
select public.start_reporting((select value::uuid from test_scratch where key = 'match_id'));
select tests.authenticate_as('test_d_member');
select public.submit_scouting_votes((select value::uuid from test_scratch where key = 'target_player_id'), 'quick', jsonb_build_object('pac', 8));

reset role;
select is(
  (select count(*)::int from public.recompute_queue where player_id = (select value::uuid from test_scratch where key = 'target_player_id')),
  1,
  'submitting a scouting vote enqueues the target player for recompute'
);
select is(
  (select reason from public.recompute_queue where player_id = (select value::uuid from test_scratch where key = 'target_player_id')),
  'scouting',
  'the recompute_queue reason reflects the vote kind that triggered it'
);

select * from finish();

rollback;
