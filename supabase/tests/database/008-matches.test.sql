-- matches / match_teams / match_participants: visibility is group-scoped, writes are
-- admin-only, set_match_lineup validates the lineup thoroughly, and start_reporting computes
-- the report/rating deadlines from the group's settings.
begin;

select plan(20);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_m_owner');
select tests.create_supabase_user('test_m_member1');
select tests.create_supabase_user('test_m_member2');
select tests.create_supabase_user('test_m_member3');
select tests.create_supabase_user('test_m_outsider');

select tests.authenticate_as('test_m_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Matches Test Group')::text;

insert into test_scratch (key, value) select 'code_member1', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_m_member1');
select public.accept_invite((select value from test_scratch where key = 'code_member1'));

select tests.authenticate_as('test_m_owner');
insert into test_scratch (key, value) select 'code_member2', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_m_member2');
select public.accept_invite((select value from test_scratch where key = 'code_member2'));

select tests.authenticate_as('test_m_owner');
insert into test_scratch (key, value) select 'code_member3', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_m_member3');
select public.accept_invite((select value from test_scratch where key = 'code_member3'));

-- outsider: a separate group they belong to, and their own player id there
select tests.authenticate_as('test_m_outsider');
insert into test_scratch (key, value) select 'other_group_id', public.create_group('Other Group')::text;
insert into test_scratch (key, value)
  select 'outsider_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'other_group_id')
    and user_id = tests.get_supabase_uid('test_m_outsider');

select tests.authenticate_as('test_m_owner');
insert into test_scratch (key, value)
  select 'owner_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id')
    and user_id = tests.get_supabase_uid('test_m_owner');
insert into test_scratch (key, value)
  select 'member1_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id')
    and user_id = tests.get_supabase_uid('test_m_member1');
insert into test_scratch (key, value)
  select 'member2_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id')
    and user_id = tests.get_supabase_uid('test_m_member2');
insert into test_scratch (key, value)
  select 'member3_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id')
    and user_id = tests.get_supabase_uid('test_m_member3');

-- member2 becomes a spectator-role member but keeps their player row (set_member_role keeps it)
select public.set_member_role(
  (select value::uuid from test_scratch where key = 'group_id'), tests.get_supabase_uid('test_m_member2'), 'spectator'
);
-- member3 leaves the group (player row kept, but left_at stamped -- "left player" scenario)
select public.remove_member((select value::uuid from test_scratch where key = 'group_id'), tests.get_supabase_uid('test_m_member3'));

-- 1. a plain member cannot create a match
select tests.authenticate_as('test_m_member1');
select throws_like(
  format($$ select public.create_match(%L, now() + interval '1 day', 5) $$, (select value::uuid from test_scratch where key = 'group_id')),
  'PICADO_FORBIDDEN:%',
  'a plain member cannot create a match'
);

-- 2. the owner (admin) can create a match
select tests.authenticate_as('test_m_owner');
insert into test_scratch (key, value)
  select 'match_id', public.create_match((select value::uuid from test_scratch where key = 'group_id'), now() + interval '1 day', 5)::text;
select ok(
  exists(select 1 from public.matches where id = (select value::uuid from test_scratch where key = 'match_id')),
  'an admin can create a match'
);

-- 3. team_size validation
select throws_like(
  format($$ select public.create_match(%L, now() + interval '1 day', 2) $$, (select value::uuid from test_scratch where key = 'group_id')),
  'PICADO_VALIDATION:%',
  'team_size out of range is rejected'
);

-- 4. group members can see the match; a non-member sees nothing
select tests.authenticate_as('test_m_member1');
select is(
  (select count(*)::int from public.matches where id = (select value::uuid from test_scratch where key = 'match_id')),
  1,
  'a group member can see the match'
);
select tests.authenticate_as('test_m_outsider');
select is(
  (select count(*)::int from public.matches where id = (select value::uuid from test_scratch where key = 'match_id')),
  0,
  'a non-member sees no rows for the match'
);

-- 5. set_match_lineup: a plain member cannot set the lineup
select tests.authenticate_as('test_m_member1');
select throws_like(
  format(
    $$ select public.set_match_lineup(%L, jsonb_build_object('name', 'A', 'players', jsonb_build_array(jsonb_build_object('player_id', %L))), jsonb_build_object('name', 'B', 'players', '[]'::jsonb), '{}'::uuid[]) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'member1_player_id')
  ),
  'PICADO_FORBIDDEN:%',
  'a plain member cannot set the match lineup'
);

-- 6. set_match_lineup rejects a cross-group player
select tests.authenticate_as('test_m_owner');
select throws_like(
  format(
    $$ select public.set_match_lineup(%L, jsonb_build_object('name', 'A', 'players', jsonb_build_array(jsonb_build_object('player_id', %L))), jsonb_build_object('name', 'B', 'players', '[]'::jsonb), '{}'::uuid[]) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'outsider_player_id')
  ),
  'PICADO_VALIDATION:%',
  'set_match_lineup rejects a player from another group'
);

-- 7. set_match_lineup rejects a spectator-role member as a team player
select throws_like(
  format(
    $$ select public.set_match_lineup(
         %L,
         jsonb_build_object('name', 'A', 'players', jsonb_build_array(jsonb_build_object('player_id', %L))),
         jsonb_build_object('name', 'B', 'players', jsonb_build_array(jsonb_build_object('player_id', %L))),
         '{}'::uuid[]
       ) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'member1_player_id'),
    (select value::uuid from test_scratch where key = 'member2_player_id')
  ),
  'PICADO_VALIDATION:%',
  'set_match_lineup rejects a spectator-role member as a team player'
);

-- 8. set_match_lineup rejects the same player on both teams
select throws_like(
  format(
    $$ select public.set_match_lineup(
         %L,
         jsonb_build_object('name', 'A', 'players', jsonb_build_array(jsonb_build_object('player_id', %L))),
         jsonb_build_object('name', 'B', 'players', jsonb_build_array(jsonb_build_object('player_id', %L))),
         '{}'::uuid[]
       ) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'member1_player_id'),
    (select value::uuid from test_scratch where key = 'member1_player_id')
  ),
  'PICADO_VALIDATION:%',
  'set_match_lineup rejects the same player on both teams'
);

-- 9. set_match_lineup rejects a player who has left the group
select throws_like(
  format(
    $$ select public.set_match_lineup(
         %L,
         jsonb_build_object('name', 'A', 'players', jsonb_build_array(jsonb_build_object('player_id', %L))),
         jsonb_build_object('name', 'B', 'players', '[]'::jsonb),
         '{}'::uuid[]
       ) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'member3_player_id')
  ),
  'PICADO_VALIDATION:%',
  'set_match_lineup rejects a player who has left the group'
);

-- 10. a valid lineup succeeds: owner vs member1, member2 (spectator role) as spectator
select lives_ok(
  format(
    $$ select public.set_match_lineup(
         %L,
         jsonb_build_object('name', 'Rojo', 'color', '#f00', 'players', jsonb_build_array(jsonb_build_object('player_id', %L, 'position', 'DC'))),
         jsonb_build_object('name', 'Azul', 'players', jsonb_build_array(jsonb_build_object('player_id', %L))),
         array[%L]::uuid[]
       ) $$,
    (select value::uuid from test_scratch where key = 'match_id'),
    (select value::uuid from test_scratch where key = 'owner_player_id'),
    (select value::uuid from test_scratch where key = 'member1_player_id'),
    (select value::uuid from test_scratch where key = 'member2_player_id')
  ),
  'a valid lineup is accepted'
);

select is(
  (select count(*)::int from public.match_teams where match_id = (select value::uuid from test_scratch where key = 'match_id')),
  2,
  'set_match_lineup created 2 teams'
);
select is(
  (
    select count(*)::int from public.match_participants
    where match_id = (select value::uuid from test_scratch where key = 'match_id') and role = 'spectator'
  ),
  1,
  'set_match_lineup recorded 1 spectator'
);

-- 11. set_match_lineup rejects an empty team name
select throws_like(
  format(
    $$ select public.set_match_lineup(
         %L,
         jsonb_build_object('name', '', 'players', '[]'::jsonb),
         jsonb_build_object('name', 'B', 'players', '[]'::jsonb),
         '{}'::uuid[]
       ) $$,
    (select value::uuid from test_scratch where key = 'match_id')
  ),
  'PICADO_VALIDATION:%',
  'set_match_lineup rejects an empty team name'
);

-- 12. start_reporting: a plain member cannot start reporting
select tests.authenticate_as('test_m_member1');
select throws_like(
  format($$ select public.start_reporting(%L) $$, (select value::uuid from test_scratch where key = 'match_id')),
  'PICADO_FORBIDDEN:%',
  'a plain member cannot start reporting'
);

-- 13. start_reporting sets deadlines from group settings.windows (defaults 48h/72h)
select tests.authenticate_as('test_m_owner');
select public.start_reporting((select value::uuid from test_scratch where key = 'match_id'), '2026-01-01T12:00:00Z'::timestamptz);
select results_eq(
  format(
    $$ select status::text, report_deadline, rating_deadline from public.matches where id = %L $$,
    (select value::uuid from test_scratch where key = 'match_id')
  ),
  $$ values ('reporting', '2026-01-03T12:00:00Z'::timestamptz, '2026-01-04T12:00:00Z'::timestamptz) $$,
  'start_reporting sets status + deadlines using the default 48h/72h windows'
);

-- 14. set_match_lineup can no longer be used once the match is not scheduled
select throws_like(
  format(
    $$ select public.set_match_lineup(
         %L,
         jsonb_build_object('name', 'A', 'players', '[]'::jsonb),
         jsonb_build_object('name', 'B', 'players', '[]'::jsonb),
         '{}'::uuid[]
       ) $$,
    (select value::uuid from test_scratch where key = 'match_id')
  ),
  'PICADO_VALIDATION:%',
  'set_match_lineup rejects a match that is no longer scheduled'
);

-- 15. cancel_match: a plain member cannot cancel
select tests.authenticate_as('test_m_owner');
insert into test_scratch (key, value)
  select 'match_id_2', public.create_match((select value::uuid from test_scratch where key = 'group_id'), now() + interval '2 days', 5)::text;
select tests.authenticate_as('test_m_member1');
select throws_like(
  format($$ select public.cancel_match(%L) $$, (select value::uuid from test_scratch where key = 'match_id_2')),
  'PICADO_FORBIDDEN:%',
  'a plain member cannot cancel a match'
);

-- 16. an admin can cancel a scheduled match
select tests.authenticate_as('test_m_owner');
select public.cancel_match((select value::uuid from test_scratch where key = 'match_id_2'));
select is(
  (select status::text from public.matches where id = (select value::uuid from test_scratch where key = 'match_id_2')),
  'cancelled',
  'an admin can cancel a scheduled match'
);

-- 17. a cancelled match cannot be cancelled again
select throws_like(
  format($$ select public.cancel_match(%L) $$, (select value::uuid from test_scratch where key = 'match_id_2')),
  'PICADO_VALIDATION:%',
  'an already cancelled match cannot be cancelled again'
);

select * from finish();

rollback;
