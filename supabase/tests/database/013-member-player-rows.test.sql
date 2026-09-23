-- Every group_members row (any role) has exactly one matching players row: accept_invite
-- creates it unconditionally (see 004-invites for the spectator-invite case), set_member_role
-- never duplicates it across role changes, and claim_guest_player still rejects a spectator-role
-- caller even though they now have a player row of their own (spectators must not take over a
-- guest's playing identity).
begin;

select plan(8);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_mpr_owner');
select tests.create_supabase_user('test_mpr_spectator');

select tests.authenticate_as('test_mpr_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Member Player Rows Group')::text;

insert into test_scratch (key, value) select 'code_spectator', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'), 'spectator');
select tests.authenticate_as('test_mpr_spectator');
select public.accept_invite((select value from test_scratch where key = 'code_spectator'));

-- 1. accepting a spectator-role invite already creates exactly one player row
select tests.authenticate_as('test_mpr_owner');
select is(
  (
    select count(*)::int from public.players
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and user_id = tests.get_supabase_uid('test_mpr_spectator')
  ),
  1,
  'accepting a spectator-role invite creates exactly one player row'
);

-- 2-3. promoting spectator -> member does not duplicate the player row
select public.set_member_role((select value::uuid from test_scratch where key = 'group_id'), tests.get_supabase_uid('test_mpr_spectator'), 'member');
select is(
  (
    select count(*)::int from public.players
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and user_id = tests.get_supabase_uid('test_mpr_spectator')
  ),
  1,
  'promoting a spectator to member does not duplicate the player row'
);
select is(
  (
    select role::text from public.group_members
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and user_id = tests.get_supabase_uid('test_mpr_spectator')
  ),
  'member',
  'set_member_role updates the role to member'
);

-- 4-5. demoting member -> spectator again keeps the same single player row
select public.set_member_role((select value::uuid from test_scratch where key = 'group_id'), tests.get_supabase_uid('test_mpr_spectator'), 'spectator');
select is(
  (
    select count(*)::int from public.players
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and user_id = tests.get_supabase_uid('test_mpr_spectator')
  ),
  1,
  'demoting back to spectator keeps exactly one player row'
);
select is(
  (
    select role::text from public.group_members
    where group_id = (select value::uuid from test_scratch where key = 'group_id')
      and user_id = tests.get_supabase_uid('test_mpr_spectator')
  ),
  'spectator',
  'set_member_role updates the role back to spectator'
);

-- 6. claim_guest_player still rejects a spectator-role caller, even though they now have their
-- own player row (spectators must not take over a guest's playing identity)
insert into test_scratch (key, value)
  select 'guest_id', public.add_guest_player((select value::uuid from test_scratch where key = 'group_id'), 'Invitado')::text;
select tests.authenticate_as('test_mpr_spectator');
select throws_like(
  format($$ select public.claim_guest_player(%L) $$, (select value::uuid from test_scratch where key = 'guest_id')),
  'PICADO_FORBIDDEN:%',
  'a spectator-role member cannot claim a guest player'
);

-- 7-9. once promoted to member, the same user CAN claim the guest (proving the check above is
-- role-gated, not identity-gated)
select tests.authenticate_as('test_mpr_owner');
select public.set_member_role((select value::uuid from test_scratch where key = 'group_id'), tests.get_supabase_uid('test_mpr_spectator'), 'member');
select tests.authenticate_as('test_mpr_spectator');
select lives_ok(
  format($$ select public.claim_guest_player(%L) $$, (select value::uuid from test_scratch where key = 'guest_id')),
  'the same user can claim a guest player once promoted to member'
);
select is(
  (select user_id from public.players where id = (select value::uuid from test_scratch where key = 'guest_id')),
  tests.get_supabase_uid('test_mpr_spectator'),
  'claim_guest_player attaches the (now member) caller to the guest'
);

select * from finish();

rollback;
