-- set_member_role / transfer_ownership: only the owner grants or revokes admin, admins may only
-- toggle member<->spectator, the owner's own role can never be changed by set_member_role, and
-- transfer_ownership moves the owner role explicitly.
begin;

select plan(12);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_roles_owner');
select tests.create_supabase_user('test_roles_a');
select tests.create_supabase_user('test_roles_b');

select tests.authenticate_as('test_roles_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Roles Test Group')::text;
insert into test_scratch (key, value)
  select 'invite_code', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));

select tests.authenticate_as('test_roles_a');
select public.accept_invite((select value from test_scratch where key = 'invite_code'));

select tests.authenticate_as('test_roles_owner');
insert into test_scratch (key, value)
  select 'invite_code_2', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_roles_b');
select public.accept_invite((select value from test_scratch where key = 'invite_code_2'));

-- 1. a plain member cannot call set_member_role at all
select throws_like(
  format(
    $$ select public.set_member_role(%L, %L, 'spectator') $$,
    (select value::uuid from test_scratch where key = 'group_id'),
    tests.get_supabase_uid('test_roles_b')
  ),
  'PICADO_FORBIDDEN:%',
  'a plain member cannot change roles'
);

-- 2. the owner promotes test_roles_a to admin
select tests.authenticate_as('test_roles_owner');
select public.set_member_role((select value::uuid from test_scratch where key = 'group_id'), tests.get_supabase_uid('test_roles_a'), 'admin');
select is(
  (
    select role::text from public.group_members
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and user_id = tests.get_supabase_uid('test_roles_a')
  ),
  'admin',
  'the owner can promote a member to admin'
);

-- 3. the new admin cannot grant admin to someone else (only the owner can)
select tests.authenticate_as('test_roles_a');
select throws_like(
  format(
    $$ select public.set_member_role(%L, %L, 'admin') $$,
    (select value::uuid from test_scratch where key = 'group_id'),
    tests.get_supabase_uid('test_roles_b')
  ),
  'PICADO_FORBIDDEN:%',
  'a non-owner admin cannot grant admin role'
);

-- 4. that admin CAN switch a member to spectator
select public.set_member_role((select value::uuid from test_scratch where key = 'group_id'), tests.get_supabase_uid('test_roles_b'), 'spectator');
select is(
  (
    select role::text from public.group_members
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and user_id = tests.get_supabase_uid('test_roles_b')
  ),
  'spectator',
  'an admin can switch a member to spectator'
);

-- 5. the player row is kept (history) when moving to spectator
select ok(
  exists(
    select 1 from public.players
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and user_id = tests.get_supabase_uid('test_roles_b')
  ),
  'the player row is kept when moving a member to spectator'
);

-- 6. and switching back to member does not error or duplicate the player row
select lives_ok(
  format(
    $$ select public.set_member_role(%L, %L, 'member') $$,
    (select value::uuid from test_scratch where key = 'group_id'),
    tests.get_supabase_uid('test_roles_b')
  ),
  'switching a spectator back to member does not error'
);
select is(
  (
    select count(*)::int from public.players
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and user_id = tests.get_supabase_uid('test_roles_b')
  ),
  1,
  'switching back to member does not duplicate the player row'
);

-- 7. nobody can change the owner's role via set_member_role
select tests.authenticate_as('test_roles_owner');
select throws_like(
  format(
    $$ select public.set_member_role(%L, %L, 'admin') $$,
    (select value::uuid from test_scratch where key = 'group_id'),
    tests.get_supabase_uid('test_roles_owner')
  ),
  'PICADO_FORBIDDEN:%',
  'the owner role cannot be changed via set_member_role'
);

-- 8. set_member_role cannot be used to grant ownership
select throws_like(
  format(
    $$ select public.set_member_role(%L, %L, 'owner') $$,
    (select value::uuid from test_scratch where key = 'group_id'),
    tests.get_supabase_uid('test_roles_a')
  ),
  'PICADO_VALIDATION:%',
  'set_member_role cannot grant the owner role'
);

-- 9. transfer_ownership: only the current owner may call it
select tests.authenticate_as('test_roles_a');
select throws_like(
  format(
    $$ select public.transfer_ownership(%L, %L) $$,
    (select value::uuid from test_scratch where key = 'group_id'),
    tests.get_supabase_uid('test_roles_a')
  ),
  'PICADO_FORBIDDEN:%',
  'only the current owner can transfer ownership'
);

-- 10. transfer_ownership: the new owner must already be a member
select tests.authenticate_as('test_roles_owner');
select tests.create_supabase_user('test_roles_outsider');
select throws_like(
  format(
    $$ select public.transfer_ownership(%L, %L) $$,
    (select value::uuid from test_scratch where key = 'group_id'),
    tests.get_supabase_uid('test_roles_outsider')
  ),
  'PICADO_VALIDATION:%',
  'the new owner must already be a member of the group'
);

-- 11. a successful transfer flips both roles
select public.transfer_ownership((select value::uuid from test_scratch where key = 'group_id'), tests.get_supabase_uid('test_roles_a'));
select results_eq(
  format(
    $$ select role::text from public.group_members where group_id = %L and user_id in (%L, %L) order by role $$,
    (select value::uuid from test_scratch where key = 'group_id'),
    tests.get_supabase_uid('test_roles_a'),
    tests.get_supabase_uid('test_roles_owner')
  ),
  $$ values ('admin'), ('owner') $$,
  'transfer_ownership makes the new owner "owner" and the old owner "admin"'
);

select * from finish();

rollback;
