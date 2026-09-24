-- M7: a tournament entry can be a club (tournament_entries.club_id): optional "club_id" per entry
-- in p_entries, which must be a club of the tournament's group. Otherwise unchanged.
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
  v_club_id uuid;
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
    v_club_id := nullif(v_elem ->> 'club_id', '')::uuid;
    if v_club_id is not null and not exists (
      select 1 from public.clubs c where c.id = v_club_id and c.group_id = v_group_id
    ) then
      raise exception 'PICADO_VALIDATION: entry club does not belong to this group';
    end if;
    if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 60 then
      raise exception 'PICADO_VALIDATION: each entry needs a name between 1 and 60 characters';
    end if;

    select array_agg((x)::uuid) into v_player_ids
    from jsonb_array_elements_text(coalesce(v_elem -> 'player_ids', '[]'::jsonb)) x;

    insert into public.tournament_entries (tournament_id, name, seed, player_ids, club_id)
    values (p_tournament_id, v_name, v_seed, coalesce(v_player_ids, '{}'::uuid[]), v_club_id);
  end loop;
end;
$$;

revoke execute on function public.save_tournament_entries(uuid, jsonb) from public, anon;
grant execute on function public.save_tournament_entries(uuid, jsonb) to authenticated;
