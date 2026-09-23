-- notifications: own rows only, no direct writes for authenticated, read_at only settable via
-- mark_notifications_read (which silently skips ids that aren't the caller's or already read).
-- update_notification_prefs validates kind/boolean and merges into profiles.notification_prefs.
begin;

select plan(19);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_n_alice');
select tests.create_supabase_user('test_n_bob');

-- seed two notifications (one per user) as the table-owning postgres role, matching what the TS
-- dispatcher (service_role admin client) would otherwise insert.
reset role;
insert into public.notifications (id, user_id, kind, payload)
values (gen_random_uuid(), tests.get_supabase_uid('test_n_alice'), 'badge_awarded', '{"badge_code": "first_match"}'::jsonb);
insert into public.notifications (id, user_id, kind, payload)
values (gen_random_uuid(), tests.get_supabase_uid('test_n_alice'), 'match_finalized', '{}'::jsonb);
insert into public.notifications (id, user_id, kind, payload)
values (gen_random_uuid(), tests.get_supabase_uid('test_n_bob'), 'match_finalized', '{}'::jsonb);

insert into test_scratch (key, value)
  select 'alice_notif_1', id::text from public.notifications
  where user_id = tests.get_supabase_uid('test_n_alice') and kind = 'badge_awarded';

insert into test_scratch (key, value)
  select 'bob_notif_1', id::text from public.notifications
  where user_id = tests.get_supabase_uid('test_n_bob');

-- 1. alice sees only her own 2 notifications
select tests.authenticate_as('test_n_alice');
select is((select count(*)::int from public.notifications), 2, 'alice sees only her own notifications');

-- 2. bob sees only his own 1 notification
select tests.authenticate_as('test_n_bob');
select is((select count(*)::int from public.notifications), 1, 'bob sees only his own notifications');

-- 3-4. authenticated cannot write notifications directly
select throws_ok(
  format(
    $$ insert into public.notifications (user_id, kind) values (%L, 'card_updated') $$,
    tests.get_supabase_uid('test_n_bob')
  ),
  '42501', null, 'authenticated cannot insert into notifications'
);
select throws_ok(
  format(
    $$ update public.notifications set read_at = now() where id = %L $$,
    (select value::uuid from test_scratch where key = 'bob_notif_1')
  ),
  '42501', null, 'authenticated cannot update notifications directly'
);

-- 5. anon cannot select notifications
select tests.clear_authentication();
select throws_ok(
  $$ select * from public.notifications $$,
  '42501', null, 'anon cannot select notifications'
);

-- 6. mark_notifications_read ignores ids that belong to another user (no error, 0 rows affected)
select tests.authenticate_as('test_n_alice');
select is(
  public.mark_notifications_read(array[(select value::uuid from test_scratch where key = 'bob_notif_1')]),
  0,
  'mark_notifications_read ignores an id that belongs to another user'
);
select is(
  (select read_at from public.notifications where id = (select value::uuid from test_scratch where key = 'bob_notif_1')),
  null,
  'another user''s notification is left unread'
);

-- 7. mark_notifications_read(specific id) marks just that one
select is(
  public.mark_notifications_read(array[(select value::uuid from test_scratch where key = 'alice_notif_1')]),
  1,
  'mark_notifications_read marks exactly the requested own id'
);
select isnt(
  (select read_at from public.notifications where id = (select value::uuid from test_scratch where key = 'alice_notif_1')),
  null,
  'the requested notification is now read'
);

-- 8. mark_notifications_read(null) marks every remaining unread notification of the caller
select is(
  public.mark_notifications_read(null),
  1,
  'mark_notifications_read(null) marks all of the caller''s remaining unread notifications'
);
select is(
  (select count(*)::int from public.notifications where user_id = tests.get_supabase_uid('test_n_alice') and read_at is null),
  0,
  'alice has no unread notifications left'
);

-- 9. re-marking already-read notifications is a no-op (returns 0, not an error)
select is(public.mark_notifications_read(null), 0, 'marking again with nothing unread returns 0');

-- 10. bob's notification is still unread (untouched by alice's calls)
select tests.authenticate_as('test_n_bob');
select isnt(
  (select 1 from public.notifications where id = (select value::uuid from test_scratch where key = 'bob_notif_1') and read_at is null),
  null,
  'bob''s own notification was never touched by alice''s mark_notifications_read calls'
);

-- 11-12. update_notification_prefs validation
select throws_like(
  $$ select public.update_notification_prefs('{"not_a_real_kind": true}'::jsonb) $$,
  'PICADO_VALIDATION:%',
  'update_notification_prefs rejects an unknown kind'
);
select throws_like(
  $$ select public.update_notification_prefs('{"match_finalized": "yes"}'::jsonb) $$,
  'PICADO_VALIDATION:%',
  'update_notification_prefs rejects a non-boolean value'
);

-- 13. a valid call merges into the caller's own profile
select lives_ok(
  $$ select public.update_notification_prefs('{"match_finalized": false}'::jsonb) $$,
  'a valid update_notification_prefs call succeeds'
);
select is(
  (select notification_prefs ->> 'match_finalized' from public.profiles where id = tests.get_supabase_uid('test_n_bob')),
  'false',
  'the pref was persisted on the caller''s own profile'
);

-- 14. a second call merges (doesn't clobber) rather than replacing the whole object
select public.update_notification_prefs('{"badge_awarded": false}'::jsonb);
select is(
  (select notification_prefs from public.profiles where id = tests.get_supabase_uid('test_n_bob')),
  '{"badge_awarded": false, "match_finalized": false}'::jsonb,
  'update_notification_prefs merges instead of replacing'
);

-- 15. RLS is enabled
reset role;
select tests.rls_enabled('public', 'notifications');

select * from finish();
rollback;
