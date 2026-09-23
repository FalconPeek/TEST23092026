-- push_subscriptions: select policy = own rows only. Grant is select-only for authenticated;
-- there is no insert/update/delete grant at all -- writes go through the SECURITY DEFINER RPCs in
-- 20260923211731_push_subscriptions_rpcs.sql.

grant select on public.push_subscriptions to authenticated;

create policy push_subscriptions_select_own on public.push_subscriptions
for select
to authenticated
using (user_id = (select auth.uid()));
