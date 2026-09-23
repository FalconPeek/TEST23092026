-- anon (no grants at all) can neither read any of the new matches/scouting/derived tables nor
-- call any of the new SECURITY DEFINER RPCs.
begin;

select plan(22);

select tests.clear_authentication();

select throws_ok($$ select * from public.matches $$, '42501', null, 'anon cannot select matches');
select throws_ok($$ select * from public.match_teams $$, '42501', null, 'anon cannot select match_teams');
select throws_ok($$ select * from public.match_participants $$, '42501', null, 'anon cannot select match_participants');
select throws_ok($$ select * from public.scouting_votes $$, '42501', null, 'anon cannot select scouting_votes');
select throws_ok($$ select * from public.playstyle_votes $$, '42501', null, 'anon cannot select playstyle_votes');
select throws_ok($$ select * from public.star_votes $$, '42501', null, 'anon cannot select star_votes');
select throws_ok($$ select * from public.attribute_ratings $$, '42501', null, 'anon cannot select attribute_ratings');
select throws_ok($$ select * from public.player_cards $$, '42501', null, 'anon cannot select player_cards');
select throws_ok($$ select * from public.attribute_history $$, '42501', null, 'anon cannot select attribute_history');
select throws_ok($$ select * from public.openskill_ratings $$, '42501', null, 'anon cannot select openskill_ratings');
select throws_ok($$ select * from public.rater_stats $$, '42501', null, 'anon cannot select rater_stats');
select throws_ok($$ select * from public.collusion_flags $$, '42501', null, 'anon cannot select collusion_flags');
select throws_ok($$ select * from public.recompute_queue $$, '42501', null, 'anon cannot select recompute_queue');

select throws_ok($$ select public.create_match(gen_random_uuid(), now(), 5) $$, '42501', null, 'anon cannot call create_match');
select throws_ok(
  $$ select public.set_match_lineup(gen_random_uuid(), '{}'::jsonb, '{}'::jsonb, '{}'::uuid[]) $$,
  '42501', null, 'anon cannot call set_match_lineup'
);
select throws_ok($$ select public.cancel_match(gen_random_uuid()) $$, '42501', null, 'anon cannot call cancel_match');
select throws_ok($$ select public.start_reporting(gen_random_uuid()) $$, '42501', null, 'anon cannot call start_reporting');
select throws_ok(
  $$ select public.submit_scouting_votes(gen_random_uuid(), 'quick', '{}'::jsonb) $$,
  '42501', null, 'anon cannot call submit_scouting_votes'
);
select throws_ok(
  $$ select public.submit_playstyle_votes(gen_random_uuid(), '{}'::text[]) $$,
  '42501', null, 'anon cannot call submit_playstyle_votes'
);
select throws_ok(
  $$ select public.submit_star_votes(gen_random_uuid(), 3, 3) $$,
  '42501', null, 'anon cannot call submit_star_votes'
);
select throws_ok(
  $$ select public.get_my_scouting_ballot(gen_random_uuid()) $$,
  '42501', null, 'anon cannot call get_my_scouting_ballot'
);
select throws_ok(
  $$ select public.get_scouting_status(gen_random_uuid()) $$,
  '42501', null, 'anon cannot call get_scouting_status'
);

select * from finish();

rollback;
