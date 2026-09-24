begin;
select plan(3);

select is(
  (
    select count(*)::int
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
  ),
  0,
  'anon/authenticated hold no TRUNCATE/REFERENCES/TRIGGER on public tables'
);

select is(
  (
    select count(*)::int
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (has_table_privilege('anon', c.oid, 'MAINTAIN') or has_table_privilege('authenticated', c.oid, 'MAINTAIN'))
  ),
  0,
  'anon/authenticated hold no MAINTAIN on public tables'
);

-- A table created after the migration must not inherit the stripped privileges.
create table public.tmp_default_acl_probe (id int);
select ok(
  not has_table_privilege('authenticated', 'public.tmp_default_acl_probe', 'TRUNCATE')
    and not has_table_privilege('anon', 'public.tmp_default_acl_probe', 'TRUNCATE'),
  'new public tables do not grant TRUNCATE to anon/authenticated'
);

select * from finish();
rollback;
