-- SECURITY DEFINER helpers for tournaments. private.tm_* helpers are not called from any RLS
-- policy, only from inside other SECURITY DEFINER function bodies (nested calls execute as the
-- function owner, same reasoning as private.shared_match / private.apply_player_update), so they
-- are revoked from public and NOT granted to authenticated.

-- True if the caller's session role is service_role -- i.e. the admin client (finalizer / cron),
-- not a logged-in user. Reads the `role` GUC (what PostgREST's `SET LOCAL ROLE` -- and the pgTAP
-- helper tests.authenticate_as_service_role -- actually set), which is untouched by a SECURITY
-- DEFINER function's owner-identity switch, same as how auth.uid() keeps working inside one.
create or replace function private.is_service_role()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select pg_catalog.current_setting('role', true) = 'service_role';
$$;

revoke execute on function private.is_service_role() from public;

-- True if the caller is a group admin/owner of the tournament's group, or the service role.
create or replace function private.can_manage_tournament(p_tournament_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select private.is_service_role() or exists (
    select 1 from public.tournaments t
    where t.id = p_tournament_id
      and private.is_group_admin(t.group_id)
  );
$$;

revoke execute on function private.can_manage_tournament(uuid) from public;

-- Inserts one tournament_matches row from an engine Match jsonb object (lib/brackets/types.ts
-- shape, camelCase keys), validating that any non-BYE entry slot references a real entry of this
-- tournament. Shared by persist_bracket (pass 1, next_* links resolved in pass 2) and
-- append_swiss_round (which never sets next_* at all). Returns the new row's id.
create or replace function private.tm_insert_match(
  p_tournament_id uuid,
  p_stage_id uuid,
  p_stage_group_id uuid,
  p_match jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_entry1 text := p_match ->> 'entry1Id';
  v_entry2 text := p_match ->> 'entry2Id';
begin
  if v_entry1 is not null and v_entry1 <> '__bye__'
    and not exists (
      select 1 from public.tournament_entries te where te.id::text = v_entry1 and te.tournament_id = p_tournament_id
    ) then
    raise exception 'PICADO_VALIDATION: entry1Id % does not reference a tournament entry of this tournament', v_entry1;
  end if;
  if v_entry2 is not null and v_entry2 <> '__bye__'
    and not exists (
      select 1 from public.tournament_entries te where te.id::text = v_entry2 and te.tournament_id = p_tournament_id
    ) then
    raise exception 'PICADO_VALIDATION: entry2Id % does not reference a tournament entry of this tournament', v_entry2;
  end if;

  insert into public.tournament_matches (
    tournament_id, stage_id, stage_group_id, bracket, round, number,
    entry1_id, entry2_id, entry1_from, entry2_from, status,
    winner_entry_id, loser_entry_id, score1, score2, pens1, pens2, decided_by, engine_key
  )
  values (
    p_tournament_id, p_stage_id, p_stage_group_id,
    (p_match ->> 'bracket')::public.tournament_bracket,
    (p_match ->> 'round')::int,
    (p_match ->> 'number')::int,
    v_entry1,
    v_entry2,
    p_match -> 'entry1From',
    p_match -> 'entry2From',
    (p_match ->> 'status')::public.tournament_match_status,
    nullif(p_match ->> 'winnerEntryId', '')::uuid,
    nullif(p_match ->> 'loserEntryId', '')::uuid,
    nullif(p_match ->> 'score1', '')::int,
    nullif(p_match ->> 'score2', '')::int,
    nullif(p_match ->> 'pens1', '')::int,
    nullif(p_match ->> 'pens2', '')::int,
    nullif(p_match ->> 'decidedBy', '')::public.tournament_decided_by,
    p_match ->> 'id'
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function private.tm_insert_match(uuid, uuid, uuid, jsonb) from public;

-- Mirrors lib/brackets/propagation.ts setSlot + tryAutoResolveBye + propagateResult: sets one slot
-- of a tournament match, recomputes its status, and if that makes it `ready` with a BYE on either
-- side, auto-completes it and recurses into whatever it feeds (winner destination and, for a
-- double-BYE, the loser destination too). No-op on a match that's already completed/archived, or a
-- non-existent/null target (mirrors setSlot's early returns).
create or replace function private.tm_set_slot(p_match_id uuid, p_slot smallint, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.tournament_match_status;
  v_e1 text;
  v_e2 text;
  v_next_match_id uuid;
  v_next_slot smallint;
  v_next_loser_match_id uuid;
  v_next_loser_slot smallint;
  v_winner text;
begin
  if p_match_id is null or p_slot is null then
    return;
  end if;

  select status, entry1_id, entry2_id, next_match_id, next_slot, next_loser_match_id, next_loser_slot
  into v_status, v_e1, v_e2, v_next_match_id, v_next_slot, v_next_loser_match_id, v_next_loser_slot
  from public.tournament_matches
  where id = p_match_id
  for update;

  if v_status is null or v_status in ('completed', 'archived') then
    return;
  end if;

  if p_slot = 1 then
    v_e1 := p_value;
  else
    v_e2 := p_value;
  end if;

  if v_e1 is not null and v_e2 is not null then
    v_status := 'ready';
  elsif v_e1 is not null or v_e2 is not null then
    v_status := 'waiting';
  else
    v_status := 'locked';
  end if;

  update public.tournament_matches
  set entry1_id = v_e1, entry2_id = v_e2, status = v_status
  where id = p_match_id;

  if v_status <> 'ready' or not (v_e1 = '__bye__' or v_e2 = '__bye__') then
    return; -- either not ready yet, or both slots real: needs a human result
  end if;

  update public.tournament_matches
  set status = 'completed', decided_by = 'bye', score1 = null, score2 = null, pens1 = null, pens2 = null
  where id = p_match_id;

  if v_e1 = '__bye__' and v_e2 = '__bye__' then
    update public.tournament_matches set winner_entry_id = null, loser_entry_id = null where id = p_match_id;
    perform private.tm_set_slot(v_next_match_id, v_next_slot, '__bye__');
    perform private.tm_set_slot(v_next_loser_match_id, v_next_loser_slot, '__bye__');
    return;
  end if;

  v_winner := case when v_e1 = '__bye__' then v_e2 else v_e1 end;
  update public.tournament_matches set winner_entry_id = v_winner::uuid, loser_entry_id = null where id = p_match_id;

  perform private.tm_set_slot(v_next_match_id, v_next_slot, v_winner);
  perform private.tm_set_slot(v_next_loser_match_id, v_next_loser_slot, '__bye__');
end;
$$;

revoke execute on function private.tm_set_slot(uuid, smallint, text) from public;

-- Mirrors engine.ts's handleGrandFinalTransition: double-elim only, and only when GF1 (bracket
-- 'final', round 1) just completed. Activates the reset match (GF2) if the LB-path entrant (slot 2
-- by construction) won, otherwise archives it (GF2 doesn't exist at all when grand_final_reset is
-- disabled -- persist_bracket simply never created it -- in which case this is a no-op).
create or replace function private.tm_handle_grand_final_transition(
  p_tournament_id uuid,
  p_format public.tournament_format,
  p_completed_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage_id uuid;
  v_bracket public.tournament_bracket;
  v_round int;
  v_entry1 text;
  v_entry2 text;
  v_winner uuid;
  v_gf2_id uuid;
begin
  if p_format <> 'double_elim' then
    return;
  end if;

  select stage_id, bracket, round, entry1_id, entry2_id, winner_entry_id
  into v_stage_id, v_bracket, v_round, v_entry1, v_entry2, v_winner
  from public.tournament_matches
  where id = p_completed_match_id;

  if v_bracket <> 'final' or v_round <> 1 then
    return;
  end if;

  select id into v_gf2_id
  from public.tournament_matches
  where tournament_id = p_tournament_id and stage_id = v_stage_id and bracket = 'final' and round = 2;

  if v_gf2_id is null then
    return;
  end if;

  if v_winner is not null and v_winner::text = v_entry2 then
    update public.tournament_matches
    set entry1_id = v_entry1, entry2_id = v_entry2, status = 'ready'
    where id = v_gf2_id;
  else
    update public.tournament_matches set status = 'archived' where id = v_gf2_id;
  end if;
end;
$$;

revoke execute on function private.tm_handle_grand_final_transition(uuid, public.tournament_format, uuid) from public;

-- Mirrors engine.ts's resolveWinner + the result-applying half of applyResult/editResult: validates
-- the match is ready/in_progress with two real entries, resolves winner/loser from the score (or
-- pens / manual+winner_entry_id for a tied knockout match), records the result, propagates it
-- (private.tm_set_slot) and runs the grand-final transition. Called by both confirm_match_result
-- (directly) and edit_match_result (after resetting the match back to `ready`).
create or replace function private.tm_apply_result(
  p_tournament_match_id uuid,
  p_score1 int,
  p_score2 int,
  p_pens1 int,
  p_pens2 int,
  p_decided_by public.tournament_decided_by,
  p_winner_entry_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament_id uuid;
  v_status public.tournament_match_status;
  v_bracket public.tournament_bracket;
  v_e1 text;
  v_e2 text;
  v_format public.tournament_format;
  v_is_ko boolean;
  v_tied boolean;
  v_winner text;
  v_loser text;
  v_decided public.tournament_decided_by;
  v_next_match_id uuid;
  v_next_slot smallint;
  v_next_loser_match_id uuid;
  v_next_loser_slot smallint;
begin
  select tm.tournament_id, tm.status, tm.bracket, tm.entry1_id, tm.entry2_id,
         tm.next_match_id, tm.next_slot, tm.next_loser_match_id, tm.next_loser_slot
  into v_tournament_id, v_status, v_bracket, v_e1, v_e2,
       v_next_match_id, v_next_slot, v_next_loser_match_id, v_next_loser_slot
  from public.tournament_matches tm
  where tm.id = p_tournament_match_id
  for update;

  if v_tournament_id is null then
    raise exception 'PICADO_VALIDATION: tournament match not found';
  end if;

  select t.format into v_format from public.tournaments t where t.id = v_tournament_id;

  if v_status not in ('ready', 'in_progress') then
    raise exception 'PICADO_VALIDATION: the match must be ready or in progress to confirm a result';
  end if;
  if v_e1 is null or v_e1 = '__bye__' or v_e2 is null or v_e2 = '__bye__' then
    raise exception 'PICADO_VALIDATION: a match involving a bye resolves automatically';
  end if;
  if p_score1 is null or p_score1 < 0 or p_score2 is null or p_score2 < 0 then
    raise exception 'PICADO_VALIDATION: score1 and score2 must be non-negative integers';
  end if;

  v_is_ko := v_bracket in ('winners', 'losers', 'final', 'third');
  v_tied := p_score1 = p_score2;

  if not v_tied then
    v_winner := case when p_score1 > p_score2 then v_e1 else v_e2 end;
    v_loser := case when v_winner = v_e1 then v_e2 else v_e1 end;
    v_decided := coalesce(p_decided_by, 'regular');
  elsif not v_is_ko then
    v_winner := null;
    v_loser := null;
    v_decided := coalesce(p_decided_by, 'regular');
  elsif p_decided_by in ('manual', 'walkover') then
    if p_winner_entry_id is null or p_winner_entry_id::text not in (v_e1, v_e2) then
      raise exception
        'PICADO_VALIDATION: decided_by % on a tied knockout match requires winner_entry_id to be one of the two entries',
        p_decided_by;
    end if;
    v_winner := p_winner_entry_id::text;
    v_loser := case when v_winner = v_e1 then v_e2 else v_e1 end;
    v_decided := p_decided_by;
  elsif p_pens1 is not null and p_pens2 is not null then
    if p_pens1 < 0 or p_pens2 < 0 then
      raise exception 'PICADO_VALIDATION: pens1 and pens2 must be non-negative integers';
    end if;
    if p_pens1 = p_pens2 then
      raise exception 'PICADO_VALIDATION: pens1 and pens2 cannot be equal; a penalty shootout must have a winner';
    end if;
    v_winner := case when p_pens1 > p_pens2 then v_e1 else v_e2 end;
    v_loser := case when v_winner = v_e1 then v_e2 else v_e1 end;
    v_decided := 'pens';
  else
    raise exception 'PICADO_KO_DRAW: a tied knockout match requires penalties or a manual/walkover decision';
  end if;

  update public.tournament_matches
  set score1 = p_score1,
      score2 = p_score2,
      pens1 = p_pens1,
      pens2 = p_pens2,
      decided_by = v_decided,
      winner_entry_id = v_winner::uuid,
      loser_entry_id = v_loser::uuid,
      status = 'completed'
  where id = p_tournament_match_id;

  if v_winner is not null then
    perform private.tm_set_slot(v_next_match_id, v_next_slot, v_winner);
  end if;
  if v_loser is not null then
    perform private.tm_set_slot(v_next_loser_match_id, v_next_loser_slot, v_loser);
  end if;

  perform private.tm_handle_grand_final_transition(v_tournament_id, v_format, p_tournament_match_id);
end;
$$;

revoke execute on function private.tm_apply_result(
  uuid, int, int, int, int, public.tournament_decided_by, uuid
) from public;

-- Mirrors engine.ts's canEditResult: the match must be completed, neither of its two direct
-- destinations (winner/loser) may have started, and for a double-elim GF1, GF2 must not have
-- started either.
create or replace function private.tm_can_edit(p_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_status public.tournament_match_status;
  v_tournament_id uuid;
  v_stage_id uuid;
  v_bracket public.tournament_bracket;
  v_round int;
  v_next_match_id uuid;
  v_next_loser_match_id uuid;
  v_format public.tournament_format;
  v_gf2_status public.tournament_match_status;
begin
  select tm.status, tm.tournament_id, tm.stage_id, tm.bracket, tm.round, tm.next_match_id, tm.next_loser_match_id
  into v_status, v_tournament_id, v_stage_id, v_bracket, v_round, v_next_match_id, v_next_loser_match_id
  from public.tournament_matches tm
  where tm.id = p_match_id;

  if v_status is null or v_status <> 'completed' then
    return false;
  end if;

  if v_next_match_id is not null and exists (
    select 1 from public.tournament_matches where id = v_next_match_id and status in ('in_progress', 'completed')
  ) then
    return false;
  end if;
  if v_next_loser_match_id is not null and exists (
    select 1 from public.tournament_matches where id = v_next_loser_match_id and status in ('in_progress', 'completed')
  ) then
    return false;
  end if;

  select t.format into v_format from public.tournaments t where t.id = v_tournament_id;
  if v_format = 'double_elim' and v_bracket = 'final' and v_round = 1 then
    select status into v_gf2_status
    from public.tournament_matches
    where tournament_id = v_tournament_id and stage_id = v_stage_id and bracket = 'final' and round = 2;
    if v_gf2_status in ('completed', 'in_progress') then
      return false;
    end if;
  end if;

  return true;
end;
$$;

revoke execute on function private.tm_can_edit(uuid) from public;
