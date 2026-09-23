-- Private schema for SECURITY DEFINER helper functions used by RLS policies and RPCs.
-- Not part of api.schemas in supabase/config.toml, so it is never exposed by the Data API.
create schema if not exists private;

-- Nobody gets anything by default; grants are added explicitly per-object as helpers are created.
revoke all on schema private from public;

-- Policies on public tables call private.* helper functions as the `authenticated` role, which
-- requires USAGE on the schema in addition to per-function EXECUTE grants added later.
grant usage on schema private to authenticated;
