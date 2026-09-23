-- create_invite / revoke_invite / get_invite_preview / accept_invite: membership + role rules,
-- expiry, revocation, usage limits, idempotency, and spectators getting no player row.
begin;

select plan(16);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_inv_owner');
select tests.create_supabase_user('test_inv_member');
select tests.create_supabase_user('test_inv_spectator');
select tests.create_supabase_user('test_inv_admin');
select tests.create_supabase_user('test_inv_extra_a');
select tests.create_supabase_user('test_inv_extra_b');

select tests.authenticate_as('test_inv_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Invite Test Group')::text;

-- 1. a plain member cannot create invites
insert into test_scratch (key, value)
  select 'member_invite_code', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_inv_member');
select public.accept_invite((select value from test_scratch where key = 'member_invite_code'));
select throws_like(
  format($$ select public.create_invite(%L) $$, (select value::uuid from test_scratch where key = 'group_id')),
  'PICADO_FORBIDDEN:%',
  'a plain member cannot create invites'
);

-- 2. an admin (not owner) cannot create an admin-role invite
select tests.authenticate_as('test_inv_owner');
insert into test_scratch (key, value)
  select 'admin_invite_code', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'), 'admin');
select tests.authenticate_as('test_inv_admin');
select public.accept_invite((select value from test_scratch where key = 'admin_invite_code'));
select throws_like(
  format(
    $$ select public.create_invite(%L, 'admin') $$,
    (select value::uuid from test_scratch where key = 'group_id')
  ),
  'PICADO_FORBIDDEN:%',
  'a non-owner admin cannot create an admin invite'
);

-- 3. the owner CAN create an admin invite (already exercised above: no exception raised)
select ok(
  (select value from test_scratch where key = 'admin_invite_code') is not null,
  'the owner can create an admin invite'
);

-- 4. accepting a member invite creates a membership with role member + a player row
select is(
  (
    select role::text from public.group_members
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and user_id = tests.get_supabase_uid('test_inv_member')
  ),
  'member',
  'accept_invite grants the invite role'
);
select ok(
  exists(
    select 1 from public.players
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and user_id = tests.get_supabase_uid('test_inv_member')
  ),
  'accept_invite creates a player row for a member-role invite'
);

-- 5. accepting a spectator invite creates a membership but NO player row
select tests.authenticate_as('test_inv_owner');
insert into test_scratch (key, value)
  select 'spectator_invite_code', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'), 'spectator');
select tests.authenticate_as('test_inv_spectator');
select public.accept_invite((select value from test_scratch where key = 'spectator_invite_code'));
select is(
  (
    select role::text from public.group_members
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and user_id = tests.get_supabase_uid('test_inv_spectator')
  ),
  'spectator',
  'accept_invite grants the spectator role'
);
select ok(
  not exists(
    select 1 from public.players
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and user_id = tests.get_supabase_uid('test_inv_spectator')
  ),
  'accept_invite does not create a player row for a spectator-role invite'
);

-- 6. an idempotent re-accept does not error and does not change the existing role
select lives_ok(
  format($$ select public.accept_invite(%L) $$, (select value from test_scratch where key = 'member_invite_code')),
  're-accepting an invite you already used is idempotent'
);
select is(
  (
    select role::text from public.group_members
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and user_id = tests.get_supabase_uid('test_inv_member')
  ),
  'member',
  're-accepting an invite does not change the existing role'
);

-- 7. an expired invite cannot be accepted
select tests.authenticate_as('test_inv_owner');
insert into test_scratch (key, value)
  select 'expired_invite_code', code
  from public.create_invite((select value::uuid from test_scratch where key = 'group_id'), 'member', now() - interval '1 hour');
select tests.authenticate_as('test_inv_extra_a');
select throws_like(
  format($$ select public.accept_invite(%L) $$, (select value from test_scratch where key = 'expired_invite_code')),
  'PICADO_INVITE_INVALID:%',
  'an expired invite cannot be accepted'
);

-- 8. a revoked invite cannot be accepted, and only an admin can revoke
select tests.authenticate_as('test_inv_owner');
insert into test_scratch (key, value)
  select 'revoked_invite_code', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
insert into test_scratch (key, value)
  select 'revoked_invite_id', id::text from public.invites where code = (select value from test_scratch where key = 'revoked_invite_code');

select tests.authenticate_as('test_inv_member');
select throws_like(
  format($$ select public.revoke_invite(%L) $$, (select value::uuid from test_scratch where key = 'revoked_invite_id')),
  'PICADO_FORBIDDEN:%',
  'a plain member cannot revoke invites'
);
select tests.authenticate_as('test_inv_owner');
select public.revoke_invite((select value::uuid from test_scratch where key = 'revoked_invite_id'));
select tests.authenticate_as('test_inv_extra_a');
select throws_like(
  format($$ select public.accept_invite(%L) $$, (select value from test_scratch where key = 'revoked_invite_code')),
  'PICADO_INVITE_INVALID:%',
  'a revoked invite cannot be accepted'
);

-- 9. an invite with max_uses reached cannot be accepted by a new user
select tests.authenticate_as('test_inv_owner');
insert into test_scratch (key, value)
  select 'limited_invite_code', code
  from public.create_invite((select value::uuid from test_scratch where key = 'group_id'), 'member', now() + interval '7 days', 1);
select tests.authenticate_as('test_inv_extra_a');
select public.accept_invite((select value from test_scratch where key = 'limited_invite_code'));
select tests.authenticate_as('test_inv_extra_b');
select throws_like(
  format($$ select public.accept_invite(%L) $$, (select value from test_scratch where key = 'limited_invite_code')),
  'PICADO_INVITE_INVALID:%',
  'an invite that reached max_uses cannot be accepted by a new user'
);

-- 10. get_invite_preview: unknown code raises, valid code reports valid = true
select throws_like(
  $$ select public.get_invite_preview('does-not-exist') $$,
  'PICADO_INVITE_INVALID:%',
  'get_invite_preview raises for an unknown code'
);
select tests.authenticate_as('test_inv_owner');
insert into test_scratch (key, value)
  select 'preview_invite_code', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select ok(
  (select valid from public.get_invite_preview((select value from test_scratch where key = 'preview_invite_code'))),
  'get_invite_preview reports a fresh invite as valid'
);
select is(
  (select valid from public.get_invite_preview((select value from test_scratch where key = 'expired_invite_code'))),
  false,
  'get_invite_preview reports an expired invite as invalid (but still found)'
);

select * from finish();

rollback;
