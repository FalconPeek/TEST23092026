-- M7 clubs: admin-only management, member visibility, roster validation, crest storage policies.
begin;

select plan(14);

create temporary table test_scratch (key text primary key, value text) on commit drop;
grant all on test_scratch to anon, authenticated, service_role;

select tests.create_supabase_user('test_c_owner');
select tests.create_supabase_user('test_c_member');
select tests.create_supabase_user('test_c_outsider');

select tests.authenticate_as('test_c_owner');
insert into test_scratch (key, value) select 'group_id', public.create_group('Clubs Test Group')::text;
insert into test_scratch (key, value) select 'code', code from public.create_invite((select value::uuid from test_scratch where key = 'group_id'));
select tests.authenticate_as('test_c_member');
select public.accept_invite((select value from test_scratch where key = 'code'));

select tests.authenticate_as('test_c_outsider');
insert into test_scratch (key, value) select 'other_group_id', public.create_group('Other Clubs Group')::text;
insert into test_scratch (key, value)
  select 'outsider_pid', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'other_group_id') and user_id = tests.get_supabase_uid('test_c_outsider');

select tests.authenticate_as('test_c_owner');
insert into test_scratch (key, value)
  select 'owner_pid', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_c_owner');
insert into test_scratch (key, value)
  select 'member_pid', id::text from public.players
  where group_id = (select value::uuid from test_scratch where key = 'group_id') and user_id = tests.get_supabase_uid('test_c_member');

-- 1. an admin creates a club (short name upper-cased)
insert into test_scratch (key, value)
  select 'club_id', public.create_club((select value::uuid from test_scratch where key = 'group_id'), 'Los Pibes', 'lpb', '#ff0000', '#ffffff')::text;
select is(
  (select short_name from public.clubs where id = (select value::uuid from test_scratch where key = 'club_id')),
  'LPB',
  'admins create clubs; the short name is stored upper-case'
);

-- 2. duplicate names are rejected
select throws_ok(
  format($$ select public.create_club(%L, 'los pibes', 'LP2') $$, (select value from test_scratch where key = 'group_id')),
  'P0001', 'PICADO_VALIDATION: a club with that name already exists',
  'club names are unique per group (case-insensitive)'
);

-- 3. bad colors are rejected
select throws_ok(
  format($$ select public.create_club(%L, 'Rojos', 'ROJ', 'red', '#ffffff') $$, (select value from test_scratch where key = 'group_id')),
  'P0001', 'PICADO_VALIDATION: colors must be #RRGGBB',
  'colors must be #RRGGBB'
);

-- 4. roster: group players with unique shirt numbers
select lives_ok(
  format($$ select public.set_club_players(%L, %L::jsonb) $$,
    (select value from test_scratch where key = 'club_id'),
    jsonb_build_array(
      jsonb_build_object('player_id', (select value from test_scratch where key = 'owner_pid'), 'shirt_number', 10),
      jsonb_build_object('player_id', (select value from test_scratch where key = 'member_pid'), 'shirt_number', 9)
    )::text),
  'admins set the club roster'
);

-- 5. players from another group are rejected
select throws_ok(
  format($$ select public.set_club_players(%L, %L::jsonb) $$,
    (select value from test_scratch where key = 'club_id'),
    jsonb_build_array(jsonb_build_object('player_id', (select value from test_scratch where key = 'outsider_pid')))::text),
  'P0001', 'PICADO_VALIDATION: player is not an active member of this group',
  'only this group''s players can join a club'
);

-- 6. crest path must be this group's folder + this club's id
select throws_ok(
  format($$ select public.update_club(%L, 'Los Pibes', 'LPB', '#ff0000', '#ffffff', %L) $$,
    (select value from test_scratch where key = 'club_id'),
    (select value from test_scratch where key = 'other_group_id') || '/' || (select value from test_scratch where key = 'club_id') || '.png'),
  'P0001', 'PICADO_VALIDATION: invalid crest path',
  'a crest path outside the group folder is rejected'
);
select lives_ok(
  format($$ select public.update_club(%L, 'Los Pibes', 'LPB', '#ff0000', '#ffffff', %L) $$,
    (select value from test_scratch where key = 'club_id'),
    (select value from test_scratch where key = 'group_id') || '/' || (select value from test_scratch where key = 'club_id') || '.png'),
  'a crest path in the group folder named after the club is accepted'
);

-- 8. members can read clubs and rosters, but not manage them
select tests.authenticate_as('test_c_member');
select is(
  (select count(*)::int from public.club_players where club_id = (select value::uuid from test_scratch where key = 'club_id')),
  2,
  'members see the club roster'
);
select throws_ok(
  format($$ select public.delete_club(%L) $$, (select value from test_scratch where key = 'club_id')),
  'P0001', 'PICADO_FORBIDDEN: only group admins can manage clubs',
  'members cannot manage clubs'
);

-- 10. outsiders see nothing
select tests.authenticate_as('test_c_outsider');
select is(
  (select count(*)::int from public.clubs where group_id = (select value::uuid from test_scratch where key = 'group_id')),
  0,
  'non-members cannot see the group''s clubs'
);

-- 11. no direct writes
select tests.authenticate_as('test_c_owner');
select throws_ok(
  format($$ insert into public.clubs (group_id, name, short_name) values (%L, 'Hack', 'HCK') $$, (select value from test_scratch where key = 'group_id')),
  '42501', null,
  'authenticated users cannot insert clubs directly'
);

-- 12-13. crest storage: only this group's admins, only for existing clubs
select ok(
  private.can_manage_crest((select value from test_scratch where key = 'group_id') || '/' || (select value from test_scratch where key = 'club_id') || '.webp'),
  'the admin can write the club''s crest object'
);
select tests.authenticate_as('test_c_member');
select ok(
  not private.can_manage_crest((select value from test_scratch where key = 'group_id') || '/' || (select value from test_scratch where key = 'club_id') || '.webp'),
  'members cannot write crest objects'
);

-- 14. the bucket rejects SVG and is limited to 512 KB
reset role;
select is(
  (select allowed_mime_types::text || ' ' || file_size_limit from storage.buckets where id = 'club-crests'),
  '{image/png,image/jpeg,image/webp} 524288',
  'club-crests accepts only png/jpeg/webp up to 512 KB'
);

select * from finish();
rollback;
