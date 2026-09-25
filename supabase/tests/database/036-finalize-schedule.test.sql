-- The finalize job is scheduled, is a no-op without Vault secrets, and clients can't call it.
begin;

select plan(4);

select ok(
  exists (select 1 from cron.job where jobname = 'picado-finalize' and schedule = '5-59/10 * * * *'),
  'picado-finalize runs every 10 minutes'
);

select ok(
  exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net'),
  'pg_net is installed'
);

-- No secrets in the test database: the function returns null instead of calling out.
delete from vault.secrets where name in ('picado_site_url', 'picado_cron_secret');
select is(private.trigger_finalize(), null::bigint, 'without Vault secrets the job does nothing');

select ok(
  not has_function_privilege('authenticated', 'private.trigger_finalize()', 'execute')
    and not has_function_privilege('anon', 'private.trigger_finalize()', 'execute'),
  'clients cannot trigger the finalizer call'
);

select * from finish();
rollback;
