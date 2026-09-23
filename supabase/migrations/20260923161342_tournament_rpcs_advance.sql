-- Public RPCs for advancing a generated bracket: recording/editing results (propagation happens in
-- one transaction via private.tm_apply_result / private.tm_set_slot, see
-- 20260923161330_tournament_helpers.sql), appending a swiss round, and seeding a knockout stage
-- from finished group standings. Every function is SECURITY DEFINER, search_path pinned to '',
-- fully-qualified names, revoked from public/anon. confirm_match_result / edit_match_result /
-- append_swiss_round / seed_knockout_from_groups are also granted to service_role: the finalizer
-- (lib/actions/finalize.ts, admin client) calls confirm_match_result once a tournament match's
-- linked real match is finalized, and may need to progress swiss/groups_ko off the back of that.

-- ### public.confirm_match_result(...) — admin (or service_role) only.
-- p_winner_entry_id is only required for a tied knockout match decided 'manual'/'walkover' (see
-- private.tm_apply_result / lib/brackets/engine.ts resolveWinner).
create or replace function public.confirm_match_result(
  p_tournament_match_id uuid,
  p_score1 int,
  p_score2 int,
  p_pens1 int default null,
  p_pens2 int default null,
  p_decided_by public.tournament_decided_by default null,
  p_winner_entry_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament_id uuid;
  v_group_id uuid;
begin
  select tm.tournament_id into v_tournament_id from public.tournament_matches tm where tm.id = p_tournament_match_id;
  if v_tournament_id is null then
    raise exception 'PICADO_VALIDATION: tournament match not found';
  end if;
  select t.group_id into v_group_id from public.tournaments t where t.id = v_tournament_id;
  if not (private.is_group_admin(v_group_id) or private.is_service_role()) then
    raise exception 'PICADO_FORBIDDEN: only group admins can confirm a tournament match result';
  end if;

  perform private.tm_apply_result(p_tournament_match_id, p_score1, p_score2, p_pens1, p_pens2, p_decided_by, p_winner_entry_id);
end;
$$;

revoke execute on function public.confirm_match_result(
  uuid, int, int, int, int, public.tournament_decided_by, uuid
) from public;
grant execute on function public.confirm_match_result(
  uuid, int, int, int, int, public.tournament_decided_by, uuid
) to authenticated, service_role;

-- ### public.edit_match_result(...) — admin (or service_role) only.
-- Only for a completed match none of whose direct downstream matches (winner/loser destination,
-- or a double-elim GF2) has started -- mirrors lib/brackets/engine.ts canEditResult/editResult:
-- resets the match and the single downstream slot it fed, then re-applies the new result.
create or replace function public.edit_match_result(
  p_tournament_match_id uuid,
  p_score1 int,
  p_score2 int,
  p_pens1 int default null,
  p_pens2 int default null,
  p_decided_by public.tournament_decided_by default null,
  p_winner_entry_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament_id uuid;
  v_group_id uuid;
  v_stage_id uuid;
  v_bracket public.tournament_bracket;
  v_round int;
  v_format public.tournament_format;
  v_next_match_id uuid;
  v_next_slot smallint;
  v_next_loser_match_id uuid;
  v_next_loser_slot smallint;
  v_gf2_id uuid;
begin
  select tm.tournament_id, tm.stage_id, tm.bracket, tm.round,
         tm.next_match_id, tm.next_slot, tm.next_loser_match_id, tm.next_loser_slot
  into v_tournament_id, v_stage_id, v_bracket, v_round,
       v_next_match_id, v_next_slot, v_next_loser_match_id, v_next_loser_slot
  from public.tournament_matches tm
  where tm.id = p_tournament_match_id
  for update;

  if v_tournament_id is null then
    raise exception 'PICADO_VALIDATION: tournament match not found';
  end if;

  select t.group_id, t.format into v_group_id, v_format from public.tournaments t where t.id = v_tournament_id;
  if not (private.is_group_admin(v_group_id) or private.is_service_role()) then
    raise exception 'PICADO_FORBIDDEN: only group admins can edit a tournament match result';
  end if;
  if not private.tm_can_edit(p_tournament_match_id) then
    raise exception 'PICADO_NOT_EDITABLE: this match result can no longer be edited';
  end if;

  update public.tournament_matches
  set score1 = null, score2 = null, pens1 = null, pens2 = null, decided_by = null,
      winner_entry_id = null, loser_entry_id = null, status = 'ready'
  where id = p_tournament_match_id;

  perform private.tm_set_slot(v_next_match_id, v_next_slot, null);
  perform private.tm_set_slot(v_next_loser_match_id, v_next_loser_slot, null);

  if v_format = 'double_elim' and v_bracket = 'final' and v_round = 1 then
    select id into v_gf2_id
    from public.tournament_matches
    where tournament_id = v_tournament_id and stage_id = v_stage_id and bracket = 'final' and round = 2;
    if v_gf2_id is not null then
      update public.tournament_matches
      set entry1_id = null, entry2_id = null, status = 'locked',
          score1 = null, score2 = null, pens1 = null, pens2 = null, decided_by = null,
          winner_entry_id = null, loser_entry_id = null
      where id = v_gf2_id;
    end if;
  end if;

  perform private.tm_apply_result(p_tournament_match_id, p_score1, p_score2, p_pens1, p_pens2, p_decided_by, p_winner_entry_id);
end;
$$;

revoke execute on function public.edit_match_result(
  uuid, int, int, int, int, public.tournament_decided_by, uuid
) from public;
grant execute on function public.edit_match_result(
  uuid, int, int, int, int, public.tournament_decided_by, uuid
) to authenticated, service_role;

-- ### public.append_swiss_round(p_tournament_id, p_stage_engine_key, p_matches) — admin (or service_role) only.
-- p_matches is Match[] (lib/brackets/types.ts shape, same camelCase keys as persist_bracket) for
-- exactly the new round produced by the pure `nextSwissRound`. Swiss matches never carry
-- next_match_id/next_loser_match_id (pairing is recomputed fresh each round from standings), so
-- unlike persist_bracket this is a single pass, and a bye match arrives already `completed` with
-- decided_by='bye' and winner_entry_id set (see lib/brackets/swiss.ts buildRoundMatches).
create or replace function public.append_swiss_round(p_tournament_id uuid, p_stage_engine_key text, p_matches jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage_id uuid;
  v_match jsonb;
begin
  if not private.can_manage_tournament(p_tournament_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can append a swiss round';
  end if;

  select id into v_stage_id from public.stages where tournament_id = p_tournament_id and engine_key = p_stage_engine_key;
  if v_stage_id is null then
    raise exception 'PICADO_VALIDATION: stage not found';
  end if;

  if p_matches is null or jsonb_typeof(p_matches) <> 'array' or jsonb_array_length(p_matches) = 0 then
    raise exception 'PICADO_VALIDATION: matches must be a non-empty json array';
  end if;

  for v_match in select * from jsonb_array_elements(p_matches)
  loop
    if exists (
      select 1 from public.tournament_matches where tournament_id = p_tournament_id and engine_key = (v_match ->> 'id')
    ) then
      raise exception 'PICADO_ALREADY_GENERATED: match % already exists', v_match ->> 'id';
    end if;
    perform private.tm_insert_match(p_tournament_id, v_stage_id, null, v_match);
  end loop;
end;
$$;

revoke execute on function public.append_swiss_round(uuid, text, jsonb) from public;
grant execute on function public.append_swiss_round(uuid, text, jsonb) to authenticated, service_role;

-- ### public.seed_knockout_from_groups(p_tournament_id, p_qualifiers) — admin (or service_role) only.
-- p_qualifiers: [{ "group": text, "entries": (uuid|null)[] }, ...] -- `entries` ranked best (index
-- 0) to worst for that group label, as produced by lib/brackets `standings()` fed with that
-- group's completed matches (a null entry means a vacant qualifier slot, i.e. BYE). Resolves every
-- knockout placeholder whose entry1From/entry2From matches {fromGroup, rank} via
-- private.tm_set_slot, which cascades any resulting BYE exactly like a human result would. Safe to
-- call once per group as soon as that group's matches are all completed (matches nextSwissRound's
-- pattern: the TS server decides *when*, this RPC just persists the resolution).
create or replace function public.seed_knockout_from_groups(p_tournament_id uuid, p_qualifiers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.tournament_status;
  v_item jsonb;
  v_group_label text;
  v_entries jsonb;
  v_entry_elem jsonb;
  v_rank int;
  v_entry_id text;
  v_match record;
begin
  select t.status into v_status from public.tournaments t where t.id = p_tournament_id;
  if v_status is null then
    raise exception 'PICADO_VALIDATION: tournament not found';
  end if;
  if not private.can_manage_tournament(p_tournament_id) then
    raise exception 'PICADO_FORBIDDEN: only group admins can seed the knockout stage';
  end if;
  if v_status <> 'in_progress' then
    raise exception 'PICADO_VALIDATION: the tournament must be in progress to seed the knockout stage';
  end if;
  if p_qualifiers is null or jsonb_typeof(p_qualifiers) <> 'array' then
    raise exception 'PICADO_VALIDATION: qualifiers must be a json array';
  end if;

  for v_item in select * from jsonb_array_elements(p_qualifiers)
  loop
    v_group_label := v_item ->> 'group';
    v_entries := v_item -> 'entries';
    if v_group_label is null or jsonb_typeof(coalesce(v_entries, 'null'::jsonb)) <> 'array' then
      raise exception 'PICADO_VALIDATION: each qualifier entry needs a group and an entries array';
    end if;

    v_rank := 0;
    for v_entry_elem in select * from jsonb_array_elements(v_entries)
    loop
      v_rank := v_rank + 1;
      v_entry_id := case when jsonb_typeof(v_entry_elem) = 'null' then '__bye__' else trim(both '"' from v_entry_elem::text) end;

      for v_match in
        select id, entry1_from, entry2_from
        from public.tournament_matches
        where tournament_id = p_tournament_id
          and (
            (entry1_from ->> 'fromGroup' = v_group_label and (entry1_from ->> 'rank')::int = v_rank)
            or (entry2_from ->> 'fromGroup' = v_group_label and (entry2_from ->> 'rank')::int = v_rank)
          )
      loop
        if v_match.entry1_from is not null
          and v_match.entry1_from ->> 'fromGroup' = v_group_label
          and (v_match.entry1_from ->> 'rank')::int = v_rank then
          perform private.tm_set_slot(v_match.id, 1::smallint, v_entry_id);
        end if;
        if v_match.entry2_from is not null
          and v_match.entry2_from ->> 'fromGroup' = v_group_label
          and (v_match.entry2_from ->> 'rank')::int = v_rank then
          perform private.tm_set_slot(v_match.id, 2::smallint, v_entry_id);
        end if;
      end loop;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.seed_knockout_from_groups(uuid, jsonb) from public;
grant execute on function public.seed_knockout_from_groups(uuid, jsonb) to authenticated, service_role;
