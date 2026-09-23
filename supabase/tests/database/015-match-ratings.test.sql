-- match_ratings + submit_match_ratings: participants (players AND spectators) can rate, gated by
-- the group's spectators_can_rate setting; no self-rating; targets must be team players of the
-- match; standout_attributes capped at 2 valid sub-attribute keys; deadline-gated; ratings are
-- private (own rows only).
begin;

select plan(18);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_mr_owner');
select tests.create_supabase_user('test_mr_member1');
select tests.create_supabase_user('test_mr_member2');
select tests.create_supabase_user('test_mr_spectator');
select tests.create_supabase_user('test_mr_outsider');

select tests.authenticate_as('test_mr_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Match Ratings Test Group')::text;

insert into test_scratch (key, value) select 'code_1', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_mr_member1');
select public.accept_invite((select value from test_scratch where key = 'code_1'));

select tests.authenticate_as('test_mr_owner');
insert into test_scratch (key, value) select 'code_2', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_mr_member2');
select public.accept_invite((select value from test_scratch where key = 'code_2'));

select tests.authenticate_as('test_mr_owner');
insert into test_scratch (key, value) select 'code_3', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_mr_spectator');
select public.accept_invite((select value from test_scratch where key = 'code_3'));
select tests.authenticate_as('test_mr_owner');
select public.set_member_role((select value::uuid from test_scratch where key = 'group_id'), tests.get_supabase_uid('test_mr_spectator'), 'spectator');

select tests.authenticate_as('test_mr_owner');
insert into test_scratch (key, value)
  select 'owner_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_mr_owner');
insert into test_scratch (key, value)
  select 'member1_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_mr_member1');
insert into test_scratch (key, value)
  select 'member2_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_mr_member2');
insert into test_scratch (key, value)
  select 'spectator_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_mr_spectator');

-- match: owner vs member1, member2 as a shooting-range bench (not in this match at all), spectator watching
insert into test_scratch (key, value)
  select 'match_id', public.create_match((select value::uuid from test_scratch where key = 'group_id'), now(), 5)::text;
select public.set_match_lineup(
  (select value::uuid from test_scratch where key = 'match_id'),
  jsonb_build_object('name', 'A', 'players', jsonb_build_array(jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'owner_player_id')))),
  jsonb_build_object('name', 'B', 'players', jsonb_build_array(jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'member1_player_id')))),
  array[(select value::uuid from test_scratch where key = 'spectator_player_id')]::uuid[]
);
select public.start_reporting((select value::uuid from test_scratch where key = 'match_id'));

-- 1. a non-participant cannot submit match ratings
select tests.authenticate_as('test_mr_member2');
select throws_like(
  format(
    $$ select public.submit_match_ratings(%L, jsonb_build_array(jsonb_build_object('target_player_id', %L, 'rating', 7))) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'owner_player_id')
  ),
  'PICADO_NOT_PARTICIPANT:%',
  'a non-participant cannot submit match ratings'
);

-- 2. a team player cannot rate themself
select tests.authenticate_as('test_mr_owner');
select throws_like(
  format(
    $$ select public.submit_match_ratings(%L, jsonb_build_array(jsonb_build_object('target_player_id', %L, 'rating', 7))) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'owner_player_id')
  ),
  'PICADO_SELF_VOTE:%',
  'a team player cannot rate themself'
);

-- 3. a team player can rate an opposing team player
select lives_ok(
  format(
    $$ select public.submit_match_ratings(%L, jsonb_build_array(jsonb_build_object('target_player_id', %L, 'rating', 8, 'standout_attributes', array['finishing']))) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'member1_player_id')
  ),
  'a team player can rate an opposing team player'
);
select is(
  (
    select rating from public.match_ratings
    where match_id = (select value::uuid from test_scratch where key = 'match_id')
      and rater_player_id = (select value::uuid from test_scratch where key = 'owner_player_id')
      and target_player_id = (select value::uuid from test_scratch where key = 'member1_player_id')
  ),
  8,
  'the rating row recorded the submitted value'
);
select is(
  (
    select rater_role::text from public.match_ratings
    where match_id = (select value::uuid from test_scratch where key = 'match_id')
      and rater_player_id = (select value::uuid from test_scratch where key = 'owner_player_id')
      and target_player_id = (select value::uuid from test_scratch where key = 'member1_player_id')
  ),
  'player',
  'the rating row captured rater_role = player'
);

-- 4. upsert: resubmitting updates the row instead of creating a new one
select public.submit_match_ratings(
  (select value::uuid from test_scratch where key = 'match_id'),
  jsonb_build_array(jsonb_build_object('target_player_id', (select value::uuid from test_scratch where key = 'member1_player_id'), 'rating', 6))
);
select is(
  (
    select count(*)::int from public.match_ratings
    where match_id = (select value::uuid from test_scratch where key = 'match_id')
      and rater_player_id = (select value::uuid from test_scratch where key = 'owner_player_id')
      and target_player_id = (select value::uuid from test_scratch where key = 'member1_player_id')
  ),
  1,
  'resubmitting a rating still leaves exactly one row'
);

-- 5. a spectator can rate (spectators_can_rate defaults to true)
select tests.authenticate_as('test_mr_spectator');
select lives_ok(
  format(
    $$ select public.submit_match_ratings(%L, jsonb_build_array(jsonb_build_object('target_player_id', %L, 'rating', 9))) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'owner_player_id')
  ),
  'a spectator can rate by default'
);

-- 6. rating out of range is rejected
select throws_like(
  format(
    $$ select public.submit_match_ratings(%L, jsonb_build_array(jsonb_build_object('target_player_id', %L, 'rating', 11))) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'member1_player_id')
  ),
  'PICADO_VALIDATION:%',
  'a rating out of 1..10 range is rejected'
);

-- 7. a target who isn't a team player of the match is rejected
select throws_like(
  format(
    $$ select public.submit_match_ratings(%L, jsonb_build_array(jsonb_build_object('target_player_id', %L, 'rating', 7))) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'member2_player_id')
  ),
  'PICADO_VALIDATION:%',
  'a target who is not a team player of the match is rejected'
);

-- 8. more than 2 standout_attributes is rejected
select throws_like(
  format(
    $$ select public.submit_match_ratings(%L, jsonb_build_array(jsonb_build_object('target_player_id', %L, 'rating', 7, 'standout_attributes', array['finishing','vision','composure']))) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'owner_player_id')
  ),
  'PICADO_VALIDATION:%',
  'more than 2 standout_attributes is rejected'
);

-- 9. an invalid standout attribute key is rejected
select throws_like(
  format(
    $$ select public.submit_match_ratings(%L, jsonb_build_array(jsonb_build_object('target_player_id', %L, 'rating', 7, 'standout_attributes', array['not_a_real_attribute']))) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'owner_player_id')
  ),
  'PICADO_VALIDATION:%',
  'an invalid standout attribute key is rejected'
);

-- 10. a face-stat key (not a sub-attribute) is rejected as a standout attribute
select throws_like(
  format(
    $$ select public.submit_match_ratings(%L, jsonb_build_array(jsonb_build_object('target_player_id', %L, 'rating', 7, 'standout_attributes', array['pac']))) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'owner_player_id')
  ),
  'PICADO_VALIDATION:%',
  'a face-stat key is rejected as a standout attribute'
);

-- 11. ratings are private: member1 cannot see the owner's rating row
select tests.authenticate_as('test_mr_member1');
select is(
  (
    select count(*)::int from public.match_ratings
    where rater_player_id = (select value::uuid from test_scratch where key = 'owner_player_id')
  ),
  0,
  'another participant cannot see the owner''s rating row'
);

-- 12. spectators_can_rate = false blocks a spectator, but not team players
select tests.authenticate_as('test_mr_owner');
select public.update_group(
  (select value::uuid from test_scratch where key = 'group_id'),
  'Match Ratings Test Group',
  jsonb_build_object('spectators_can_rate', false)
);
select tests.authenticate_as('test_mr_spectator');
select throws_like(
  format(
    $$ select public.submit_match_ratings(%L, jsonb_build_array(jsonb_build_object('target_player_id', %L, 'rating', 5))) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'member1_player_id')
  ),
  'PICADO_SPECTATOR:%',
  'a spectator is blocked once spectators_can_rate is false'
);
select tests.authenticate_as('test_mr_member1');
select lives_ok(
  format(
    $$ select public.submit_match_ratings(%L, jsonb_build_array(jsonb_build_object('target_player_id', %L, 'rating', 5))) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'owner_player_id')
  ),
  'a team player can still rate when spectators_can_rate is false'
);

-- 13. deadline: a match past its rating_deadline rejects new ratings
select tests.authenticate_as('test_mr_owner');
insert into test_scratch (key, value)
  select 'match_id_2', public.create_match((select value::uuid from test_scratch where key = 'group_id'), now(), 5)::text;
select public.set_match_lineup(
  (select value::uuid from test_scratch where key = 'match_id_2'),
  jsonb_build_object('name', 'A', 'players', jsonb_build_array(jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'owner_player_id')))),
  jsonb_build_object('name', 'B', 'players', jsonb_build_array(jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'member1_player_id')))),
  '{}'::uuid[]
);
select public.start_reporting((select value::uuid from test_scratch where key = 'match_id_2'), now() - interval '73 hours');
select throws_like(
  format(
    $$ select public.submit_match_ratings(%L, jsonb_build_array(jsonb_build_object('target_player_id', %L, 'rating', 5))) $$,
    (select value::uuid from test_scratch where key = 'match_id_2'),
    (select value::uuid from test_scratch where key = 'member1_player_id')
  ),
  'PICADO_DEADLINE_PASSED:%',
  'submit_match_ratings rejects a match whose rating window has closed'
);

-- 14. anon is denied everywhere on match_ratings
select tests.clear_authentication();
select throws_ok(
  $$ select * from public.match_ratings $$,
  '42501', null, 'anon cannot select match_ratings'
);
select throws_ok(
  format(
    $$ select public.submit_match_ratings(%L, jsonb_build_array(jsonb_build_object('target_player_id', %L, 'rating', 5))) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'member1_player_id')
  ),
  '42501', null, 'anon cannot call submit_match_ratings'
);

select * from finish();

rollback;
