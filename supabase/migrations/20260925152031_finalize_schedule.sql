-- Automatic match finalization every 10 minutes (user decision: option A in docs/DEPLOY.md).
-- pg_cron already marks expired matches pending_finalize (picado-close-windows); the TypeScript
-- finalizer runs when POST /api/cron/finalize is called with the CRON_SECRET bearer. This job
-- makes that call through pg_net, reading both values from Supabase Vault:
--   select vault.create_secret('https://<domain>/', 'picado_site_url');
--   select vault.create_secret('<CRON_SECRET>', 'picado_cron_secret');
-- Without those secrets (e.g. local dev) the job is a no-op.

create extension if not exists pg_net with schema extensions;

create or replace function private.trigger_finalize()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site_url text;
  v_secret text;
begin
  select decrypted_secret into v_site_url from vault.decrypted_secrets where name = 'picado_site_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'picado_cron_secret';
  if v_site_url is null or v_secret is null then
    return null;
  end if;

  return net.http_post(
    url := rtrim(v_site_url, '/') || '/api/cron/finalize',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function private.trigger_finalize() from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    select jobid into v_job_id from cron.job where jobname = 'picado-finalize';
    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;
    -- Offset by 5 minutes from picado-close-windows (*/10); the route closes windows itself too.
    perform cron.schedule('picado-finalize', '5-59/10 * * * *', 'select private.trigger_finalize();');
  end if;
end;
$$;
