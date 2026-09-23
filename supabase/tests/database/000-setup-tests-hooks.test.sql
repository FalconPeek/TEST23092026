-- Runs first (alphabetical) and is deliberately NOT wrapped in begin/rollback: installs pgTAP and the
-- vendored basejump supabase-test-helpers (v0.0.6, MIT) so later test files can use them.
-- Kept out of supabase/migrations so test-only schemas/grants never reach a real project.

create extension if not exists pgtap with schema extensions;

-- We want to store all of this in the tests schema to keep it
-- separate from any application data
create schema if not exists tests;

--- Create a specific schema for override functions so we don't have to worry about
--- anything else be adding to the tests schema
create schema if not exists test_overrides;

-- anon, authenticated, and service_role should have access to tests schema
grant usage on schema tests to anon, authenticated, service_role;
-- Don't allow public to execute any functions in the tests schema
alter default privileges in schema tests revoke execute on functions from public;
-- Grant execute to anon, authenticated, and service_role for testing purposes
alter default privileges in schema tests grant execute on functions to anon, authenticated, service_role;

-- anon, authenticated, and service_role should have access to test_overrides schema
grant usage on schema test_overrides to anon, authenticated, service_role;
-- Don't allow public to execute any functions in the test_overrides schema
alter default privileges in schema test_overrides revoke execute on functions from public;
-- Grant execute to anon, authenticated, and service_role for testing purposes
alter default privileges in schema test_overrides grant execute on functions to anon, authenticated, service_role;

-- ### tests.create_supabase_user(identifier text, email text, phone text, metadata jsonb)
-- Creates a new user in the `auth.users` table.
create or replace function tests.create_supabase_user(identifier text, email text default null, phone text default null, metadata jsonb default null)
returns uuid
    security definer
    set search_path = auth, pg_temp
as $$
declare
    user_id uuid;
begin
    user_id := extensions.uuid_generate_v4();
    insert into auth.users (id, email, phone, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
    values (user_id, coalesce(email, concat(user_id, '@test.com')), phone, jsonb_build_object('test_identifier', identifier) || coalesce(metadata, '{}'::jsonb), '{}'::jsonb, now(), now())
    returning id into user_id;

    return user_id;
end;
$$ language plpgsql;

-- ### tests.get_supabase_user(identifier text)
-- Returns the user info for a user created with `tests.create_supabase_user`.
create or replace function tests.get_supabase_user(identifier text)
returns json
security definer
set search_path = auth, pg_temp
as $$
    declare
        supabase_user json;
    begin
        select json_build_object(
        'id', id,
        'email', email,
        'phone', phone,
        'raw_user_meta_data', raw_user_meta_data,
        'raw_app_meta_data', raw_app_meta_data
        ) into supabase_user
        from auth.users
        where raw_user_meta_data ->> 'test_identifier' = identifier limit 1;

        if supabase_user is null OR supabase_user -> 'id' IS NULL then
            raise exception 'User with identifier % not found', identifier;
        end if;
        return supabase_user;
    end;
$$ language plpgsql;

-- ### tests.get_supabase_uid(identifier text)
-- Returns the user UUID for a user created with `tests.create_supabase_user`.
create or replace function tests.get_supabase_uid(identifier text)
    returns uuid
    security definer
    set search_path = auth, pg_temp
as $$
declare
    supabase_user uuid;
begin
    select id into supabase_user from auth.users where raw_user_meta_data ->> 'test_identifier' = identifier limit 1;
    if supabase_user is null then
        raise exception 'User with identifier % not found', identifier;
    end if;
    return supabase_user;
end;
$$ language plpgsql;

-- ### tests.authenticate_as(identifier text)
-- Authenticates as a user created with `tests.create_supabase_user`.
create or replace function tests.authenticate_as (identifier text)
    returns void
    as $$
        declare
                user_data json;
                original_auth_data text;
        begin
            -- store the request.jwt.claims in a variable in case we need it
            original_auth_data := current_setting('request.jwt.claims', true);
            user_data := tests.get_supabase_user(identifier);

            if user_data is null OR user_data ->> 'id' IS NULL then
                raise exception 'User with identifier % not found', identifier;
            end if;

            perform set_config('role', 'authenticated', true);
            perform set_config('request.jwt.claims', json_build_object(
                'sub', user_data ->> 'id',
                'email', user_data ->> 'email',
                'phone', user_data ->> 'phone',
                'user_metadata', user_data -> 'raw_user_meta_data',
                'app_metadata', user_data -> 'raw_app_meta_data'
            )::text, true);

        exception
            -- revert back to original auth data
            when others then
                set local role authenticated;
                set local "request.jwt.claims" to original_auth_data;
                raise;
        end
    $$ language plpgsql;

-- ### tests.authenticate_as_service_role()
-- Clears authentication object and sets role to service_role.
create or replace function tests.authenticate_as_service_role ()
    returns void
    as $$
        begin
            perform set_config('role', 'service_role', true);
            perform set_config('request.jwt.claims', null, true);
        end
    $$ language plpgsql;

-- ### tests.clear_authentication()
-- Clears out the authentication and sets role to anon
create or replace function tests.clear_authentication()
    returns void as $$
begin
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', null, true);
end
$$ language plpgsql;

-- ### tests.rls_enabled(testing_schema text)
-- pgTAP function to check if RLS is enabled on all tables in a provided schema
create or replace function tests.rls_enabled (testing_schema text)
returns text as $$
    select is(
        (select
            count(pc.relname)::integer
           from pg_class pc
           join pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = rls_enabled.testing_schema
           join pg_type pt on pt.oid = pc.reltype
           where relrowsecurity = false)
        ,
        0,
        'All tables in the' || testing_schema || ' schema should have row level security enabled');
$$ language sql;

-- ### tests.rls_enabled(testing_schema text, testing_table text)
-- pgTAP function to check if RLS is enabled on a specific table
create or replace function tests.rls_enabled (testing_schema text, testing_table text)
returns text as $$
    select is(
        (select
            count(*)::integer
           from pg_class pc
           join pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = rls_enabled.testing_schema and pc.relname = rls_enabled.testing_table
           join pg_type pt on pt.oid = pc.reltype
           where relrowsecurity = true),
        1,
        testing_table || 'table in the' || testing_schema || ' schema should have row level security enabled'
    );
$$ language sql;

-- Generated now() function used to replace pg_catalog.now() for the purpose
-- of freezing time in tests. This should not be used directly.
create or replace function test_overrides.now()
    returns timestamp with time zone
as $$
begin
    -- check if a frozen time is set
    if nullif(current_setting('tests.frozen_time'), '') is not null then
        return current_setting('tests.frozen_time')::timestamptz;
    end if;

    return pg_catalog.now();
end
$$ language plpgsql;

-- ### tests.freeze_time(frozen_time timestamptz) / tests.unfreeze_time()
-- Overwrites the current time from now() to the provided time. Only for use inside a pgtap
-- test transaction.
create or replace function tests.freeze_time(frozen_time timestamp with time zone)
    returns void
as $$
begin
    if current_setting('search_path') not like 'test_overrides,%' then
        perform set_config('tests.original_search_path', current_setting('search_path'), true);
        perform set_config('search_path', 'test_overrides,' || current_setting('tests.original_search_path') || ',pg_catalog', true);
    end if;

    perform set_config('tests.frozen_time', frozen_time::text, true);
end
$$ language plpgsql;

create or replace function tests.unfreeze_time()
    returns void
as $$
begin
    perform set_config('tests.frozen_time', null, true);
    perform set_config('search_path', current_setting('tests.original_search_path'), true);
end
$$ language plpgsql;

select plan(1);
select ok(true, 'test helpers installed');
select * from finish();
