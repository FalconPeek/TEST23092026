-- M7: tournament entries can be linked to a club of the same group.
begin;

select plan(3);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_tc_owner');
select tests.create_supabase_user('test_tc_other');

select tests.authenticate_as('test_tc_other');
insert into test_scratch (key, value) select 'other_group', public.create_group('Other TC Group')::text;
insert into test_scratch (key, value)
  select 'foreign_club', public.create_club((select value::uuid from test_scratch where key = 'other_group'), 'Ajenos', 'AJE')::text;

select tests.authenticate_as('test_tc_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('TC Group')::text;
insert into test_scratch (key, value)
  select 'club_id', public.create_club((select value::uuid from test_scratch where key = 'group_id'), 'Los Pibes', 'LPB')::text;
insert into test_scratch (key, value)
  select 'tournament_id', public.create_tournament((select value::uuid from test_scratch where key = 'group_id'), 'Copa', 'single_elim', 5, 'teams', '{}'::jsonb)::text;

-- 1-2. an entry can carry a club of the group
select lives_ok(
  format($$ select public.save_tournament_entries(%L, %L::jsonb) $$,
    (select value from test_scratch where key = 'tournament_id'),
    jsonb_build_array(
      jsonb_build_object('name', 'Los Pibes', 'club_id', (select value from test_scratch where key = 'club_id')),
      jsonb_build_object('name', 'Sin club')
    )::text),
  'entries accept a club of the same group'
);
select is(
  (select club_id from public.tournament_entries
    where tournament_id = (select value::uuid from test_scratch where key = 'tournament_id') and name = 'Los Pibes'),
  (select value::uuid from test_scratch where key = 'club_id'),
  'the entry stores its club'
);

-- 3. a club from another group is rejected
select throws_ok(
  format($$ select public.save_tournament_entries(%L, %L::jsonb) $$,
    (select value from test_scratch where key = 'tournament_id'),
    jsonb_build_array(jsonb_build_object('name', 'Colados', 'club_id', (select value from test_scratch where key = 'foreign_club')))::text),
  'P0001', 'PICADO_VALIDATION: entry club does not belong to this group',
  'entries reject clubs from other groups'
);

select * from finish();
rollback;
