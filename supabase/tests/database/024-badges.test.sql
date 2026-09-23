-- badges: a global static catalog readable by every authenticated user, denied to anon, no direct
-- writes for authenticated. player_badges: visible only to members of the awarded player's group,
-- no direct writes for authenticated; the service role (the TS badge engine) can read and write it.
begin;

select plan(14);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_b_owner');
select tests.create_supabase_user('test_b_member');
select tests.create_supabase_user('test_b_outsider');

select tests.authenticate_as('test_b_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Badges Test Group')::text;

insert into test_scratch (key, value) select 'code_member', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_b_member');
select public.accept_invite((select value from test_scratch where key = 'code_member'));

select tests.authenticate_as('test_b_owner');
insert into test_scratch (key, value)
  select 'owner_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_b_owner');

-- 1. the catalog has the ~15 seeded codes
select cmp_ok((select count(*)::int from public.badges), '>=', 15, 'the badge catalog has at least 15 seeded codes');

-- 2. any authenticated user (even one with no groups) can read the catalog
select tests.authenticate_as('test_b_outsider');
select cmp_ok(
  (select count(*)::int from public.badges),
  '>=', 15,
  'a group-less authenticated user can still read the badge catalog'
);

-- 3-4. authenticated cannot write badges
select throws_ok(
  $$ insert into public.badges (code, name_key, icon, category) values ('hack', 'x', 'x', 'participation') $$,
  '42501', null, 'authenticated cannot insert into badges'
);
select throws_ok(
  $$ update public.badges set icon = 'hacked' where code = 'first_match' $$,
  '42501', null, 'authenticated cannot update badges'
);

-- 5. anon cannot select badges
select tests.clear_authentication();
select throws_ok(
  $$ select * from public.badges $$,
  '42501', null, 'anon cannot select badges'
);

-- seed a player_badges row as the table-owning postgres role (what the TS badge engine, running
-- with the admin client / service_role, would otherwise do).
reset role;
insert into public.player_badges (player_id, badge_code, count)
values ((select value::uuid from test_scratch where key = 'owner_player_id'), 'first_match', 1);

-- 6. a group member can select the player_badges row
select tests.authenticate_as('test_b_member');
select is(
  (select count(*)::int from public.player_badges where player_id = (select value::uuid from test_scratch where key = 'owner_player_id')),
  1,
  'a group member can select a teammate''s player_badges row'
);

-- 7. a non-member sees 0 player_badges rows
select tests.authenticate_as('test_b_outsider');
select is(
  (select count(*)::int from public.player_badges where player_id = (select value::uuid from test_scratch where key = 'owner_player_id')),
  0,
  'a non-member sees no player_badges rows'
);

-- 8-9. authenticated cannot write player_badges even as the badge's own owner
select tests.authenticate_as('test_b_owner');
select throws_ok(
  format(
    $$ insert into public.player_badges (player_id, badge_code) values (%L, 'mvp') $$,
    (select value::uuid from test_scratch where key = 'owner_player_id')
  ),
  '42501', null, 'authenticated cannot insert into player_badges'
);
select throws_ok(
  format(
    $$ update public.player_badges set count = 99 where player_id = %L and badge_code = 'first_match' $$,
    (select value::uuid from test_scratch where key = 'owner_player_id')
  ),
  '42501', null, 'authenticated cannot update player_badges'
);

-- 10. anon cannot select player_badges
select tests.clear_authentication();
select throws_ok(
  $$ select * from public.player_badges $$,
  '42501', null, 'anon cannot select player_badges'
);

-- 11. service_role can write player_badges directly (this is how the badge engine awards them)
select tests.authenticate_as_service_role();
select lives_ok(
  format(
    $$ insert into public.player_badges (player_id, badge_code, count) values (%L, 'goals_25', 2)
       on conflict (player_id, badge_code) do update set count = excluded.count $$,
    (select value::uuid from test_scratch where key = 'owner_player_id')
  ),
  'service_role can insert/upsert player_badges directly'
);

-- 12-13. RLS is enabled on both tables
reset role;
select tests.rls_enabled('public', 'badges');
select tests.rls_enabled('public', 'player_badges');

-- 14. the primary key enforces one row per (player, badge) -- repeats increment count instead of
-- inserting a new row
select is(
  (select count(*)::int from public.player_badges
   where player_id = (select value::uuid from test_scratch where key = 'owner_player_id') and badge_code = 'goals_25'),
  1,
  'a repeatable badge keeps a single row per (player_id, badge_code)'
);

select * from finish();
rollback;
