-- profiles: auto-created by trigger, visible to self and to shared-group users only, updatable
-- only by the owner.
begin;

select plan(8);

select tests.create_supabase_user('test_profiles_a');
select tests.create_supabase_user('test_profiles_b');
select tests.create_supabase_user('test_profiles_c', 'shared_c@test.com', null, '{"full_name":"Carlos Perez"}'::jsonb);
select tests.create_supabase_user('test_profiles_owner');
select tests.create_supabase_user('test_profiles_member');

-- 1. the auth.users insert trigger creates a matching public.profiles row
select ok(
  exists(select 1 from public.profiles where id = tests.get_supabase_uid('test_profiles_a')),
  'a profile row is auto-created for every new auth user'
);

-- 2. display_name falls back to raw_user_meta_data->>'full_name' when present
select is(
  (select display_name from public.profiles where id = tests.get_supabase_uid('test_profiles_c')),
  'Carlos Perez',
  'display_name is derived from raw_user_meta_data.full_name'
);

select tests.authenticate_as('test_profiles_a');

-- 3. a user can select their own profile
select is(
  (select count(*)::int from public.profiles where id = tests.get_supabase_uid('test_profiles_a')),
  1,
  'a user can select their own profile'
);

-- 4. a user cannot select an unrelated user's profile
select is(
  (select count(*)::int from public.profiles where id = tests.get_supabase_uid('test_profiles_b')),
  0,
  'a user cannot select an unrelated profile'
);

-- 5. a user can update their own display_name / avatar_url
update public.profiles set display_name = 'Nuevo Nombre' where id = tests.get_supabase_uid('test_profiles_a');
select is(
  (select display_name from public.profiles where id = tests.get_supabase_uid('test_profiles_a')),
  'Nuevo Nombre',
  'a user can update their own display_name'
);

-- 6. a user cannot update someone else's profile (RLS filters it to zero affected rows)
select is_empty(
  format(
    $$ update public.profiles set display_name = 'Hacked' where id = %L returning 1 $$,
    tests.get_supabase_uid('test_profiles_b')
  ),
  'update against a non-owned profile filters to zero rows'
);

-- Arrange a shared group between test_profiles_owner and test_profiles_member via the real RPCs.
create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.authenticate_as('test_profiles_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Grupo Compartido')::text;
insert into test_scratch (key, value)
  select 'invite_code', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));

select tests.authenticate_as('test_profiles_member');
select public.accept_invite((select value from test_scratch where key = 'invite_code'));

-- 7. a member can see a group-mate's profile
select is(
  (select count(*)::int from public.profiles where id = tests.get_supabase_uid('test_profiles_owner')),
  1,
  'a member can see a group-mate profile'
);

select tests.authenticate_as('test_profiles_a');

-- 8. an unrelated user still cannot see that profile
select is(
  (select count(*)::int from public.profiles where id = tests.get_supabase_uid('test_profiles_owner')),
  0,
  'a user outside the group still cannot see the profile'
);

select * from finish();

rollback;
