-- Quick-mode scouting for goalkeepers: div/han/kic/ref/pos are accepted only for GK targets, and
-- stored as quick ballots next to the outfield face stats.
begin;

select plan(5);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_gq_owner');
select tests.create_supabase_user('test_gq_rater');
select tests.create_supabase_user('test_gq_target');

select tests.authenticate_as('test_gq_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('GK Quick Test Group')::text;
insert into test_scratch (key, value) select 'code', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_gq_rater');
select public.accept_invite((select value from test_scratch where key = 'code'));
select tests.authenticate_as('test_gq_target');
select public.accept_invite((select value from test_scratch where key = 'code'));

select tests.authenticate_as('test_gq_owner');
insert into test_scratch (key, value)
  select 'gk_id', public.add_guest_player((select value::uuid from test_scratch where key = 'group_id'), 'Arquero', 'POR')::text;
insert into test_scratch (key, value)
  select 'outfield_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_gq_target');

-- Skip the shared-match requirement: this test is about key validation only.
reset role;
update public.groups set settings = '{"scouting": {"require_shared_match": false}}'::jsonb
  where id = (select value::uuid from test_scratch where key = 'group_id');

-- 1. GK quick keys (plus the outfield ones) are accepted for a GK target
select tests.authenticate_as('test_gq_rater');
select lives_ok(
  format($$ select public.submit_scouting_votes(%L, 'quick', '{"div": 8, "han": 7, "kic": 6, "ref": 9, "pos": 7, "pac": 5}'::jsonb) $$,
    (select value from test_scratch where key = 'gk_id')),
  'quick mode accepts div/han/kic/ref/pos for a goalkeeper'
);

-- 2. they are stored as quick ballots
reset role;
select is(
  (select count(*)::int from public.scouting_votes
    where target_player_id = (select value::uuid from test_scratch where key = 'gk_id')
      and mode = 'quick' and attribute in ('div', 'han', 'kic', 'ref', 'pos') and superseded_at is null),
  5,
  'the five GK quick ballots are stored'
);

-- 3. GK quick keys are rejected for an outfield target
select tests.authenticate_as('test_gq_rater');
select throws_ok(
  format($$ select public.submit_scouting_votes(%L, 'quick', '{"div": 8}'::jsonb) $$,
    (select value from test_scratch where key = 'outfield_id')),
  'P0001', 'PICADO_VALIDATION: attribute div is not valid for this mode/target',
  'quick mode rejects GK keys for an outfield target'
);

-- 4. outfield quick keys still work for the outfield target
select lives_ok(
  format($$ select public.submit_scouting_votes(%L, 'quick', '{"pac": 7, "sho": 6}'::jsonb) $$,
    (select value from test_scratch where key = 'outfield_id')),
  'quick mode still accepts outfield face stats'
);

-- 5. GK quick keys are not valid in detailed mode (detailed uses gk_* sub-attributes)
select throws_ok(
  format($$ select public.submit_scouting_votes(%L, 'detailed', '{"div": 8}'::jsonb) $$,
    (select value from test_scratch where key = 'gk_id')),
  'P0001', 'PICADO_VALIDATION: attribute div is not valid for this mode/target',
  'detailed mode rejects quick GK keys'
);

select * from finish();
rollback;
