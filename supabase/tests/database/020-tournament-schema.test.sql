-- M4 tournament schema: RLS enabled on all 6 tables, non-members see nothing, members see their
-- group's tournaments, no direct DML grants for authenticated (writes only via RPCs), spectators
-- cannot register, and only group admins can create/edit tournaments, set entries, or generate a
-- bracket.
begin;

select plan(28);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_t_owner');
select tests.create_supabase_user('test_t_member');
select tests.create_supabase_user('test_t_spectator');
select tests.create_supabase_user('test_t_outsider');

select tests.authenticate_as('test_t_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Tournament Schema Group')::text;

insert into test_scratch (key, value)
  select 'code_member', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'), 'member');
select tests.authenticate_as('test_t_member');
select public.accept_invite((select value from test_scratch where key = 'code_member'));

select tests.authenticate_as('test_t_owner');
insert into test_scratch (key, value)
  select 'code_spectator', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'), 'spectator');
select tests.authenticate_as('test_t_spectator');
select public.accept_invite((select value from test_scratch where key = 'code_spectator'));

-- 1-6. RLS is enabled on all 6 new tables.
select tests.rls_enabled('public', 'tournaments');
select tests.rls_enabled('public', 'tournament_entries');
select tests.rls_enabled('public', 'tournament_registrations');
select tests.rls_enabled('public', 'stages');
select tests.rls_enabled('public', 'stage_groups');
select tests.rls_enabled('public', 'tournament_matches');

-- 7. a plain member cannot create a tournament
select throws_like(
  format($$ select public.create_tournament(%L, 'Liga', 'league', 5) $$, (select value::uuid from test_scratch where key = 'group_id')),
  'PICADO_FORBIDDEN:%',
  'a plain member cannot create a tournament'
);

-- 8. the owner (admin) can
select tests.authenticate_as('test_t_owner');
insert into test_scratch (key, value)
  select 'tournament_id', public.create_tournament(
    (select value::uuid from test_scratch where key = 'group_id'), 'Liga', 'single_elim', 5, 'individual'
  )::text;
select ok(
  (select value from test_scratch where key = 'tournament_id') is not null,
  'a group admin can create a tournament'
);

-- 9. a plain member cannot update the tournament
select tests.authenticate_as('test_t_member');
select throws_like(
  format(
    $$ select public.update_tournament(%L, 'Liga 2', '{}'::jsonb) $$,
    (select value::uuid from test_scratch where key = 'tournament_id')
  ),
  'PICADO_FORBIDDEN:%',
  'a plain member cannot update the tournament'
);

-- 10. a plain member cannot set tournament entries
select throws_like(
  format(
    $$ select public.save_tournament_entries(%L, '[]'::jsonb) $$,
    (select value::uuid from test_scratch where key = 'tournament_id')
  ),
  'PICADO_FORBIDDEN:%',
  'a plain member cannot set tournament entries'
);

-- 11. a plain member cannot generate the bracket
select throws_like(
  format(
    $$ select public.persist_bracket(%L, '{}'::jsonb) $$,
    (select value::uuid from test_scratch where key = 'tournament_id')
  ),
  'PICADO_FORBIDDEN:%',
  'a plain member cannot persist the bracket'
);

-- 12. an outsider (not a group member) sees no tournaments
select tests.authenticate_as('test_t_outsider');
select is(
  (select count(*)::int from public.tournaments where id = (select value::uuid from test_scratch where key = 'tournament_id')),
  0,
  'a non-member sees no tournaments'
);

-- 13. but a group member does
select tests.authenticate_as('test_t_member');
select is(
  (select count(*)::int from public.tournaments where id = (select value::uuid from test_scratch where key = 'tournament_id')),
  1,
  'a group member sees the tournament'
);

-- 14-19. no direct DML grants to authenticated on any of the 6 tables.
select throws_ok(
  format(
    $$ insert into public.tournaments (group_id, name, format, team_size, organizer_id)
       values (%L, 'x', 'league', 5, %L) $$,
    (select value::uuid from test_scratch where key = 'group_id'), tests.get_supabase_uid('test_t_member')
  ),
  '42501', null, 'authenticated cannot insert directly into tournaments'
);
select throws_ok(
  format($$ insert into public.tournament_entries (tournament_id, name) values (%L, 'x') $$,
    (select value::uuid from test_scratch where key = 'tournament_id')),
  '42501', null, 'authenticated cannot insert directly into tournament_entries'
);
select throws_ok(
  format($$ insert into public.tournament_registrations (tournament_id, player_id) values (%L, %L) $$,
    (select value::uuid from test_scratch where key = 'tournament_id'), gen_random_uuid()),
  '42501', null, 'authenticated cannot insert directly into tournament_registrations'
);
select throws_ok(
  format($$ insert into public.stages (tournament_id, kind, stage_order, engine_key) values (%L, 'league', 1, 'x') $$,
    (select value::uuid from test_scratch where key = 'tournament_id')),
  '42501', null, 'authenticated cannot insert directly into stages'
);
select throws_ok(
  $$ insert into public.stage_groups (tournament_id, stage_id, number, label, engine_key)
     values (gen_random_uuid(), gen_random_uuid(), 1, 'A', 'x') $$,
  '42501', null, 'authenticated cannot insert directly into stage_groups'
);
select throws_ok(
  $$ insert into public.tournament_matches (tournament_id, stage_id, bracket, round, number, engine_key)
     values (gen_random_uuid(), gen_random_uuid(), 'winners', 1, 1, 'x') $$,
  '42501', null, 'authenticated cannot insert directly into tournament_matches'
);

-- 20. anon cannot select tournaments either
select tests.clear_authentication();
select throws_ok(
  $$ select * from public.tournaments $$,
  '42501', null, 'anon cannot select tournaments'
);

-- 21. registration requires an individual-entry tournament in the `registration` status
select tests.authenticate_as('test_t_member');
select throws_like(
  format($$ select public.register_for_tournament(%L) $$, (select value::uuid from test_scratch where key = 'tournament_id')),
  'PICADO_VALIDATION:%',
  'registration is rejected while the tournament is still draft'
);

select tests.authenticate_as('test_t_owner');
select public.set_tournament_status((select value::uuid from test_scratch where key = 'tournament_id'), 'registration');

-- 22. a spectator-role member cannot register
select tests.authenticate_as('test_t_spectator');
select throws_like(
  format($$ select public.register_for_tournament(%L) $$, (select value::uuid from test_scratch where key = 'tournament_id')),
  'PICADO_FORBIDDEN:%',
  'a spectator-role member cannot register for a tournament'
);

-- 23. a plain member can register
select tests.authenticate_as('test_t_member');
select lives_ok(
  format($$ select public.register_for_tournament(%L) $$, (select value::uuid from test_scratch where key = 'tournament_id')),
  'a plain member can register for an individual-entry tournament'
);
select is(
  (
    select count(*)::int from public.tournament_registrations
    where tournament_id = (select value::uuid from test_scratch where key = 'tournament_id')
  ),
  1,
  'the registration was recorded'
);

-- 24. and can unregister
select lives_ok(
  format($$ select public.unregister_from_tournament(%L) $$, (select value::uuid from test_scratch where key = 'tournament_id')),
  'a plain member can unregister'
);
select is(
  (
    select count(*)::int from public.tournament_registrations
    where tournament_id = (select value::uuid from test_scratch where key = 'tournament_id')
  ),
  0,
  'the registration was removed'
);

-- 25. a teams-entry tournament rejects direct registration
select tests.authenticate_as('test_t_owner');
insert into test_scratch (key, value)
  select 'teams_tournament_id', public.create_tournament(
    (select value::uuid from test_scratch where key = 'group_id'), 'Copa', 'single_elim', 5, 'teams'
  )::text;
select public.set_tournament_status((select value::uuid from test_scratch where key = 'teams_tournament_id'), 'registration');
select tests.authenticate_as('test_t_member');
select throws_like(
  format($$ select public.register_for_tournament(%L) $$, (select value::uuid from test_scratch where key = 'teams_tournament_id')),
  'PICADO_VALIDATION:%',
  'a teams-entry tournament rejects direct registration'
);

-- 26. save_tournament_entries rejects a player from another group
select tests.create_supabase_user('test_t_other_owner');
select tests.authenticate_as('test_t_other_owner');
insert into test_scratch (key, value) select 'other_group_id', public.create_group('Other Group')::text;
insert into test_scratch (key, value)
  select 'other_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'other_group_id')
    and user_id = tests.get_supabase_uid('test_t_other_owner');

select tests.authenticate_as('test_t_owner');
select throws_like(
  format(
    $$ select public.save_tournament_entries(%L, jsonb_build_array(jsonb_build_object('name', 'Equipo', 'player_ids', jsonb_build_array(%L)))) $$,
    (select value::uuid from test_scratch where key = 'teams_tournament_id'),
    (select value::uuid from test_scratch where key = 'other_player_id')
  ),
  'PICADO_VALIDATION:%',
  'save_tournament_entries rejects a player from another group'
);

select * from finish();

rollback;
