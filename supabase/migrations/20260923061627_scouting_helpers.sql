-- SECURITY DEFINER / immutable helpers for scouting votes. Kept in `private` (not exposed by
-- the Data API). None of these are used directly by an RLS policy in this migration set, only
-- from inside other SECURITY DEFINER function bodies, so (matching private.slugify /
-- private.apply_player_update) they are revoked from public and NOT granted to authenticated.

-- Fixed list of ~25 FC-style playstyle codes (English snake_case) plus 5 GK-only ones.
create or replace function private.playstyle_codes()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'finesse_shot', 'power_shot', 'dead_ball', 'chip_shot', 'incisive_pass', 'pinged_pass',
    'long_ball_pass', 'tiki_taka', 'whipped_pass', 'first_touch', 'rapid', 'flair',
    'press_proven', 'technical', 'trickster', 'intercept', 'anticipate', 'block', 'bruiser',
    'jockey', 'slide_tackle', 'aerial', 'relentless', 'quick_step', 'acrobatic',
    'far_reach', 'footwork', 'cross_claimer', 'rush_out', 'deflector'
  ]::text[];
$$;

revoke execute on function private.playstyle_codes() from public;

alter table public.playstyle_votes
  add constraint playstyle_votes_playstyle_valid check (playstyle = any (private.playstyle_codes()));

-- Shared eligibility check for submit_scouting_votes / submit_playstyle_votes / submit_star_votes:
-- validates the caller has an active, non-spectator player in the target's group, is not
-- self-voting, the target hasn't left, and (if the group requires it) they share a match.
-- Raises PICADO_<CODE>: on failure; returns the caller's player_id and the group_id on success.
create or replace function private.check_scouting_eligibility(p_target_player_id uuid)
returns table (rater_player_id uuid, group_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_group_id uuid;
  v_target_left timestamptz;
  v_rater_id uuid;
  v_rater_role public.group_role;
  v_settings jsonb;
  v_require_shared boolean;
begin
  select p.group_id, p.left_at into v_group_id, v_target_left
  from public.players p
  where p.id = p_target_player_id;

  if v_group_id is null then
    raise exception 'PICADO_VALIDATION: target player not found';
  end if;
  if v_target_left is not null then
    raise exception 'PICADO_TARGET_LEFT: target player has left the group';
  end if;

  select p.id into v_rater_id
  from public.players p
  where p.group_id = v_group_id and p.user_id = v_uid and p.left_at is null;

  if v_rater_id is null then
    raise exception 'PICADO_NOT_MEMBER: you do not have an active player in this group';
  end if;
  if v_rater_id = p_target_player_id then
    raise exception 'PICADO_SELF_VOTE: you cannot vote for yourself';
  end if;

  select gm.role into v_rater_role
  from public.group_members gm
  where gm.group_id = v_group_id and gm.user_id = v_uid;

  if v_rater_role is null or v_rater_role = 'spectator' then
    raise exception 'PICADO_SPECTATOR: spectators cannot cast scouting votes';
  end if;

  select g.settings into v_settings from public.groups g where g.id = v_group_id;
  v_require_shared := coalesce((v_settings -> 'scouting' ->> 'require_shared_match')::boolean, true);

  if v_require_shared and not private.shared_match(v_rater_id, p_target_player_id) then
    raise exception 'PICADO_NO_SHARED_MATCH: you need to share a match with this player first';
  end if;

  return query select v_rater_id, v_group_id;
end;
$$;

revoke execute on function private.check_scouting_eligibility(uuid) from public;
