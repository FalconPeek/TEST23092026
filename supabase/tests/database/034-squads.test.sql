-- M7 squads: dream squads private until published, likes (not own), featured squad, admin-only
-- lineup squads for scheduled matches, structural validation, shared appearances.
begin;

select plan(15);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_q_owner');
select tests.create_supabase_user('test_q_member');
select tests.create_supabase_user('test_q_outsider');

select tests.authenticate_as('test_q_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Squads Test Group')::text;
insert into test_scratch (key, value) select 'code', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_q_member');
select public.accept_invite((select value from test_scratch where key = 'code'));

select tests.authenticate_as('test_q_owner');
insert into test_scratch (key, value)
  select 'owner_pid', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_q_owner');
insert into test_scratch (key, value)
  select 'member_pid', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_q_member');

-- 1. a member creates a dream squad
select tests.authenticate_as('test_q_member');
insert into test_scratch (key, value)
  select 'dream_id', public.save_squad(
    null, (select value::uuid from test_scratch where key = 'group_id'), 'dream', 'Mi equipo', 5, '2-2',
    jsonb_build_array(
      jsonb_build_object('slot', 0, 'position', 'POR', 'player_id', (select value from test_scratch where key = 'owner_pid')),
      jsonb_build_object('slot', 3, 'position', 'DC', 'player_id', (select value from test_scratch where key = 'member_pid'))
    )
  )::text;
select is(
  (select count(*)::int from public.squad_slots where squad_id = (select value::uuid from test_scratch where key = 'dream_id')),
  2,
  'a member saves a dream squad with its slots'
);

-- 2. unpublished dream squads are private to their owner
select tests.authenticate_as('test_q_owner');
select is(
  (select count(*)::int from public.squads where id = (select value::uuid from test_scratch where key = 'dream_id')),
  0,
  'an unpublished dream squad is invisible to other members'
);

-- 3. others cannot edit it
select throws_ok(
  format($$ select public.save_squad(%L, %L, 'dream', 'Robado', 5, '2-2', '[]'::jsonb) $$,
    (select value from test_scratch where key = 'dream_id'), (select value from test_scratch where key = 'group_id')),
  'P0001', 'PICADO_FORBIDDEN: only the owner can edit this squad',
  'only the owner edits a dream squad'
);

-- 4-5. structural validation
select tests.authenticate_as('test_q_member');
select throws_ok(
  format($$ select public.save_squad(null, %L, 'dream', 'X', 5, '4-3-3', '[]'::jsonb) $$, (select value from test_scratch where key = 'group_id')),
  'P0001', 'PICADO_VALIDATION: formation does not match the team size',
  'the formation must add up to the team size minus the goalkeeper'
);
select throws_ok(
  format($$ select public.save_squad(null, %L, 'dream', 'X', 5, '2-2', %L::jsonb) $$,
    (select value from test_scratch where key = 'group_id'),
    jsonb_build_array(
      jsonb_build_object('slot', 0, 'position', 'POR', 'player_id', (select value from test_scratch where key = 'owner_pid')),
      jsonb_build_object('slot', 1, 'position', 'DFC', 'player_id', (select value from test_scratch where key = 'owner_pid'))
    )::text),
  'P0001', 'PICADO_VALIDATION: a player can only be placed once',
  'a player can only be placed once'
);

-- 6-7. publishing makes it visible; the owner cannot like their own squad
select public.set_squad_published((select value::uuid from test_scratch where key = 'dream_id'), true);
select throws_ok(
  format($$ select public.like_squad(%L) $$, (select value from test_scratch where key = 'dream_id')),
  'P0001', 'PICADO_SELF_VOTE: you cannot like your own squad',
  'owners cannot like their own squad'
);
select tests.authenticate_as('test_q_owner');
select is(
  (select count(*)::int from public.squads where id = (select value::uuid from test_scratch where key = 'dream_id')),
  1,
  'a published dream squad is visible to the group'
);

-- 8-9. likes and the featured squad
select public.like_squad((select value::uuid from test_scratch where key = 'dream_id'));
select public.like_squad((select value::uuid from test_scratch where key = 'dream_id')); -- idempotent
select is(
  (select likes from public.get_featured_squad((select value::uuid from test_scratch where key = 'group_id'))),
  1,
  'likes are idempotent and feed the featured squad'
);
select is(
  (select squad_id from public.get_featured_squad((select value::uuid from test_scratch where key = 'group_id'))),
  (select value::uuid from test_scratch where key = 'dream_id'),
  'the most-liked recent squad is featured'
);

-- 10. unpublishing clears likes
select tests.authenticate_as('test_q_member');
select public.set_squad_published((select value::uuid from test_scratch where key = 'dream_id'), false);
reset role;
select is(
  (select count(*)::int from public.squad_likes where squad_id = (select value::uuid from test_scratch where key = 'dream_id')),
  0,
  'unpublishing a squad clears its likes'
);

-- 11-12. lineup squads: admins only, scheduled matches only
select tests.authenticate_as('test_q_owner');
insert into test_scratch (key, value)
  select 'match_id', public.create_match((select value::uuid from test_scratch where key = 'group_id'), now(), 5)::text;
select lives_ok(
  format($$ select public.save_squad(null, %L, 'lineup', 'Blancos', 5, '2-2', '[]'::jsonb, null, %L, 1) $$,
    (select value from test_scratch where key = 'group_id'), (select value from test_scratch where key = 'match_id')),
  'admins save a lineup squad for a scheduled match'
);
select tests.authenticate_as('test_q_member');
select throws_ok(
  format($$ select public.save_squad(null, %L, 'lineup', 'Negros', 5, '2-2', '[]'::jsonb, null, %L, 2) $$,
    (select value from test_scratch where key = 'group_id'), (select value from test_scratch where key = 'match_id')),
  'P0001', 'PICADO_FORBIDDEN: only group admins can set match lineups',
  'members cannot save lineup squads'
);

-- 13. outsiders see nothing and cannot read shared appearances
select tests.authenticate_as('test_q_outsider');
select is(
  (select count(*)::int from public.squads where group_id = (select value::uuid from test_scratch where key = 'group_id')),
  0,
  'non-members see no squads'
);
select throws_ok(
  format($$ select * from public.get_shared_appearances(%L) $$, (select value from test_scratch where key = 'group_id')),
  'P0001', 'PICADO_NOT_MEMBER: you are not a member of this group',
  'non-members cannot read shared appearances'
);

-- 15. no direct writes
select tests.authenticate_as('test_q_member');
select throws_ok(
  format($$ insert into public.squad_likes (squad_id, player_id) values (%L, %L) $$,
    (select value from test_scratch where key = 'dream_id'), (select value from test_scratch where key = 'member_pid')),
  '42501', null,
  'authenticated users cannot write squad tables directly'
);

select * from finish();
rollback;
