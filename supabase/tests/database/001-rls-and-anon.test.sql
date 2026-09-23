-- RLS is enabled everywhere in public, and anon (no grants at all) can neither read the tables
-- nor call any of the SECURITY DEFINER RPCs.
begin;

select plan(8);

-- Every table in the public schema has row level security enabled.
select tests.rls_enabled('public');

select tests.clear_authentication();

select throws_ok($$ select * from public.groups $$, '42501', null, 'anon cannot select groups');
select throws_ok($$ select * from public.group_members $$, '42501', null, 'anon cannot select group_members');
select throws_ok($$ select * from public.invites $$, '42501', null, 'anon cannot select invites');
select throws_ok($$ select * from public.players $$, '42501', null, 'anon cannot select players');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot select profiles');
select throws_ok($$ select public.create_group('Los Pibes') $$, '42501', null, 'anon cannot call create_group');
select throws_ok($$ select public.accept_invite('whatever') $$, '42501', null, 'anon cannot call accept_invite');

select * from finish();

rollback;
