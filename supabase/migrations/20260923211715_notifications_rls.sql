-- notifications: select policy = own rows only. Grant is select-only for authenticated; there is
-- no insert/update/delete grant at all -- inserts are service_role only (see
-- 20260923211711_notifications_tables.sql) and read_at is only ever set via the SECURITY DEFINER
-- mark_notifications_read RPC in 20260923211719_notifications_rpcs.sql.

grant select on public.notifications to authenticated;

create policy notifications_select_own on public.notifications
for select
to authenticated
using (user_id = (select auth.uid()));
