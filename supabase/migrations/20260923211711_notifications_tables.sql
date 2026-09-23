-- M5 engagement: in-app notifications + per-kind notification preferences. RLS is enabled here
-- with no policies yet (deny-all interim state); policies + grants are added in
-- 20260923211715_notifications_rls.sql. Writes (insert) are service_role only (the TS
-- notification dispatcher, run from the finalizer / badge engine / tournament progression code
-- with the admin client); `read_at` is set only via the SECURITY DEFINER RPC in
-- 20260923211719_notifications_rpcs.sql.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  kind text not null check (kind in (
    'match_scheduled', 'report_pending', 'rating_pending', 'match_finalized', 'match_disputed',
    'tournament_generated', 'tournament_match_ready', 'badge_awarded', 'card_updated'
  )),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- Covers both "my notifications, newest first" and "my unread notifications" (read_at is null),
-- the two shapes the RLS policy + mark_notifications_read / the notification feed RSC query need.
create index if not exists notifications_user_id_created_at_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_id_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

-- Per-kind on/off switches, e.g. {"match_scheduled": false}. Lives on profiles (one row per user,
-- not per group) rather than its own table: notification_prefs is a single small jsonb blob with
-- no group scoping and no independent lifecycle, so a dedicated table would only add a join for
-- every read without buying anything -- unlike group `settings`, which is genuinely per-group.
-- Absent keys default to enabled (the TS dispatcher treats a missing key as `true`), so an empty
-- '{}'::jsonb (the column default) means "everything on".
alter table public.profiles add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

-- ### service_role grants (the admin client / TS notification dispatcher writes these directly).
grant select, insert, update, delete on public.notifications to service_role;
