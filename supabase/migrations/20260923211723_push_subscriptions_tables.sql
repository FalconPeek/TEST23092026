-- M5 engagement: web push subscriptions (one row per browser/device endpoint). RLS is enabled
-- here with no policies yet (deny-all interim state); policies + grants are added in
-- 20260923211727_push_subscriptions_rls.sql. Writes go through the SECURITY DEFINER RPCs in
-- 20260923211731_push_subscriptions_rpcs.sql; there is no insert/update/delete grant to
-- authenticated at all.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Globally unique: a Push API endpoint identifies one browser subscription, independent of
  -- which Picado account is currently signed in on that device -- save_push_subscription
  -- reassigns it to whoever calls it (see the RPC's docstring).
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- ### service_role grants (the admin client / TS push dispatcher reads endpoints to send to,
-- prunes dead ones, and bumps last_used_at on a successful send). No insert grant: new/reassigned
-- subscriptions are only ever written via save_push_subscription (SECURITY DEFINER, owned by
-- postgres, so it doesn't need its own grant either).
grant select, delete on public.push_subscriptions to service_role;
grant update (last_used_at) on public.push_subscriptions to service_role;
