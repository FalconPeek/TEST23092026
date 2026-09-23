-- push_subscriptions: save_push_subscription upserts on the unique endpoint and reassigns it to
-- whoever calls it; delete_push_subscription only ever deletes the caller's own rows; select is
-- own-rows-only; no direct DML grants for authenticated.
begin;

select plan(17);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_p_alice');
select tests.create_supabase_user('test_p_bob');

-- 1-2. validation: empty endpoint/keys rejected
select tests.authenticate_as('test_p_alice');
select throws_like(
  $$ select public.save_push_subscription('', 'p256dh', 'auth') $$,
  'PICADO_VALIDATION:%',
  'save_push_subscription rejects an empty endpoint'
);
select throws_like(
  $$ select public.save_push_subscription('https://push.example/ep1', '', 'auth') $$,
  'PICADO_VALIDATION:%',
  'save_push_subscription rejects an empty p256dh'
);

-- 3. a valid call succeeds and returns an id
select isnt(
  public.save_push_subscription('https://push.example/ep1', 'p256dh-a', 'auth-a', 'Mozilla/5.0'),
  null,
  'a valid save_push_subscription call returns an id'
);

-- 4. alice sees exactly her own subscription
select is(
  (select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/ep1'),
  1,
  'alice can select her own subscription'
);
select is(
  (select user_id from public.push_subscriptions where endpoint = 'https://push.example/ep1'),
  tests.get_supabase_uid('test_p_alice'),
  'the subscription is owned by alice'
);

-- 5. bob does not see alice's subscription
select tests.authenticate_as('test_p_bob');
select is(
  (select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/ep1'),
  0,
  'bob cannot see alice''s subscription'
);

-- 6. re-saving the same endpoint as bob reassigns it to bob (shared-device scenario)
select public.save_push_subscription('https://push.example/ep1', 'p256dh-b', 'auth-b', 'Chrome/1.0');
select is(
  (select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/ep1'),
  1,
  'saving the same endpoint again still yields exactly one row (upsert, not insert)'
);
select is(
  (select user_id from public.push_subscriptions where endpoint = 'https://push.example/ep1'),
  tests.get_supabase_uid('test_p_bob'),
  'the endpoint is now reassigned to bob'
);

-- 7. bob can no longer delete via a stale reference to alice's endpoint... but alice legitimately
-- no longer has any subscription to delete either; instead verify a *different* endpoint's
-- ownership boundary: alice saves her own second endpoint, bob cannot delete it.
select tests.authenticate_as('test_p_alice');
select public.save_push_subscription('https://push.example/ep2', 'p256dh-a2', 'auth-a2');

select tests.authenticate_as('test_p_bob');
select throws_like(
  $$ select public.delete_push_subscription('https://push.example/ep2') $$,
  'PICADO_FORBIDDEN:%',
  'delete_push_subscription rejects deleting another user''s endpoint'
);

-- Switch back to alice (the owner) to check: bob's own-rows-only select policy would report 0
-- regardless of whether the row still exists, which isn't what this assertion is about.
select tests.authenticate_as('test_p_alice');
select is(
  (select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/ep2'),
  1,
  'the other user''s endpoint was not deleted'
);
select tests.authenticate_as('test_p_bob');

-- 8. deleting a non-existent endpoint is a no-op, not an error
select lives_ok(
  $$ select public.delete_push_subscription('https://push.example/does-not-exist') $$,
  'delete_push_subscription on an unknown endpoint is idempotent'
);

-- 9. deleting your own endpoint works
select tests.authenticate_as('test_p_alice');
select lives_ok(
  $$ select public.delete_push_subscription('https://push.example/ep2') $$,
  'delete_push_subscription removes the caller''s own row'
);
select is(
  (select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/ep2'),
  0,
  'the endpoint is gone after deletion'
);

-- 10-11. authenticated cannot write push_subscriptions directly
select throws_ok(
  $$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ((select auth.uid()), 'https://push.example/hack', 'x', 'x') $$,
  '42501', null, 'authenticated cannot insert into push_subscriptions'
);
select throws_ok(
  $$ update public.push_subscriptions set p256dh = 'hacked' where endpoint = 'https://push.example/ep1' $$,
  '42501', null, 'authenticated cannot update push_subscriptions'
);

-- 12. anon cannot select push_subscriptions
select tests.clear_authentication();
select throws_ok(
  $$ select * from public.push_subscriptions $$,
  '42501', null, 'anon cannot select push_subscriptions'
);

-- 13. RLS is enabled
reset role;
select tests.rls_enabled('public', 'push_subscriptions');

select * from finish();
rollback;
