-- Reports are self-submitted but not meant to be browsable by teammates (avoids anchoring / peer
-- pressure before the reconciliation runs): select policy = own rows only (the caller is the
-- reporter). Grants are select-only for authenticated; there are no insert/update/delete grants
-- at all -- writes go through the SECURITY DEFINER RPCs in 20260923064056_reports_rpcs.sql.
-- service_role gets a plain select grant (RLS doesn't apply to it, but the Data API still
-- requires an explicit table grant before any statement is even attempted): the TS finalizer
-- reads every report row directly to run reconciliation.

grant select on public.score_reports to authenticated;
grant select on public.stat_reports to authenticated;
grant select on public.score_reports to service_role;
grant select on public.stat_reports to service_role;

create policy score_reports_select_own on public.score_reports
for select
to authenticated
using (
  exists (
    select 1 from public.players p
    where p.id = score_reports.reporter_player_id
      and p.user_id = (select auth.uid())
  )
);

create policy stat_reports_select_own on public.stat_reports
for select
to authenticated
using (
  exists (
    select 1 from public.players p
    where p.id = stat_reports.reporter_player_id
      and p.user_id = (select auth.uid())
  )
);
