-- Every group member gets a players row, regardless of role -- spectators need a player
-- identity too: they appear in match_participants as spectators and rate players via
-- match_ratings.rater_player_id (added in a later migration). Role enforcement is unaffected
-- and stays where it already lives: spectator-role members still can't be team players
-- (set_match_lineup) and still can't scout (PICADO_SPECTATOR in
-- private.check_scouting_eligibility). public.claim_guest_player already rejects spectator-role
-- callers via its existing "role not in ('owner','admin','member')" check, so it needs no change
-- here -- spectators must not take over a guest's playing identity.

-- ### public.accept_invite(p_code text) returns uuid (group_id)
-- Same as the original (20260923055124_group_rpcs.sql) except the player row is now created
-- unconditionally, not just for non-spectator roles.
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

  insert into public.players (group_id, user_id, display_name, is_guest, created_by)
  select v_invite.group_id, v_uid, coalesce(pr.display_name, 'Jugador'), false, v_uid
  from public.profiles pr
  where pr.id = v_uid;

  return v_invite.group_id;
end;
$$;

revoke execute on function public.accept_invite(text) from public;
grant execute on function public.accept_invite(text) to authenticated;

-- ### public.set_member_role(p_group_id, p_user_id, p_role)
-- Same as the original except the "ensure a player row exists" step now runs for every role
-- change (member OR spectator), not just when moving to member.
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

  if not exists (
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

-- Backfill: any existing group_members row (of any role) without a matching players row gets
-- one created now, attributed to the group's owner.
insert into public.players (group_id, user_id, display_name, is_guest, created_by)
select gm.group_id, gm.user_id, coalesce(pr.display_name, 'Jugador'), false, g.owner_id
from public.group_members gm
join public.groups g on g.id = gm.group_id
join public.profiles pr on pr.id = gm.user_id
where not exists (
  select 1 from public.players p where p.group_id = gm.group_id and p.user_id = gm.user_id
);
