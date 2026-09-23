-- Public RPCs for notifications + notification preferences. Every function is SECURITY DEFINER,
-- search_path pinned to '', fully-qualified names, revoked from public/anon, granted to
-- authenticated only. Errors use a stable `PICADO_<CODE>: ` prefix that Server Actions map to
-- Spanish messages.

-- Same 9 kinds as the public.notifications.kind check constraint. Not used by any RLS policy,
-- only from inside update_notification_prefs below, so (matching private.playstyle_codes())
-- it's revoked from public and NOT granted to authenticated.
create or replace function private.notification_kinds()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'match_scheduled', 'report_pending', 'rating_pending', 'match_finalized', 'match_disputed',
    'tournament_generated', 'tournament_match_ready', 'badge_awarded', 'card_updated'
  ]::text[];
$$;

revoke execute on function private.notification_kinds() from public;

-- ### public.mark_notifications_read(p_ids uuid[] default null) returns int
-- Marks the caller's own unread notifications as read: every unread one if p_ids is null,
-- otherwise only the ids in p_ids (ids not owned by the caller, or already read, are silently
-- skipped -- not an error, so the client can pass whatever ids it currently has rendered). Returns
-- how many rows were updated.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count int;
begin
  if v_uid is null then
    raise exception 'PICADO_FORBIDDEN: authentication required';
  end if;

  update public.notifications
  set read_at = pg_catalog.now()
  where user_id = v_uid
    and read_at is null
    and (p_ids is null or id = any (p_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.mark_notifications_read(uuid[]) from public;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- ### public.update_notification_prefs(p_prefs jsonb)
-- p_prefs = { "<kind>": boolean, ... }, merged (not replaced) into the caller's
-- profiles.notification_prefs -- callers only send the keys they're toggling. Absent keys keep
-- their previous value (or default to enabled if never set, per the dispatcher's convention).
create or replace function public.update_notification_prefs(p_prefs jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_key text;
  v_val jsonb;
begin
  if v_uid is null then
    raise exception 'PICADO_FORBIDDEN: authentication required';
  end if;
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' then
    raise exception 'PICADO_VALIDATION: prefs must be a json object';
  end if;

  for v_key, v_val in select * from jsonb_each(p_prefs)
  loop
    if not (v_key = any (private.notification_kinds())) then
      raise exception 'PICADO_VALIDATION: unknown notification kind %', v_key;
    end if;
    if jsonb_typeof(v_val) <> 'boolean' then
      raise exception 'PICADO_VALIDATION: notification_prefs value for % must be a boolean', v_key;
    end if;
  end loop;

  update public.profiles
  set notification_prefs = coalesce(notification_prefs, '{}'::jsonb) || p_prefs
  where id = v_uid;
end;
$$;

revoke execute on function public.update_notification_prefs(jsonb) from public;
grant execute on function public.update_notification_prefs(jsonb) to authenticated;
