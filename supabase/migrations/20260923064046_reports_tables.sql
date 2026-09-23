-- Score/stat report tables (vote-like: anonymous-ish self-reports, editable until the report
-- deadline). RLS is enabled here with no policies yet (deny-all interim state); policies (own
-- rows only) + grants are added in 20260923064053_reports_rls.sql. Writes go through SECURITY
-- DEFINER RPCs in 20260923064056_reports_rpcs.sql; there are no insert/update/delete grants for
-- authenticated at all.

-- One row per (match, reporter): the reporter's claim of the final score. Upserted by
-- submit_score_report until report_deadline.
create table if not exists public.score_reports (
  match_id uuid not null references public.matches (id) on delete cascade,
  reporter_player_id uuid not null references public.players (id) on delete cascade,
  team1_goals int not null check (team1_goals between 0 and 99),
  team2_goals int not null check (team2_goals between 0 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, reporter_player_id)
);

create index if not exists score_reports_reporter_idx on public.score_reports (reporter_player_id);

alter table public.score_reports enable row level security;

-- One row per (match, reporter, subject): the reporter's claim of a subject's individual stats.
-- Upserted by submit_stat_reports until report_deadline. A subject can (and often does) report
-- on themself -- Rule A treats a lone self-report as accepted.
create table if not exists public.stat_reports (
  match_id uuid not null references public.matches (id) on delete cascade,
  reporter_player_id uuid not null references public.players (id) on delete cascade,
  subject_player_id uuid not null references public.players (id) on delete cascade,
  goals int not null default 0 check (goals between 0 and 30),
  assists int not null default 0 check (assists between 0 and 30),
  own_goals int not null default 0 check (own_goals between 0 and 30),
  saves int not null default 0 check (saves between 0 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, reporter_player_id, subject_player_id)
);

create index if not exists stat_reports_reporter_idx on public.stat_reports (reporter_player_id);
create index if not exists stat_reports_subject_idx on public.stat_reports (subject_player_id);

alter table public.stat_reports enable row level security;
