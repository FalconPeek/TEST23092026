-- Public RPC for match ratings. SECURITY DEFINER, search_path pinned to '', fully-qualified
-- names, revoked from public/anon, granted to authenticated only. Errors use a stable
-- `PICADO_<CODE>: ` prefix that Server Actions map to Spanish messages.

-- ### public.submit_match_ratings(p_match_id, p_ratings)
-- p_ratings = [{ "target_player_id": uuid, "rating": 1..10, "standout_attributes": text[]|null },
-- ...]. Caller must be a participant (player or spectator) of the match; spectators can only
-- rate when the group setting spectators_can_rate is true (default true). Every target must be a
-- team player (role = 'player') of this match; no self-rating. Allowed while the match is
-- reporting, pending_finalize or disputed (rating stays open a bit past the report window closing
-- and even while the score is contested) and before rating_deadline. Upsert: editable until the
-- deadline.
create or replace function public.submit_match_ratings(p_match_id uuid, p_ratings jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec record;
  v_group_id uuid;
  v_status public.match_status;
  v_deadline timestamptz;
  v_settings jsonb;
  v_spectators_can_rate boolean;
  v_elem jsonb;
  v_target uuid;
  v_rating int;
  v_standout text[];
  v_seen uuid[] := '{}'::uuid[];
  v_has_ratings boolean := false;
begin
  select * into v_rec from private.my_match_participant(p_match_id);
  if v_rec.player_id is null then
    raise exception 'PICADO_NOT_PARTICIPANT: you are not a participant of this match';
  end if;

  v_group_id := v_rec.group_id;

  if v_rec.role = 'spectator' then
    select g.settings into v_settings from public.groups g where g.id = v_group_id;
    v_spectators_can_rate := coalesce((v_settings ->> 'spectators_can_rate')::boolean, true);
    if not v_spectators_can_rate then
      raise exception 'PICADO_SPECTATOR: spectators cannot rate in this group';
    end if;
  end if;

  select m.status, m.rating_deadline into v_status, v_deadline
  from public.matches m
  where m.id = p_match_id;

  if v_status not in ('reporting', 'pending_finalize', 'disputed') then
    raise exception 'PICADO_VALIDATION: the match is not open for ratings';
  end if;
  if v_deadline is not null and pg_catalog.now() > v_deadline then
    raise exception 'PICADO_DEADLINE_PASSED: the rating window has closed';
  end if;
  if p_ratings is null or jsonb_typeof(p_ratings) <> 'array' then
    raise exception 'PICADO_VALIDATION: ratings must be a json array';
  end if;

  for v_elem in select * from jsonb_array_elements(p_ratings)
  loop
    v_has_ratings := true;
    v_target := nullif(v_elem ->> 'target_player_id', '')::uuid;
    if v_target is null then
      raise exception 'PICADO_VALIDATION: target_player_id is required for every rating';
    end if;
    if v_target = any (v_seen) then
      raise exception 'PICADO_VALIDATION: target_player_id % appears more than once in this batch', v_target;
    end if;
    v_seen := v_seen || v_target;

    if v_target = v_rec.player_id then
      raise exception 'PICADO_SELF_VOTE: you cannot rate yourself';
    end if;
    if not private.is_match_team_player(p_match_id, v_target) then
      raise exception 'PICADO_VALIDATION: target is not a team player of this match';
    end if;

    if jsonb_typeof(coalesce(v_elem -> 'rating', 'null'::jsonb)) <> 'number' then
      raise exception 'PICADO_VALIDATION: rating is required and must be a number';
    end if;
    v_rating := round((v_elem -> 'rating' #>> '{}')::numeric);
    if v_rating < 1 or v_rating > 10 then
      raise exception 'PICADO_VALIDATION: rating must be between 1 and 10';
    end if;

    if jsonb_typeof(coalesce(v_elem -> 'standout_attributes', 'null'::jsonb)) = 'array' then
      select array_agg(x) into v_standout from jsonb_array_elements_text(v_elem -> 'standout_attributes') x;
    else
      v_standout := null;
    end if;
    v_standout := coalesce(v_standout, '{}'::text[]);

    if array_length(v_standout, 1) is not null and array_length(v_standout, 1) > 2 then
      raise exception 'PICADO_VALIDATION: at most 2 standout attributes can be tagged';
    end if;
    if not (v_standout <@ private.sub_attribute_keys()) then
      raise exception 'PICADO_VALIDATION: standout_attributes contains an invalid attribute key';
    end if;

    insert into public.match_ratings (match_id, rater_player_id, target_player_id, rating, standout_attributes, rater_role)
    values (p_match_id, v_rec.player_id, v_target, v_rating, v_standout, v_rec.role)
    on conflict (match_id, rater_player_id, target_player_id)
    do update set
      rating = excluded.rating,
      standout_attributes = excluded.standout_attributes,
      rater_role = excluded.rater_role,
      updated_at = pg_catalog.now();
  end loop;

  if not v_has_ratings then
    raise exception 'PICADO_VALIDATION: at least one rating is required';
  end if;
end;
$$;

revoke execute on function public.submit_match_ratings(uuid, jsonb) from public;
grant execute on function public.submit_match_ratings(uuid, jsonb) to authenticated;
