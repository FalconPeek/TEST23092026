-- create_group bootstraps an owner membership + player row; group/member/player/invite data is
-- only visible to members (invites: admins only); no direct writes are possible on any of these
-- tables, only through the RPCs.
begin;

select plan(13);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_gm_owner');
select tests.create_supabase_user('test_gm_outsider');
select tests.create_supabase_user('test_gm_member');

select tests.authenticate_as('test_gm_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Los Pibes')::text;

-- 1. create_group returns a real group id
select ok(
  (select value from test_scratch where key = 'group_id') is not null,
  'create_group returns a group id'
);

-- 2. create_group makes the caller the owner in group_members
select is(
  (
    select role::text from public.group_members
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and user_id = tests.get_supabase_uid('test_gm_owner')
  ),
  'owner',
  'create_group inserts an owner membership row'
);

-- 3. create_group creates a non-guest player row for the owner
select ok(
  exists(
    select 1 from public.players
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and user_id = tests.get_supabase_uid('test_gm_owner')
      and is_guest = false
  ),
  'create_group creates a player row for the owner'
);

-- 4. the owner can see their own group
select is(
  (select count(*)::int from public.groups where id = (select value::uuid from test_scratch where key = 'group_id')),
  1,
  'the owner can select their own group'
);

select tests.authenticate_as('test_gm_outsider');

-- 5-8. a user outside the group sees nothing about it
select is(
  (select count(*)::int from public.groups where id = (select value::uuid from test_scratch where key = 'group_id')),
  0,
  'a non-member cannot select the group'
);
select is(
  (select count(*)::int from public.group_members where group_id = (select value::uuid from test_scratch where key = 'group_id')),
  0,
  'a non-member cannot select group_members'
);
select is(
  (select count(*)::int from public.players where group_id = (select value::uuid from test_scratch where key = 'group_id')),
  0,
  'a non-member cannot select players'
);
select is(
  (select count(*)::int from public.invites where group_id = (select value::uuid from test_scratch where key = 'group_id')),
  0,
  'a non-member cannot select invites'
);

-- Bring in a plain (non-admin) member to check invites are admin-only, not just member-only.
select tests.authenticate_as('test_gm_owner');
insert into test_scratch (key, value)
  select 'invite_code', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));

select tests.authenticate_as('test_gm_member');
select public.accept_invite((select value from test_scratch where key = 'invite_code'));

-- 9. a plain member (not admin/owner) still cannot see invites
select is(
  (select count(*)::int from public.invites where group_id = (select value::uuid from test_scratch where key = 'group_id')),
  0,
  'a plain member cannot select invites (admin-only)'
);

select tests.authenticate_as('test_gm_owner');

-- 10-13. no direct writes on any of these tables: authenticated has select-only grants.
select throws_ok(
  format($$ insert into public.groups (name, slug, owner_id) values ('x', 'x-%s', %L) $$, floor(random() * 1000000), tests.get_supabase_uid('test_gm_owner')),
  '42501',
  null,
  'authenticated cannot insert directly into groups'
);
select throws_ok(
  format($$ update public.groups set name = 'hacked' where id = %L $$, (select value::uuid from test_scratch where key = 'group_id')),
  '42501',
  null,
  'authenticated cannot update groups directly'
);
select throws_ok(
  format(
    $$ delete from public.group_members where group_id = %L and user_id = %L $$,
    (select value::uuid from test_scratch where key = 'group_id'),
    tests.get_supabase_uid('test_gm_member')
  ),
  '42501',
  null,
  'authenticated cannot delete group_members directly'
);
select throws_ok(
  format($$ insert into public.players (group_id, display_name, is_guest, created_by) values (%L, 'x', true, %L) $$, (select value::uuid from test_scratch where key = 'group_id'), tests.get_supabase_uid('test_gm_owner')),
  '42501',
  null,
  'authenticated cannot insert directly into players'
);

select * from finish();

rollback;
