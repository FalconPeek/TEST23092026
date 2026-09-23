-- SECURITY DEFINER helpers used by RLS policies and RPCs. Fully-qualified names, search_path
-- pinned to '', not exposed by the Data API (schema `private` is not in [api] schemas).

create or replace function private.is_member(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_member(uuid) from public;
grant execute on function private.is_member(uuid) to authenticated;

create or replace function private.member_role(p_group_id uuid)
returns public.group_role
language sql
security definer
set search_path = ''
stable
as $$
  select gm.role
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.user_id = (select auth.uid());
$$;

revoke execute on function private.member_role(uuid) from public;
grant execute on function private.member_role(uuid) to authenticated;

create or replace function private.is_group_admin(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = (select auth.uid())
      and gm.role in ('owner', 'admin')
  );
$$;

revoke execute on function private.is_group_admin(uuid) from public;
grant execute on function private.is_group_admin(uuid) to authenticated;

create or replace function private.my_player_id(p_group_id uuid)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select p.id
  from public.players p
  where p.group_id = p_group_id
    and p.user_id = (select auth.uid());
$$;

revoke execute on function private.my_player_id(uuid) from public;
grant execute on function private.my_player_id(uuid) to authenticated;

-- Used by profiles' select policy: true if the caller shares any group with p_user_id.
create or replace function private.shares_group(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.group_members gm1
    join public.group_members gm2 on gm2.group_id = gm1.group_id
    where gm1.user_id = (select auth.uid())
      and gm2.user_id = p_user_id
  );
$$;

revoke execute on function private.shares_group(uuid) from public;
grant execute on function private.shares_group(uuid) to authenticated;

-- Not user-callable directly (used by public.create_group); URL-safe-ish slug from a name.
create or replace function private.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(trim(both '-' from regexp_replace(lower(p_text), '[^a-z0-9]+', '-', 'g')), ''),
    'grupo'
  );
$$;

revoke execute on function private.slugify(text) from public;

-- Not user-callable directly (used by public.create_invite); loops until a unique code is found.
create or replace function private.generate_invite_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_exists boolean;
begin
  loop
    v_code := substr(translate(encode(extensions.gen_random_bytes(8), 'base64'), '+/=', 'xyz'), 1, 10);
    select exists (select 1 from public.invites i where i.code = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end;
$$;

revoke execute on function private.generate_invite_code() from public;

-- Not user-callable directly (used by public.update_my_player / public.update_player).
create or replace function private.apply_player_update(
  p_player_id uuid,
  p_display_name text,
  p_primary_position text,
  p_alt_positions text[],
  p_preferred_foot public.preferred_foot,
  p_height_cm int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(p_display_name);
begin
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'PICADO_VALIDATION: display name must be between 1 and 60 characters';
  end if;
  if p_height_cm is not null and (p_height_cm < 120 or p_height_cm > 230) then
    raise exception 'PICADO_VALIDATION: height must be between 120 and 230 cm';
  end if;

  update public.players
  set display_name = v_name,
      primary_position = p_primary_position,
      alt_positions = coalesce(p_alt_positions, '{}'::text[]),
      preferred_foot = p_preferred_foot,
      height_cm = p_height_cm
  where id = p_player_id;
end;
$$;

revoke execute on function private.apply_player_update(uuid, text, text, text[], public.preferred_foot, int) from public;
