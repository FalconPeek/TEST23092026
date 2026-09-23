-- Public RPCs for tournament/entry/registration administration. Every function is SECURITY
-- DEFINER, search_path pinned to '', fully-qualified names, revoked from public/anon, granted to
-- authenticated only. Errors are raised with a stable `PICADO_<CODE>: ` prefix that Server Actions
-- map to Spanish messages.

-- ### public.create_tournament(...) returns uuid — group admin only.
-- p_settings is stored as given; the Server Action validates it against
-- lib/settings/tournament.ts's zod schema before calling this.
create or replace function public.create_tournament(
  p_group_id uuid,
  p_name text,
  p_format public.tournament_format,
  p_team_size int,
  p_entry_mode public.tournament_entry_mode default 'teams',
  p_settings jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := trim(p_name);
  v_id uuid;
begin
  if not private.is_group_admin(p_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can create a tournament';
  end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'PICADO_VALIDATION: tournament name must be between 1 and 60 characters';
  end if;
  if p_team_size is null or p_team_size < 3 or p_team_size > 11 then
    raise exception 'PICADO_VALIDATION: team_size must be between 3 and 11';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'PICADO_VALIDATION: settings must be a json object';
  end if;

  insert into public.tournaments (group_id, name, format, entry_mode, team_size, settings, organizer_id)
  values (p_group_id, v_name, p_format, p_entry_mode, p_team_size, p_settings, v_uid)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_tournament(
  uuid, text, public.tournament_format, int, public.tournament_entry_mode, jsonb
) from public;
grant execute on function public.create_tournament(
  uuid, text, public.tournament_format, int, public.tournament_entry_mode, jsonb
) to authenticated;

-- ### public.update_tournament(p_tournament_id, p_name, p_settings) — admin only, draft/registration only.
create or replace function public.update_tournament(p_tournament_id uuid, p_name text, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_status public.tournament_status;
  v_name text := trim(p_name);
begin
  select t.group_id, t.status into v_group_id, v_status from public.tournaments t where t.id = p_tournament_id;
  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: tournament not found';
  end if;
  if not private.is_group_admin(v_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can update the tournament';
  end if;
  if v_status not in ('draft', 'registration') then
    raise exception 'PICADO_VALIDATION: the tournament can only be edited while in draft or registration';
  end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'PICADO_VALIDATION: tournament name must be between 1 and 60 characters';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'PICADO_VALIDATION: settings must be a json object';
  end if;

  update public.tournaments set name = v_name, settings = p_settings where id = p_tournament_id;
end;
$$;

revoke execute on function public.update_tournament(uuid, text, jsonb) from public;
grant execute on function public.update_tournament(uuid, text, jsonb) to authenticated;

-- ### public.set_tournament_status(p_tournament_id, p_status) — admin only.
-- registration -> in_progress happens atomically inside persist_bracket instead (bracket
-- generation and the status flip must not be observable separately), so it's not a valid
-- transition here. in_progress -> finished is for the organizer to close out the event once every
-- match is done (not enforced here -- the UI/Server Action is expected to check standings first).
create or replace function public.set_tournament_status(p_tournament_id uuid, p_status public.tournament_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_status public.tournament_status;
begin
  select t.group_id, t.status into v_group_id, v_status from public.tournaments t where t.id = p_tournament_id;
  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: tournament not found';
  end if;
  if not private.is_group_admin(v_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can change the tournament status';
  end if;

  if not (
    (v_status = 'draft' and p_status = 'registration')
    or (v_status = 'registration' and p_status = 'draft')
    or (v_status = 'in_progress' and p_status = 'finished')
  ) then
    raise exception 'PICADO_VALIDATION: cannot transition tournament from % to %', v_status, p_status;
  end if;

  update public.tournaments set status = p_status where id = p_tournament_id;
end;
$$;

revoke execute on function public.set_tournament_status(uuid, public.tournament_status) from public;
grant execute on function public.set_tournament_status(uuid, public.tournament_status) to authenticated;

-- ### public.register_for_tournament(p_tournament_id) — individual-entry tournaments only.
-- Members with role member/admin/owner (not spectator), only while registration is open.
create or replace function public.register_for_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_group_id uuid;
  v_status public.tournament_status;
  v_entry_mode public.tournament_entry_mode;
  v_role public.group_role;
  v_player_id uuid;
begin
  select t.group_id, t.status, t.entry_mode into v_group_id, v_status, v_entry_mode
  from public.tournaments t where t.id = p_tournament_id;
  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: tournament not found';
  end if;
  if v_entry_mode <> 'individual' then
    raise exception 'PICADO_VALIDATION: only individual-entry tournaments accept direct registration';
  end if;
  if v_status <> 'registration' then
    raise exception 'PICADO_VALIDATION: registration is only open while the tournament is in the registration status';
  end if;

  select gm.role into v_role from public.group_members gm where gm.group_id = v_group_id and gm.user_id = v_uid;
  if v_role is null then
    raise exception 'PICADO_NOT_MEMBER: you are not a member of this group';
  end if;
  if v_role = 'spectator' then
    raise exception 'PICADO_FORBIDDEN: spectators cannot register for a tournament';
  end if;

  select p.id into v_player_id from public.players p where p.group_id = v_group_id and p.user_id = v_uid;
  if v_player_id is null then
    raise exception 'PICADO_VALIDATION: you do not have a player in this group';
  end if;

  insert into public.tournament_registrations (tournament_id, player_id)
  values (p_tournament_id, v_player_id)
  on conflict (tournament_id, player_id) do nothing;
end;
$$;

revoke execute on function public.register_for_tournament(uuid) from public;
grant execute on function public.register_for_tournament(uuid) to authenticated;

-- ### public.unregister_from_tournament(p_tournament_id) — the caller withdraws their own registration.
create or replace function public.unregister_from_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_group_id uuid;
  v_status public.tournament_status;
  v_player_id uuid;
begin
  select t.group_id, t.status into v_group_id, v_status from public.tournaments t where t.id = p_tournament_id;
  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: tournament not found';
  end if;
  if v_status <> 'registration' then
    raise exception 'PICADO_VALIDATION: you can only unregister while the tournament is in the registration status';
  end if;

  select p.id into v_player_id from public.players p where p.group_id = v_group_id and p.user_id = v_uid;
  if v_player_id is null then
    raise exception 'PICADO_NOT_MEMBER: you do not have a player in this group';
  end if;

  delete from public.tournament_registrations where tournament_id = p_tournament_id and player_id = v_player_id;
end;
$$;

revoke execute on function public.unregister_from_tournament(uuid) from public;
grant execute on function public.unregister_from_tournament(uuid) to authenticated;

-- ### public.save_tournament_entries(p_tournament_id, p_entries) — admin only, draft/registration only.
-- Replaces the whole entry list atomically (previous entries are deleted first), mirroring
-- set_match_lineup's replace-the-whole-lineup approach. p_entries shape:
-- [{ "name": text, "seed": int|null, "player_ids": uuid[] }, ...]. Every player must belong to
-- this group, not have left it, and appear in at most one entry.
create or replace function public.save_tournament_entries(p_tournament_id uuid, p_entries jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_status public.tournament_status;
  v_elem jsonb;
  v_name text;
  v_seed int;
  v_player_ids uuid[];
  v_all_ids uuid[];
  v_pid uuid;
  v_row_group_id uuid;
  v_left_at timestamptz;
begin
  select t.group_id, t.status into v_group_id, v_status from public.tournaments t where t.id = p_tournament_id;
  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: tournament not found';
  end if;
  if not private.is_group_admin(v_group_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can set tournament entries';
  end if;
  if v_status not in ('draft', 'registration') then
    raise exception 'PICADO_VALIDATION: entries can only be edited while the tournament is in draft or registration';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'PICADO_VALIDATION: entries must be a json array';
  end if;
  if jsonb_array_length(p_entries) = 0 then
    raise exception 'PICADO_VALIDATION: at least one entry is required';
  end if;

  select array_agg(pid) into v_all_ids
  from (
    select (elem)::uuid as pid
    from jsonb_array_elements(p_entries) e,
         jsonb_array_elements_text(coalesce(e -> 'player_ids', '[]'::jsonb)) elem
  ) ids;

  if v_all_ids is not null then
    if array_length(v_all_ids, 1) <> (select count(distinct x) from unnest(v_all_ids) x) then
      raise exception 'PICADO_VALIDATION: a player cannot appear in more than one entry';
    end if;

    foreach v_pid in array v_all_ids
    loop
      select p.group_id, p.left_at into v_row_group_id, v_left_at from public.players p where p.id = v_pid;
      if v_row_group_id is null or v_row_group_id <> v_group_id then
        raise exception 'PICADO_VALIDATION: entry player does not belong to this group';
      end if;
      if v_left_at is not null then
        raise exception 'PICADO_VALIDATION: entry player has left the group';
      end if;
    end loop;
  end if;

  delete from public.tournament_entries where tournament_id = p_tournament_id;

  for v_elem in select * from jsonb_array_elements(p_entries)
  loop
    v_name := trim(v_elem ->> 'name');
    v_seed := nullif(v_elem ->> 'seed', '')::int;
    if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 60 then
      raise exception 'PICADO_VALIDATION: each entry needs a name between 1 and 60 characters';
    end if;

    select array_agg((x)::uuid) into v_player_ids
    from jsonb_array_elements_text(coalesce(v_elem -> 'player_ids', '[]'::jsonb)) x;

    insert into public.tournament_entries (tournament_id, name, seed, player_ids)
    values (p_tournament_id, v_name, v_seed, coalesce(v_player_ids, '{}'::uuid[]));
  end loop;
end;
$$;

revoke execute on function public.save_tournament_entries(uuid, jsonb) from public;
grant execute on function public.save_tournament_entries(uuid, jsonb) to authenticated;
