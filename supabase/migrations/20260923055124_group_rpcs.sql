-- Public RPCs for group/membership/invite/player writes. Every function is SECURITY DEFINER,
-- search_path pinned to '', fully-qualified names, revoked from public/anon, granted to
-- authenticated only. Errors are raised with a stable `PICADO_<CODE>: ` prefix that Server Actions
-- map to Spanish messages.

-- ### public.create_group(p_name text) returns uuid
create or replace function public.create_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := trim(p_name);
  v_group_id uuid;
  v_slug text;
begin
  if v_uid is null then
    raise exception 'PICADO_FORBIDDEN: authentication required';
  end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'PICADO_VALIDATION: group name must be between 1 and 60 characters';
  end if;

  v_slug := private.slugify(v_name) || '-' || substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.groups (name, slug, owner_id)
  values (v_name, v_slug, v_uid)
  returning id into v_group_id;

  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, v_uid, 'owner');

  insert into public.players (group_id, user_id, display_name, is_guest, created_by)
  select v_group_id, v_uid, coalesce(pr.display_name, 'Jugador'), false, v_uid
  from public.profiles pr
  where pr.id = v_uid;

  return v_group_id;
end;
$$;

revoke execute on function public.create_group(text) from public;
grant execute on function public.create_group(text) to authenticated;

-- ### public.update_group(p_group_id uuid, p_name text, p_settings jsonb)
-- Admin only. Settings are zod-validated in the Server Action; here we only check it's an object.
create or replace function public.update_group(p_group_id uuid, p_name text, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(p_name);
begin
  if not private.is_group_admin(p_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can update the group';
  end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'PICADO_VALIDATION: group name must be between 1 and 60 characters';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'PICADO_VALIDATION: settings must be a json object';
  end if;

  update public.groups
  set name = v_name,
      settings = p_settings
  where id = p_group_id;
end;
$$;

revoke execute on function public.update_group(uuid, text, jsonb) from public;
grant execute on function public.update_group(uuid, text, jsonb) to authenticated;

-- ### public.create_invite(p_group_id, p_role, p_expires_at, p_max_uses) returns table(id, code)
-- Admin only; role cannot be owner; only the owner may create admin invites.
create or replace function public.create_invite(
  p_group_id uuid,
  p_role public.group_role default 'member',
  p_expires_at timestamptz default (now() + interval '7 days'),
  p_max_uses int default null
)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_caller_role public.group_role;
  v_code text;
  v_id uuid;
begin
  select gm.role into v_caller_role
  from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = v_uid;

  if v_caller_role is null or v_caller_role not in ('owner', 'admin') then
    raise exception 'PICADO_FORBIDDEN: only group admins can create invites';
  end if;
  if p_role = 'owner' then
    raise exception 'PICADO_VALIDATION: invites cannot grant the owner role';
  end if;
  if p_role = 'admin' and v_caller_role <> 'owner' then
    raise exception 'PICADO_FORBIDDEN: only the owner can create admin invites';
  end if;
  if p_max_uses is not null and p_max_uses < 1 then
    raise exception 'PICADO_VALIDATION: max_uses must be a positive integer';
  end if;

  v_code := private.generate_invite_code();

  insert into public.invites (group_id, code, role, created_by, expires_at, max_uses)
  values (p_group_id, v_code, p_role, v_uid, p_expires_at, p_max_uses)
  returning invites.id into v_id;

  return query select v_id, v_code;
end;
$$;

revoke execute on function public.create_invite(uuid, public.group_role, timestamptz, int) from public;
grant execute on function public.create_invite(uuid, public.group_role, timestamptz, int) to authenticated;

-- ### public.revoke_invite(p_invite_id uuid)
create or replace function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  select i.group_id into v_group_id from public.invites i where i.id = p_invite_id;
  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: invite not found';
  end if;
  if not private.is_group_admin(v_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can revoke invites';
  end if;

  update public.invites
  set revoked_at = pg_catalog.now()
  where id = p_invite_id and revoked_at is null;
end;
$$;

revoke execute on function public.revoke_invite(uuid) from public;
grant execute on function public.revoke_invite(uuid) to authenticated;

-- ### public.get_invite_preview(p_code text) returns table(group_id, group_name, role, member_count, valid)
-- Callable by any authenticated user (invite landing page), reveals nothing beyond this shape.
create or replace function public.get_invite_preview(p_code text)
returns table (group_id uuid, group_name text, role public.group_role, member_count integer, valid boolean)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_invite public.invites%rowtype;
begin
  select i.* into v_invite from public.invites i where i.code = p_code;
  if v_invite.id is null then
    raise exception 'PICADO_INVITE_INVALID: invite not found';
  end if;

  return query
  select
    g.id,
    g.name,
    v_invite.role,
    (select count(*)::int from public.group_members gm where gm.group_id = g.id),
    (
      v_invite.revoked_at is null
      and (v_invite.expires_at is null or v_invite.expires_at > pg_catalog.now())
      and (v_invite.max_uses is null or v_invite.uses < v_invite.max_uses)
    )
  from public.groups g
  where g.id = v_invite.group_id;
end;
$$;

revoke execute on function public.get_invite_preview(text) from public;
grant execute on function public.get_invite_preview(text) to authenticated;

-- ### public.accept_invite(p_code text) returns uuid (group_id)
-- Idempotent if already a member (no role change). Creates a player row unless role = spectator.
create or replace function public.accept_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.invites%rowtype;
  v_existing_role public.group_role;
begin
  if v_uid is null then
    raise exception 'PICADO_FORBIDDEN: authentication required';
  end if;

  select i.* into v_invite from public.invites i where i.code = p_code for update;
  if v_invite.id is null then
    raise exception 'PICADO_INVITE_INVALID: invite not found';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'PICADO_INVITE_INVALID: invite revoked';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at <= pg_catalog.now() then
    raise exception 'PICADO_INVITE_INVALID: invite expired';
  end if;
  if v_invite.max_uses is not null and v_invite.uses >= v_invite.max_uses then
    raise exception 'PICADO_INVITE_INVALID: invite has reached its usage limit';
  end if;

  select gm.role into v_existing_role
  from public.group_members gm
  where gm.group_id = v_invite.group_id and gm.user_id = v_uid;

  if v_existing_role is not null then
    return v_invite.group_id;
  end if;

  update public.invites set uses = uses + 1 where id = v_invite.id;

  insert into public.group_members (group_id, user_id, role)
  values (v_invite.group_id, v_uid, v_invite.role);

  if v_invite.role <> 'spectator' then
    insert into public.players (group_id, user_id, display_name, is_guest, created_by)
    select v_invite.group_id, v_uid, coalesce(pr.display_name, 'Jugador'), false, v_uid
    from public.profiles pr
    where pr.id = v_uid;
  end if;

  return v_invite.group_id;
end;
$$;

revoke execute on function public.accept_invite(text) from public;
grant execute on function public.accept_invite(text) to authenticated;

-- ### public.set_member_role(p_group_id, p_user_id, p_role)
-- Only the owner can grant/revoke admin. Admins can switch member<->spectator (creating a player
-- row when moving to member if none exists; the player row is kept when moving to spectator, but
-- any RPC that acts "as a player" must additionally check group_members.role <> 'spectator').
-- The owner's own role can never be changed here (use transfer_ownership).
create or replace function public.set_member_role(p_group_id uuid, p_user_id uuid, p_role public.group_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_caller_role public.group_role;
  v_target_role public.group_role;
begin
  select gm.role into v_caller_role from public.group_members gm where gm.group_id = p_group_id and gm.user_id = v_uid;
  if v_caller_role is null or v_caller_role not in ('owner', 'admin') then
    raise exception 'PICADO_FORBIDDEN: only group admins can change roles';
  end if;

  select gm.role into v_target_role from public.group_members gm where gm.group_id = p_group_id and gm.user_id = p_user_id;
  if v_target_role is null then
    raise exception 'PICADO_VALIDATION: target user is not a member of this group';
  end if;
  if v_target_role = 'owner' then
    raise exception 'PICADO_FORBIDDEN: the owner role cannot be changed here';
  end if;
  if p_role = 'owner' then
    raise exception 'PICADO_VALIDATION: use transfer_ownership to change the owner';
  end if;
  if (p_role = 'admin' or v_target_role = 'admin') and v_caller_role <> 'owner' then
    raise exception 'PICADO_FORBIDDEN: only the owner can grant or revoke admin role';
  end if;

  update public.group_members set role = p_role where group_id = p_group_id and user_id = p_user_id;

  if p_role = 'member' and not exists (
    select 1 from public.players p where p.group_id = p_group_id and p.user_id = p_user_id
  ) then
    insert into public.players (group_id, user_id, display_name, is_guest, created_by)
    select p_group_id, p_user_id, coalesce(pr.display_name, 'Jugador'), false, v_uid
    from public.profiles pr
    where pr.id = p_user_id;
  end if;
end;
$$;

revoke execute on function public.set_member_role(uuid, uuid, public.group_role) from public;
grant execute on function public.set_member_role(uuid, uuid, public.group_role) to authenticated;

-- ### public.transfer_ownership(p_group_id, p_new_owner) — owner only.
create or replace function public.transfer_ownership(p_group_id uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not exists (select 1 from public.groups g where g.id = p_group_id and g.owner_id = v_uid) then
    raise exception 'PICADO_FORBIDDEN: only the current owner can transfer ownership';
  end if;
  if not exists (select 1 from public.group_members gm where gm.group_id = p_group_id and gm.user_id = p_new_owner) then
    raise exception 'PICADO_VALIDATION: the new owner must already be a member of the group';
  end if;

  update public.groups set owner_id = p_new_owner where id = p_group_id;
  update public.group_members set role = 'owner' where group_id = p_group_id and user_id = p_new_owner;
  update public.group_members set role = 'admin' where group_id = p_group_id and user_id = v_uid;
end;
$$;

revoke execute on function public.transfer_ownership(uuid, uuid) from public;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;

-- ### public.remove_member(p_group_id, p_user_id)
-- Admin only; the owner cannot be removed; admins cannot remove other admins unless owner.
-- The player row is kept (history): user_id is cleared and left_at is stamped.
create or replace function public.remove_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_caller_role public.group_role;
  v_target_role public.group_role;
begin
  select gm.role into v_caller_role from public.group_members gm where gm.group_id = p_group_id and gm.user_id = v_uid;
  if v_caller_role is null or v_caller_role not in ('owner', 'admin') then
    raise exception 'PICADO_FORBIDDEN: only group admins can remove members';
  end if;

  select gm.role into v_target_role from public.group_members gm where gm.group_id = p_group_id and gm.user_id = p_user_id;
  if v_target_role is null then
    raise exception 'PICADO_VALIDATION: target user is not a member of this group';
  end if;
  if v_target_role = 'owner' then
    raise exception 'PICADO_FORBIDDEN: the owner cannot be removed';
  end if;
  if v_target_role = 'admin' and v_caller_role <> 'owner' then
    raise exception 'PICADO_FORBIDDEN: only the owner can remove an admin';
  end if;

  delete from public.group_members where group_id = p_group_id and user_id = p_user_id;

  update public.players
  set user_id = null, left_at = pg_catalog.now()
  where group_id = p_group_id and user_id = p_user_id;
end;
$$;

revoke execute on function public.remove_member(uuid, uuid) from public;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- ### public.leave_group(p_group_id) — the owner must transfer ownership first.
create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.group_role;
begin
  select gm.role into v_role from public.group_members gm where gm.group_id = p_group_id and gm.user_id = v_uid;
  if v_role is null then
    raise exception 'PICADO_NOT_MEMBER: you are not a member of this group';
  end if;
  if v_role = 'owner' then
    raise exception 'PICADO_FORBIDDEN: transfer ownership before leaving the group';
  end if;

  delete from public.group_members where group_id = p_group_id and user_id = v_uid;

  update public.players
  set user_id = null, left_at = pg_catalog.now()
  where group_id = p_group_id and user_id = v_uid;
end;
$$;

revoke execute on function public.leave_group(uuid) from public;
grant execute on function public.leave_group(uuid) to authenticated;

-- ### public.add_guest_player(p_group_id, p_display_name, p_primary_position) returns uuid — admin only.
create or replace function public.add_guest_player(p_group_id uuid, p_display_name text, p_primary_position text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := trim(p_display_name);
  v_id uuid;
begin
  if not private.is_group_admin(p_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can add guest players';
  end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'PICADO_VALIDATION: display name must be between 1 and 60 characters';
  end if;

  insert into public.players (group_id, display_name, is_guest, primary_position, created_by)
  values (p_group_id, v_name, true, p_primary_position, v_uid)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.add_guest_player(uuid, text, text) from public;
grant execute on function public.add_guest_player(uuid, text, text) to authenticated;

-- ### public.claim_guest_player(p_player_id) — caller merges into an unclaimed guest.
-- For now "no activity" just means: delete the caller's own (empty) player row in that group, if
-- any, and attach the caller's user_id to the guest.
create or replace function public.claim_guest_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_group_id uuid;
  v_is_guest boolean;
  v_claimed_at timestamptz;
  v_caller_role public.group_role;
  v_my_player_id uuid;
begin
  select p.group_id, p.is_guest, p.claimed_at into v_group_id, v_is_guest, v_claimed_at
  from public.players p
  where p.id = p_player_id;

  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: player not found';
  end if;
  if not v_is_guest or v_claimed_at is not null then
    raise exception 'PICADO_VALIDATION: player is not an unclaimed guest';
  end if;

  select gm.role into v_caller_role from public.group_members gm where gm.group_id = v_group_id and gm.user_id = v_uid;
  if v_caller_role is null or v_caller_role not in ('owner', 'admin', 'member') then
    raise exception 'PICADO_FORBIDDEN: only group members can claim guest players';
  end if;

  select p.id into v_my_player_id from public.players p where p.group_id = v_group_id and p.user_id = v_uid;
  if v_my_player_id is not null then
    delete from public.players where id = v_my_player_id;
  end if;

  update public.players
  set user_id = v_uid, claimed_at = pg_catalog.now(), is_guest = false
  where id = p_player_id;
end;
$$;

revoke execute on function public.claim_guest_player(uuid) from public;
grant execute on function public.claim_guest_player(uuid) to authenticated;

-- ### public.assign_guest_player(p_player_id, p_user_id) — admin-only variant of claim_guest_player.
create or replace function public.assign_guest_player(p_player_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_is_guest boolean;
  v_claimed_at timestamptz;
  v_existing_player_id uuid;
begin
  select p.group_id, p.is_guest, p.claimed_at into v_group_id, v_is_guest, v_claimed_at
  from public.players p
  where p.id = p_player_id;

  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: player not found';
  end if;
  if not private.is_group_admin(v_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can assign guest players';
  end if;
  if not v_is_guest or v_claimed_at is not null then
    raise exception 'PICADO_VALIDATION: player is not an unclaimed guest';
  end if;
  if not exists (select 1 from public.group_members gm where gm.group_id = v_group_id and gm.user_id = p_user_id) then
    raise exception 'PICADO_VALIDATION: target user is not a member of this group';
  end if;

  select p.id into v_existing_player_id from public.players p where p.group_id = v_group_id and p.user_id = p_user_id;
  if v_existing_player_id is not null then
    delete from public.players where id = v_existing_player_id;
  end if;

  update public.players
  set user_id = p_user_id, claimed_at = pg_catalog.now(), is_guest = false
  where id = p_player_id;
end;
$$;

revoke execute on function public.assign_guest_player(uuid, uuid) from public;
grant execute on function public.assign_guest_player(uuid, uuid) to authenticated;

-- ### public.update_my_player(...) — the caller edits their own player row in a group.
create or replace function public.update_my_player(
  p_group_id uuid,
  p_display_name text,
  p_primary_position text default null,
  p_alt_positions text[] default '{}'::text[],
  p_preferred_foot public.preferred_foot default null,
  p_height_cm int default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_player_id uuid;
begin
  select p.id into v_player_id from public.players p where p.group_id = p_group_id and p.user_id = v_uid;
  if v_player_id is null then
    raise exception 'PICADO_NOT_MEMBER: you do not have a player in this group';
  end if;

  perform private.apply_player_update(v_player_id, p_display_name, p_primary_position, p_alt_positions, p_preferred_foot, p_height_cm);
end;
$$;

revoke execute on function public.update_my_player(uuid, text, text, text[], public.preferred_foot, int) from public;
grant execute on function public.update_my_player(uuid, text, text, text[], public.preferred_foot, int) to authenticated;

-- ### public.update_player(...) — admin edits a guest's (or any player's) row.
create or replace function public.update_player(
  p_player_id uuid,
  p_display_name text,
  p_primary_position text default null,
  p_alt_positions text[] default '{}'::text[],
  p_preferred_foot public.preferred_foot default null,
  p_height_cm int default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  select p.group_id into v_group_id from public.players p where p.id = p_player_id;
  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: player not found';
  end if;
  if not private.is_group_admin(v_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can edit other players';
  end if;

  perform private.apply_player_update(p_player_id, p_display_name, p_primary_position, p_alt_positions, p_preferred_foot, p_height_cm);
end;
$$;

revoke execute on function public.update_player(uuid, text, text, text[], public.preferred_foot, int) from public;
grant execute on function public.update_player(uuid, text, text, text[], public.preferred_foot, int) to authenticated;
