-- Fix private.shared_match: any match that was actually played counts, not just reporting/
-- finalized. A match that reached reporting, disputed (score/stats contested) or
-- pending_finalize (windows closed, awaiting the finalize job) was played just as much as one
-- already finalized -- only scheduled (hasn't happened yet) and cancelled (never happened)
-- should NOT count. create or replace keeps the existing revoke-from-public state (no grant to
-- authenticated) untouched.

create or replace function private.shared_match(p1 uuid, p2 uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.match_participants mp1
    join public.match_participants mp2 on mp2.match_id = mp1.match_id
    join public.matches m on m.id = mp1.match_id
    where mp1.player_id = p1
      and mp2.player_id = p2
      and m.status in ('reporting', 'disputed', 'pending_finalize', 'finalized')
  );
$$;
