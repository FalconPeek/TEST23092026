-- profiles: readable by the owner and by anyone sharing a group with them; only the owner may
-- update their own display_name/avatar_url. No insert/delete grants: rows are created only by the
-- private.handle_new_user trigger (owned by postgres, bypasses RLS as table owner).

grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

create policy profiles_select_self_or_shared_group on public.profiles
for select
to authenticated
using (
  (select auth.uid()) = id
  or private.shares_group(id)
);

create policy profiles_update_self on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
