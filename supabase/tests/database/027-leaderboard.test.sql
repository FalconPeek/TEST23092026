-- get_group_leaderboard / get_player_impacto: membership + metric validation, correct ordering
-- and ranking, the impacto percentile's 1..99 bounds, avg_rating's "min 3 rated matches" rule,
-- and that players who left the group never appear despite having the best raw numbers.
begin;

select plan(17);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_l_owner');
select tests.create_supabase_user('test_l_b');
select tests.create_supabase_user('test_l_c');
select tests.create_supabase_user('test_l_outsider');

select tests.authenticate_as('test_l_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Leaderboard Test Group')::text;

insert into test_scratch (key, value) select 'code_b', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_l_b');
select public.accept_invite((select value from test_scratch where key = 'code_b'));

select tests.authenticate_as('test_l_owner');
insert into test_scratch (key, value) select 'code_c', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_l_c');
select public.accept_invite((select value from test_scratch where key = 'code_c'));

select tests.authenticate_as('test_l_owner');
insert into test_scratch (key, value)
  select 'owner_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_l_owner');
insert into test_scratch (key, value)
  select 'b_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_l_b');
insert into test_scratch (key, value)
  select 'c_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_l_c');
insert into test_scratch (key, value)
  select 'left_player_id', public.add_guest_player((select value::uuid from test_scratch where key = 'group_id'), 'Se Fue')::text;

insert into test_scratch (key, value) select 'm1', public.create_match((select value::uuid from test_scratch where key = 'group_id'), now(), 5)::text;
insert into test_scratch (key, value) select 'm2', public.create_match((select value::uuid from test_scratch where key = 'group_id'), now(), 5)::text;
insert into test_scratch (key, value) select 'm3', public.create_match((select value::uuid from test_scratch where key = 'group_id'), now(), 5)::text;

-- Seed derived data + simulate the guest having left, all directly as the table-owning postgres
-- role (what the TS finalizer / remove_member would otherwise do).
reset role;

update public.players set left_at = now()
where id = (select value::uuid from test_scratch where key = 'left_player_id');

insert into public.match_stats (match_id, player_id, goals, median_rating, is_mvp, clean_sheet) values
  ((select value::uuid from test_scratch where key = 'm1'), (select value::uuid from test_scratch where key = 'owner_player_id'), 2, 8, false, false),
  ((select value::uuid from test_scratch where key = 'm2'), (select value::uuid from test_scratch where key = 'owner_player_id'), 1, 7, false, false),
  ((select value::uuid from test_scratch where key = 'm3'), (select value::uuid from test_scratch where key = 'owner_player_id'), 2, 9, true, false),
  ((select value::uuid from test_scratch where key = 'm1'), (select value::uuid from test_scratch where key = 'b_player_id'), 1, null, false, false),
  ((select value::uuid from test_scratch where key = 'm2'), (select value::uuid from test_scratch where key = 'b_player_id'), 2, null, false, true),
  ((select value::uuid from test_scratch where key = 'm3'), (select value::uuid from test_scratch where key = 'b_player_id'), 0, null, false, false),
  ((select value::uuid from test_scratch where key = 'm1'), (select value::uuid from test_scratch where key = 'c_player_id'), 0, 6, false, false),
  ((select value::uuid from test_scratch where key = 'm2'), (select value::uuid from test_scratch where key = 'c_player_id'), 1, 5, false, false),
  ((select value::uuid from test_scratch where key = 'm3'), (select value::uuid from test_scratch where key = 'c_player_id'), 0, null, false, false),
  ((select value::uuid from test_scratch where key = 'm1'), (select value::uuid from test_scratch where key = 'left_player_id'), 10, 9, true, true);

insert into public.player_cards (player_id, ovr, tier, is_provisional, face) values
  ((select value::uuid from test_scratch where key = 'owner_player_id'), 80, 'gold', false, '{}'::jsonb),
  ((select value::uuid from test_scratch where key = 'b_player_id'), 70, 'silver', false, '{}'::jsonb),
  ((select value::uuid from test_scratch where key = 'c_player_id'), 60, 'bronze', false, '{}'::jsonb),
  ((select value::uuid from test_scratch where key = 'left_player_id'), 99, 'special', false, '{}'::jsonb);

insert into public.openskill_ratings (player_id, mu, sigma, ordinal, matches_played) values
  ((select value::uuid from test_scratch where key = 'owner_player_id'), 30, 8.3, 30, 5),
  ((select value::uuid from test_scratch where key = 'b_player_id'), 25, 8.3, 20, 3),
  ((select value::uuid from test_scratch where key = 'c_player_id'), 20, 8.3, 10, 2),
  ((select value::uuid from test_scratch where key = 'left_player_id'), 40, 8.3, 99, 10);

-- 1. non-member rejected
select tests.authenticate_as('test_l_outsider');
select throws_like(
  format($$ select * from public.get_group_leaderboard(%L, 'goals', 20) $$, (select value::uuid from test_scratch where key = 'group_id')),
  'PICADO_NOT_MEMBER:%',
  'a non-member is rejected by get_group_leaderboard'
);

-- 2. unknown metric rejected
select tests.authenticate_as('test_l_owner');
select throws_like(
  format($$ select * from public.get_group_leaderboard(%L, 'not_a_metric', 20) $$, (select value::uuid from test_scratch where key = 'group_id')),
  'PICADO_VALIDATION:%',
  'an unknown metric is rejected'
);

-- 3-4. goals: correct order/ranks, and the player who left never appears despite scoring most
select is(
  (select array_agg(player_id) from (
    select player_id from public.get_group_leaderboard((select value::uuid from test_scratch where key = 'group_id'), 'goals', 20) order by rank
  ) x),
  array[
    (select value::uuid from test_scratch where key = 'owner_player_id'),
    (select value::uuid from test_scratch where key = 'b_player_id'),
    (select value::uuid from test_scratch where key = 'c_player_id')
  ],
  'goals leaderboard is ordered owner > b > c'
);
select is(
  (select count(*)::int from public.get_group_leaderboard((select value::uuid from test_scratch where key = 'group_id'), 'goals', 20)),
  3,
  'the player who left never appears on the leaderboard despite having the most goals'
);

-- 5. ovr leaderboard order, left player excluded
select is(
  (select array_agg(player_id) from (
    select player_id from public.get_group_leaderboard((select value::uuid from test_scratch where key = 'group_id'), 'ovr', 20) order by rank
  ) x),
  array[
    (select value::uuid from test_scratch where key = 'owner_player_id'),
    (select value::uuid from test_scratch where key = 'b_player_id'),
    (select value::uuid from test_scratch where key = 'c_player_id')
  ],
  'ovr leaderboard is ordered owner > b > c'
);

-- 6. impacto: bounds are 1..99, ordered the same as ordinal, left player excluded
select is(
  (select count(*)::int from public.get_group_leaderboard((select value::uuid from test_scratch where key = 'group_id'), 'impacto', 20)),
  3,
  'impacto leaderboard excludes the player who left'
);
select ok(
  (select bool_and(value >= 1 and value <= 99) from public.get_group_leaderboard((select value::uuid from test_scratch where key = 'group_id'), 'impacto', 20)),
  'every impacto value is within 1..99'
);
select is(
  (select value::int from public.get_group_leaderboard((select value::uuid from test_scratch where key = 'group_id'), 'impacto', 20) where player_id = (select value::uuid from test_scratch where key = 'owner_player_id')),
  99,
  'the highest-ordinal player gets impacto 99'
);
select is(
  (select value::int from public.get_group_leaderboard((select value::uuid from test_scratch where key = 'group_id'), 'impacto', 20) where player_id = (select value::uuid from test_scratch where key = 'c_player_id')),
  1,
  'the lowest-ordinal player gets impacto 1'
);

-- 7. avg_rating requires >= 3 rated matches: only the owner (3 ratings) qualifies; b (0) and c (2) don't
select is(
  (select array_agg(player_id) from (
    select player_id from public.get_group_leaderboard((select value::uuid from test_scratch where key = 'group_id'), 'avg_rating', 20)
  ) x),
  array[(select value::uuid from test_scratch where key = 'owner_player_id')],
  'avg_rating only ranks players with at least 3 rated matches'
);
select is(
  (select round(value, 1) from public.get_group_leaderboard((select value::uuid from test_scratch where key = 'group_id'), 'avg_rating', 20) where player_id = (select value::uuid from test_scratch where key = 'owner_player_id')),
  8.0,
  'the owner''s avg_rating is the mean of their 3 median_rating values'
);

-- 8. matches metric: every active player played 3 matches
select is(
  (select count(*)::int from public.get_group_leaderboard((select value::uuid from test_scratch where key = 'group_id'), 'matches', 20) where value = 3),
  3,
  'every active player has matches_played = 3'
);

-- 9. limit is respected
select is(
  (select count(*)::int from public.get_group_leaderboard((select value::uuid from test_scratch where key = 'group_id'), 'goals', 2)),
  2,
  'p_limit caps the number of rows returned'
);

-- 10. limit out of range rejected
select throws_like(
  format($$ select * from public.get_group_leaderboard(%L, 'goals', 0) $$, (select value::uuid from test_scratch where key = 'group_id')),
  'PICADO_VALIDATION:%',
  'a limit of 0 is rejected'
);

-- 11-12. get_player_impacto: matches the leaderboard's value, null for a left player, membership enforced
select is(public.get_player_impacto((select value::uuid from test_scratch where key = 'owner_player_id')), 99, 'get_player_impacto matches the leaderboard value');
select is(public.get_player_impacto((select value::uuid from test_scratch where key = 'left_player_id')), null, 'get_player_impacto is null for a player who left');

select tests.authenticate_as('test_l_outsider');
select throws_like(
  format($$ select public.get_player_impacto(%L) $$, (select value::uuid from test_scratch where key = 'owner_player_id')),
  'PICADO_NOT_MEMBER:%',
  'get_player_impacto rejects a non-member caller'
);

select * from finish();
rollback;
