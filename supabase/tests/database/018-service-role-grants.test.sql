begin;
select plan(8);

-- Server pipelines read these with the admin client; authenticated must still not gain anything.
select ok(has_table_privilege('service_role', 'public.profiles', 'select'), 'service_role can read profiles');
select ok(has_table_privilege('service_role', 'public.groups', 'select'), 'service_role can read groups');
select ok(has_table_privilege('service_role', 'public.group_members', 'select'), 'service_role can read group_members');
select ok(has_table_privilege('service_role', 'public.players', 'select'), 'service_role can read players');
select ok(has_table_privilege('service_role', 'public.scouting_votes', 'select'), 'service_role can read scouting_votes');
select ok(has_table_privilege('service_role', 'public.playstyle_votes', 'select'), 'service_role can read playstyle_votes');
select ok(has_table_privilege('service_role', 'public.star_votes', 'select'), 'service_role can read star_votes');
select ok(
  not has_table_privilege('service_role', 'public.scouting_votes', 'insert'),
  'service_role still cannot write scouting_votes directly'
);

select * from finish();
rollback;
