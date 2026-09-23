-- add_guest_player / claim_guest_player / assign_guest_player: admin-only creation and admin
-- assignment, self-service claiming merges the caller's empty player row into the guest.
begin;

select plan(10);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_guest_owner');
select tests.create_supabase_user('test_guest_member');
select tests.create_supabase_user('test_guest_outsider');
select tests.create_supabase_user('test_guest_spectator');

select tests.authenticate_as('test_guest_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Guests Test Group')::text;

insert into test_scratch (key, value) select 'code_member', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_guest_member');
select public.accept_invite((select value from test_scratch where key = 'code_member'));
insert into test_scratch (key, value)
  select 'member_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id')
    and user_id = tests.get_supabase_uid('test_guest_member');

select tests.authenticate_as('test_guest_owner');
insert into test_scratch (key, value) select 'code_spectator', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'), 'spectator');
select tests.authenticate_as('test_guest_spectator');
select public.accept_invite((select value from test_scratch where key = 'code_spectator'));

-- 1. a plain member cannot add a guest player
select tests.authenticate_as('test_guest_member');
select throws_like(
  format($$ select public.add_guest_player(%L, 'Fulano Guest') $$, (select value::uuid from test_scratch where key = 'group_id')),
  'PICADO_FORBIDDEN:%',
  'a plain member cannot add a guest player'
);

-- 2. an admin (the owner) can add a guest player: unclaimed, no user_id
select tests.authenticate_as('test_guest_owner');
insert into test_scratch (key, value)
  select 'guest_id', public.add_guest_player((select value::uuid from test_scratch where key = 'group_id'), 'Fulano Guest')::text;
select ok(
  exists(
    select 1 from public.players
    where id = (select value::uuid from test_scratch where key = 'guest_id')
      and is_guest = true
      and user_id is null
      and claimed_at is null
  ),
  'add_guest_player creates an unclaimed guest player'
);

-- 3. a member with their own (empty) player row can claim the guest, merging into it
select tests.authenticate_as('test_guest_member');
select public.claim_guest_player((select value::uuid from test_scratch where key = 'guest_id'));
select is(
  (
    select user_id from public.players
    where id = (select value::uuid from test_scratch where key = 'guest_id')
  ),
  tests.get_supabase_uid('test_guest_member'),
  'claim_guest_player attaches the caller as the guest''s user_id'
);
select ok(
  (
    select is_guest = false and claimed_at is not null from public.players
    where id = (select value::uuid from test_scratch where key = 'guest_id')
  ),
  'claim_guest_player marks the guest as claimed'
);
select is(
  (select count(*)::int from public.players where id = (select value::uuid from test_scratch where key = 'member_player_id')),
  0,
  'claim_guest_player deletes the caller''s old empty player row'
);

-- 4. an already-claimed guest cannot be claimed again
select tests.authenticate_as('test_guest_outsider');
-- the outsider must first join the group as a member to be eligible in the first place
select tests.authenticate_as('test_guest_owner');
insert into test_scratch (key, value) select 'code_outsider', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_guest_outsider');
select public.accept_invite((select value from test_scratch where key = 'code_outsider'));
select throws_like(
  format($$ select public.claim_guest_player(%L) $$, (select value::uuid from test_scratch where key = 'guest_id')),
  'PICADO_VALIDATION:%',
  'an already-claimed guest cannot be claimed again'
);

-- 5. a second guest cannot be claimed by someone outside the group
select tests.authenticate_as('test_guest_owner');
insert into test_scratch (key, value)
  select 'guest_id_2', public.add_guest_player((select value::uuid from test_scratch where key = 'group_id'), 'Segundo Guest')::text;
select tests.create_supabase_user('test_guest_stranger');
select tests.authenticate_as('test_guest_stranger');
select throws_like(
  format($$ select public.claim_guest_player(%L) $$, (select value::uuid from test_scratch where key = 'guest_id_2')),
  'PICADO_FORBIDDEN:%',
  'a non-member cannot claim a guest player'
);

-- 6. a plain member cannot assign a guest player to someone else
select tests.authenticate_as('test_guest_outsider');
select throws_like(
  format(
    $$ select public.assign_guest_player(%L, %L) $$,
    (select value::uuid from test_scratch where key = 'guest_id_2'),
    tests.get_supabase_uid('test_guest_spectator')
  ),
  'PICADO_FORBIDDEN:%',
  'a plain member cannot assign a guest player'
);

-- 7. an admin can assign a guest player to a member of the group (the spectator, who has no player row)
select tests.authenticate_as('test_guest_owner');
select public.assign_guest_player(
  (select value::uuid from test_scratch where key = 'guest_id_2'),
  tests.get_supabase_uid('test_guest_spectator')
);
select is(
  (
    select user_id from public.players
    where id = (select value::uuid from test_scratch where key = 'guest_id_2')
  ),
  tests.get_supabase_uid('test_guest_spectator'),
  'assign_guest_player attaches the target user to the guest'
);

-- 8. assign_guest_player validates the target is a member of the group
select tests.authenticate_as('test_guest_owner');
insert into test_scratch (key, value)
  select 'guest_id_3', public.add_guest_player((select value::uuid from test_scratch where key = 'group_id'), 'Tercer Guest')::text;
select throws_like(
  format(
    $$ select public.assign_guest_player(%L, %L) $$,
    (select value::uuid from test_scratch where key = 'guest_id_3'),
    tests.get_supabase_uid('test_guest_stranger')
  ),
  'PICADO_VALIDATION:%',
  'assign_guest_player rejects a target who is not a member of the group'
);

select * from finish();

rollback;
