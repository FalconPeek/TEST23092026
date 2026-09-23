-- remove_member / leave_group: admin-only, owner is protected, admins cannot remove other admins
-- unless they're the owner, and removed/leaving players keep their history row (user_id cleared,
-- left_at stamped) instead of being deleted.
begin;

select plan(9);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_ml_owner');
select tests.create_supabase_user('test_ml_admin1');
select tests.create_supabase_user('test_ml_admin2');
select tests.create_supabase_user('test_ml_member1');
select tests.create_supabase_user('test_ml_member2');

select tests.authenticate_as('test_ml_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Lifecycle Test Group')::text;

-- helper: join every other user as a plain member first
select tests.authenticate_as('test_ml_owner');
insert into test_scratch (key, value) select 'code_admin1', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_ml_admin1');
select public.accept_invite((select value from test_scratch where key = 'code_admin1'));

select tests.authenticate_as('test_ml_owner');
insert into test_scratch (key, value) select 'code_admin2', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_ml_admin2');
select public.accept_invite((select value from test_scratch where key = 'code_admin2'));

select tests.authenticate_as('test_ml_owner');
insert into test_scratch (key, value) select 'code_member1', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_ml_member1');
select public.accept_invite((select value from test_scratch where key = 'code_member1'));

select tests.authenticate_as('test_ml_owner');
insert into test_scratch (key, value) select 'code_member2', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_ml_member2');
select public.accept_invite((select value from test_scratch where key = 'code_member2'));

-- 1. a plain member cannot remove anyone
select throws_like(
  format(
    $$ select public.remove_member(%L, %L) $$,
    (select value::uuid from test_scratch where key = 'group_id'),
    tests.get_supabase_uid('test_ml_member2')
  ),
  'PICADO_FORBIDDEN:%',
  'a plain member cannot remove another member'
);

select tests.authenticate_as('test_ml_owner');
select public.set_member_role((select value::uuid from test_scratch where key = 'group_id'), tests.get_supabase_uid('test_ml_admin1'), 'admin');
select public.set_member_role((select value::uuid from test_scratch where key = 'group_id'), tests.get_supabase_uid('test_ml_admin2'), 'admin');

-- 2. an admin cannot remove the owner
select tests.authenticate_as('test_ml_admin1');
select throws_like(
  format(
    $$ select public.remove_member(%L, %L) $$,
    (select value::uuid from test_scratch where key = 'group_id'),
    tests.get_supabase_uid('test_ml_owner')
  ),
  'PICADO_FORBIDDEN:%',
  'the owner cannot be removed'
);

-- 3. an admin cannot remove another admin (only the owner can)
select throws_like(
  format(
    $$ select public.remove_member(%L, %L) $$,
    (select value::uuid from test_scratch where key = 'group_id'),
    tests.get_supabase_uid('test_ml_admin2')
  ),
  'PICADO_FORBIDDEN:%',
  'a non-owner admin cannot remove another admin'
);

-- 4. the owner can remove an admin; membership disappears
select tests.authenticate_as('test_ml_owner');
select public.remove_member((select value::uuid from test_scratch where key = 'group_id'), tests.get_supabase_uid('test_ml_admin2'));
select is(
  (
    select count(*)::int from public.group_members
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and user_id = tests.get_supabase_uid('test_ml_admin2')
  ),
  0,
  'remove_member deletes the group_members row'
);

-- 5. ... but the player row survives, unlinked and stamped with left_at
select ok(
  exists(
    select 1 from public.players
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and created_by = tests.get_supabase_uid('test_ml_admin2')
      and user_id is null
      and left_at is not null
  ),
  'remove_member keeps the player row, clearing user_id and stamping left_at'
);

-- 6. a member can leave on their own
select tests.authenticate_as('test_ml_member1');
select public.leave_group((select value::uuid from test_scratch where key = 'group_id'));
select is(
  (
    select count(*)::int from public.group_members
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and user_id = tests.get_supabase_uid('test_ml_member1')
  ),
  0,
  'leave_group deletes the group_members row'
);

-- 7. their player row also survives, unlinked and stamped with left_at
select tests.authenticate_as('test_ml_owner');
select ok(
  exists(
    select 1 from public.players
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and user_id is null
      and left_at is not null
      and created_by = tests.get_supabase_uid('test_ml_member1')
  ),
  'leave_group keeps the unlinked, left_at-stamped player row'
);

-- 8. the owner cannot leave without transferring ownership first
select throws_like(
  format($$ select public.leave_group(%L) $$, (select value::uuid from test_scratch where key = 'group_id')),
  'PICADO_FORBIDDEN:%',
  'the owner cannot leave without transferring ownership first'
);

-- 9. leave_group raises for someone who is not a member of the group at all
select tests.authenticate_as('test_ml_admin2');
select throws_like(
  format($$ select public.leave_group(%L) $$, (select value::uuid from test_scratch where key = 'group_id')),
  'PICADO_NOT_MEMBER:%',
  'leave_group raises for a non-member'
);

select * from finish();

rollback;
