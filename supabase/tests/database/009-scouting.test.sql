-- scouting_votes / playstyle_votes / star_votes + submit_* RPCs + get_my_scouting_ballot /
-- get_scouting_status: eligibility (spectator, self, no shared match, cooldown), quick vs
-- detailed key validation, GK attributes gated by target position, supersede keeps history, and
-- votes are private (each rater only sees their own rows).
begin;

select plan(24);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_s_owner');
select tests.create_supabase_user('test_s_rater');
select tests.create_supabase_user('test_s_rater2');
select tests.create_supabase_user('test_s_target');
select tests.create_supabase_user('test_s_spectator');

select tests.authenticate_as('test_s_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Scouting Test Group')::text;

insert into test_scratch (key, value) select 'code_rater', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_s_rater');
select public.accept_invite((select value from test_scratch where key = 'code_rater'));

select tests.authenticate_as('test_s_owner');
insert into test_scratch (key, value) select 'code_rater2', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_s_rater2');
select public.accept_invite((select value from test_scratch where key = 'code_rater2'));

select tests.authenticate_as('test_s_owner');
insert into test_scratch (key, value) select 'code_target', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_s_target');
select public.accept_invite((select value from test_scratch where key = 'code_target'));

-- Joined as a plain member (so a player row is created), then demoted to spectator -- accepting
-- an invite with role=spectator directly never creates a player row, so it could never reach
-- the "spectator with a player row" case we want to exercise here.
select tests.authenticate_as('test_s_owner');
insert into test_scratch (key, value) select 'code_spectator', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_s_spectator');
select public.accept_invite((select value from test_scratch where key = 'code_spectator'));
select tests.authenticate_as('test_s_owner');
select public.set_member_role(
  (select value::uuid from test_scratch where key = 'group_id'), tests.get_supabase_uid('test_s_spectator'), 'spectator'
);

select tests.authenticate_as('test_s_owner');
insert into test_scratch (key, value)
  select 'rater_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_s_rater');
insert into test_scratch (key, value)
  select 'rater2_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_s_rater2');
insert into test_scratch (key, value)
  select 'target_player_id', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_s_target');

-- a GK target, added as a guest so we can set primary_position directly
select tests.authenticate_as('test_s_owner');
insert into test_scratch (key, value)
  select 'gk_player_id', public.add_guest_player((select value::uuid from test_scratch where key = 'group_id'), 'Golkiper', 'POR')::text;

-- 1. get_scouting_status: no shared match yet -> no_shared_match (default require_shared_match=true)
select tests.authenticate_as('test_s_rater');
select results_eq(
  format($$ select can_vote, reason from public.get_scouting_status(%L) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  $$ values (false, 'no_shared_match') $$,
  'get_scouting_status reports no_shared_match before any shared match'
);

-- 2. submit_scouting_votes rejected before a shared match
select throws_like(
  format($$ select public.submit_scouting_votes(%L, 'quick', jsonb_build_object('pac', 7)) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  'PICADO_NO_SHARED_MATCH:%',
  'submit_scouting_votes rejects a rater with no shared match with the target'
);

-- 3. self-vote rejected
select throws_like(
  format($$ select public.submit_scouting_votes(%L, 'quick', jsonb_build_object('pac', 7)) $$, (select value::uuid from test_scratch where key = 'rater_player_id')),
  'PICADO_SELF_VOTE:%',
  'submit_scouting_votes rejects a self-vote'
);

-- 4. spectator cannot vote at all
select tests.authenticate_as('test_s_spectator');
select throws_like(
  format($$ select public.submit_scouting_votes(%L, 'quick', jsonb_build_object('pac', 7)) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  'PICADO_SPECTATOR:%',
  'a spectator cannot cast scouting votes'
);

-- create a shared, finalized-enough (reporting) match so voting unlocks: team A has rater +
-- rater2, team B has target + the GK guest, all in the same match.
select tests.authenticate_as('test_s_owner');
insert into test_scratch (key, value)
  select 'match_id', public.create_match((select value::uuid from test_scratch where key = 'group_id'), now(), 5)::text;
select public.set_match_lineup(
  (select value::uuid from test_scratch where key = 'match_id'),
  jsonb_build_object(
    'name', 'A',
    'players', jsonb_build_array(
      jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'rater_player_id')),
      jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'rater2_player_id'))
    )
  ),
  jsonb_build_object(
    'name', 'B',
    'players', jsonb_build_array(
      jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'target_player_id')),
      jsonb_build_object('player_id', (select value::uuid from test_scratch where key = 'gk_player_id'))
    )
  ),
  '{}'::uuid[]
);
select public.start_reporting((select value::uuid from test_scratch where key = 'match_id'));

-- 5. get_scouting_status now reports ok
select tests.authenticate_as('test_s_rater');
select results_eq(
  format($$ select can_vote, reason from public.get_scouting_status(%L) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  $$ values (true, 'ok') $$,
  'get_scouting_status reports ok once rater and target share a match'
);

-- 6. quick mode rejects a detailed sub-attribute key
select throws_like(
  format($$ select public.submit_scouting_votes(%L, 'quick', jsonb_build_object('finishing', 7)) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  'PICADO_VALIDATION:%',
  'quick mode rejects a detailed sub-attribute key'
);

-- 7. detailed mode rejects a face-stat key
select throws_like(
  format($$ select public.submit_scouting_votes(%L, 'detailed', jsonb_build_object('pac', 7)) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  'PICADO_VALIDATION:%',
  'detailed mode rejects a face-stat key'
);

-- 8. GK attributes are rejected for a non-GK target
select throws_like(
  format($$ select public.submit_scouting_votes(%L, 'detailed', jsonb_build_object('gk_reflexes', 7)) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  'PICADO_VALIDATION:%',
  'GK attributes are rejected for a non-GK target'
);

-- 9. value out of range is rejected
select throws_like(
  format($$ select public.submit_scouting_votes(%L, 'quick', jsonb_build_object('pac', 11)) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  'PICADO_VALIDATION:%',
  'a vote value out of 1..10 is rejected'
);

-- 10. a valid quick-mode vote succeeds
select lives_ok(
  format($$ select public.submit_scouting_votes(%L, 'quick', jsonb_build_object('pac', 7, 'sho', 5)) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  'a valid quick-mode scouting vote succeeds'
);
select is(
  (
    select count(*)::int from public.scouting_votes
    where rater_player_id = (select value::uuid from test_scratch where key = 'rater_player_id')
      and target_player_id = (select value::uuid from test_scratch where key = 'target_player_id')
      and superseded_at is null
  ),
  2,
  'the ballot recorded 2 current votes'
);

-- 11. cooldown: revoting the same target immediately is rejected
select throws_like(
  format($$ select public.submit_scouting_votes(%L, 'quick', jsonb_build_object('pac', 9)) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  'PICADO_COOLDOWN:%',
  'revoting within the cooldown window is rejected'
);
select results_eq(
  format($$ select can_vote, reason from public.get_scouting_status(%L) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  $$ values (false, 'cooldown') $$,
  'get_scouting_status reports cooldown right after voting'
);

-- 12. GK attributes ARE allowed for a GK target (rater2 shares the same match with the GK guest)
select tests.authenticate_as('test_s_rater2');
select lives_ok(
  format($$ select public.submit_scouting_votes(%L, 'detailed', jsonb_build_object('gk_reflexes', 8)) $$, (select value::uuid from test_scratch where key = 'gk_player_id')),
  'GK attributes are accepted for a GK target once shared_match is satisfied'
);

-- 13. supersede: revoting after the cooldown keeps history (old row superseded, not deleted)
-- (RPCs use pg_catalog.now(), which is transaction time and not affected by tests.freeze_time;
-- backdate the existing vote directly, as the table-owning postgres role, to simulate the
-- cooldown elapsing. reset role restores the original superuser connection, which bypasses RLS
-- and grants entirely -- tests.authenticate_as_service_role only gets the service_role's own,
-- much more limited, table grants.)
reset role;
update public.scouting_votes
set created_at = pg_catalog.now() - interval '31 days'
where rater_player_id = (select value::uuid from test_scratch where key = 'rater_player_id')
  and target_player_id = (select value::uuid from test_scratch where key = 'target_player_id')
  and superseded_at is null;

select tests.authenticate_as('test_s_rater');
select public.submit_scouting_votes((select value::uuid from test_scratch where key = 'target_player_id'), 'quick', jsonb_build_object('pac', 9));
select is(
  (
    select count(*)::int from public.scouting_votes
    where rater_player_id = (select value::uuid from test_scratch where key = 'rater_player_id')
      and target_player_id = (select value::uuid from test_scratch where key = 'target_player_id')
      and attribute = 'pac'
  ),
  2,
  'supersede keeps the old row (superseded_at set) instead of deleting it'
);
select is(
  (
    select value from public.scouting_votes
    where rater_player_id = (select value::uuid from test_scratch where key = 'rater_player_id')
      and target_player_id = (select value::uuid from test_scratch where key = 'target_player_id')
      and attribute = 'pac'
      and superseded_at is null
  ),
  9,
  'the new current value is the latest vote'
);

-- 14. votes are private: rater2 cannot see rater's ballot rows
select tests.authenticate_as('test_s_rater2');
select is(
  (
    select count(*)::int from public.scouting_votes
    where rater_player_id = (select value::uuid from test_scratch where key = 'rater_player_id')
  ),
  0,
  'a different rater sees 0 rows of another rater''s ballot'
);

-- 15. playstyle votes: too many playstyles rejected
select tests.authenticate_as('test_s_rater');
select throws_like(
  format(
    $$ select public.submit_playstyle_votes(%L, array['rapid','flair','technical','trickster','aerial','block']) $$,
    (select value::uuid from test_scratch where key = 'target_player_id')
  ),
  'PICADO_VALIDATION:%',
  'more than 5 playstyles is rejected'
);

-- 16. unknown playstyle code rejected
select throws_like(
  format($$ select public.submit_playstyle_votes(%L, array['not_a_real_code']) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  'PICADO_VALIDATION:%',
  'an unknown playstyle code is rejected'
);

-- 17. a valid playstyle vote succeeds
select lives_ok(
  format($$ select public.submit_playstyle_votes(%L, array['rapid','flair']) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  'a valid playstyle vote succeeds'
);

-- 18. star votes: out-of-range value rejected
select throws_like(
  format($$ select public.submit_star_votes(%L, 6, null) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  'PICADO_VALIDATION:%',
  'a weak_foot value out of 1..5 is rejected'
);

-- 19. a valid star vote succeeds and is idempotent (upsert) on resubmission
select lives_ok(
  format($$ select public.submit_star_votes(%L, 3, 4) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  'a valid star vote succeeds'
);
select lives_ok(
  format($$ select public.submit_star_votes(%L, 4, null) $$, (select value::uuid from test_scratch where key = 'target_player_id')),
  'resubmitting a star vote updates it instead of erroring'
);

-- 20. get_my_scouting_ballot only returns the caller's own current votes
select is(
  (select count(*)::int from public.get_my_scouting_ballot((select value::uuid from test_scratch where key = 'target_player_id'))),
  2,
  'get_my_scouting_ballot returns the caller''s current ballot for the target'
);

select * from finish();

rollback;
