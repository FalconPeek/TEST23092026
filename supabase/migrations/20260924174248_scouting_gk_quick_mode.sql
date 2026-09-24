-- Quick-mode scouting for goalkeepers: a keeper's card shows DIV/HAN/KIC/REF/POS (+SPD from PAC),
-- but quick votes only covered the 6 outfield face stats, so a keeper's gk_* attributes stayed at
-- the prior unless someone voted in detailed mode. For GK targets quick mode now also accepts
-- div/han/kic/ref/pos, each expanding 1:1 to its gk_* attribute (lib/rating/attributes.ts
-- quickVoteAttributes). The function body is unchanged apart from the quick-mode allowed keys.
alter table public.scouting_votes drop constraint scouting_votes_attribute_check;
alter table public.scouting_votes add constraint scouting_votes_attribute_check check (attribute in (
  'acceleration', 'sprint_speed',
  'positioning', 'finishing', 'shot_power', 'long_shots', 'volleys', 'penalties',
  'vision', 'crossing', 'free_kick', 'short_passing', 'long_passing', 'curve',
  'agility', 'balance', 'reactions', 'ball_control', 'dribbling', 'composure',
  'interceptions', 'heading', 'def_awareness', 'standing_tackle', 'sliding_tackle',
  'jumping', 'stamina', 'strength', 'aggression',
  'gk_diving', 'gk_handling', 'gk_kicking', 'gk_reflexes', 'gk_positioning',
  'pac', 'sho', 'pas', 'dri', 'def', 'phy',
  'div', 'han', 'kic', 'ref', 'pos'
));

create or replace function public.submit_scouting_votes(p_target_player_id uuid, p_mode text, p_votes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rater_id uuid;
  v_group_id uuid;
  v_settings jsonb;
  v_revote_days int;
  v_last_vote timestamptz;
  v_key text;
  v_val jsonb;
  v_value int;
  v_target_primary text;
  v_target_alt text[];
  v_is_gk boolean;
  v_allowed text[];
  v_has_votes boolean := false;
begin
  select e.rater_player_id, e.group_id into v_rater_id, v_group_id
  from private.check_scouting_eligibility(p_target_player_id) e;

  if p_mode not in ('quick', 'detailed') then
    raise exception 'PICADO_VALIDATION: mode must be quick or detailed';
  end if;
  if p_votes is null or jsonb_typeof(p_votes) <> 'object' then
    raise exception 'PICADO_VALIDATION: votes must be a json object';
  end if;

  select p.primary_position, p.alt_positions into v_target_primary, v_target_alt
  from public.players p
  where p.id = p_target_player_id;

  v_is_gk := (v_target_primary = 'POR') or ('POR' = any (coalesce(v_target_alt, '{}'::text[])));

  if p_mode = 'quick' then
    v_allowed := array['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
    if v_is_gk then
      v_allowed := v_allowed || array['div', 'han', 'kic', 'ref', 'pos'];
    end if;
  else
    v_allowed := array[
      'acceleration', 'sprint_speed',
      'positioning', 'finishing', 'shot_power', 'long_shots', 'volleys', 'penalties',
      'vision', 'crossing', 'free_kick', 'short_passing', 'long_passing', 'curve',
      'agility', 'balance', 'reactions', 'ball_control', 'dribbling', 'composure',
      'interceptions', 'heading', 'def_awareness', 'standing_tackle', 'sliding_tackle',
      'jumping', 'stamina', 'strength', 'aggression'
    ];
    if v_is_gk then
      v_allowed := v_allowed || array['gk_diving', 'gk_handling', 'gk_kicking', 'gk_reflexes', 'gk_positioning'];
    end if;
  end if;

  for v_key, v_val in select * from jsonb_each(p_votes)
  loop
    v_has_votes := true;
    if not (v_key = any (v_allowed)) then
      raise exception 'PICADO_VALIDATION: attribute % is not valid for this mode/target', v_key;
    end if;
    if jsonb_typeof(v_val) <> 'number' then
      raise exception 'PICADO_VALIDATION: vote value for % must be a number', v_key;
    end if;
    v_value := round((v_val #>> '{}')::numeric);
    if v_value < 1 or v_value > 10 then
      raise exception 'PICADO_VALIDATION: vote value must be between 1 and 10';
    end if;
  end loop;

  if not v_has_votes then
    raise exception 'PICADO_VALIDATION: at least one vote is required';
  end if;

  select g.settings into v_settings from public.groups g where g.id = v_group_id;
  v_revote_days := coalesce((v_settings -> 'scouting' ->> 'revote_days')::int, 30);

  select max(sv.created_at) into v_last_vote
  from public.scouting_votes sv
  where sv.rater_player_id = v_rater_id
    and sv.target_player_id = p_target_player_id
    and sv.superseded_at is null;

  if v_last_vote is not null and v_last_vote > pg_catalog.now() - make_interval(days => v_revote_days) then
    raise exception 'PICADO_COOLDOWN: you must wait before revoting this player';
  end if;

  update public.scouting_votes
  set superseded_at = pg_catalog.now()
  where rater_player_id = v_rater_id
    and target_player_id = p_target_player_id
    and superseded_at is null
    and attribute in (select jsonb_object_keys(p_votes));

  insert into public.scouting_votes (group_id, rater_player_id, target_player_id, attribute, value, mode)
  select v_group_id, v_rater_id, p_target_player_id, kv.key, round((kv.value #>> '{}')::numeric), p_mode::public.vote_mode
  from jsonb_each(p_votes) kv;
end;
$$;

revoke execute on function public.submit_scouting_votes(uuid, text, jsonb) from public, anon;
grant execute on function public.submit_scouting_votes(uuid, text, jsonb) to authenticated;
