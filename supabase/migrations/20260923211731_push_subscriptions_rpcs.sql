-- Public RPCs for web push subscriptions. Every function is SECURITY DEFINER, search_path pinned
-- to '', fully-qualified names, revoked from public/anon, granted to authenticated only. Errors
-- use a stable `PICADO_<CODE>: ` prefix that Server Actions map to Spanish messages.

-- ### public.save_push_subscription(p_endpoint, p_p256dh, p_auth, p_user_agent) returns uuid
-- Upsert on the unique endpoint: if the endpoint was previously registered by a different user on
-- the same device (e.g. someone logged out and a different account logged in), it's reassigned to
-- the caller -- a push endpoint can only ever notify whoever is currently signed in on that
-- browser, so there's no meaningful "ownership conflict" to reject here.
create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'PICADO_FORBIDDEN: authentication required';
  end if;
  if p_endpoint is null or char_length(trim(p_endpoint)) = 0 then
    raise exception 'PICADO_VALIDATION: endpoint is required';
  end if;
  if p_p256dh is null or char_length(trim(p_p256dh)) = 0 then
    raise exception 'PICADO_VALIDATION: p256dh is required';
  end if;
  if p_auth is null or char_length(trim(p_auth)) = 0 then
    raise exception 'PICADO_VALIDATION: auth is required';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, last_used_at)
  values (v_uid, p_endpoint, p_p256dh, p_auth, p_user_agent, pg_catalog.now())
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    last_used_at = pg_catalog.now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- ### public.delete_push_subscription(p_endpoint text)
-- Own rows only: deleting an endpoint owned by another user raises PICADO_FORBIDDEN. Deleting an
-- endpoint that doesn't exist at all is a no-op (idempotent unsubscribe).
create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'PICADO_FORBIDDEN: authentication required';
  end if;

  select ps.user_id into v_owner from public.push_subscriptions ps where ps.endpoint = p_endpoint;
  if v_owner is null then
    return;
  end if;
  if v_owner <> v_uid then
    raise exception 'PICADO_FORBIDDEN: you cannot delete another user''s push subscription';
  end if;

  delete from public.push_subscriptions where endpoint = p_endpoint;
end;
$$;

revoke execute on function public.delete_push_subscription(text) from public;
grant execute on function public.delete_push_subscription(text) to authenticated;
