-- M4 tournament schema: tables. RLS is enabled here with no policies yet (deny-all interim
-- state); policies + grants are added in 20260923161333_tournament_rls.sql. Writes go through
-- SECURITY DEFINER RPCs in the _rpcs_* migrations that follow.
--
-- Design notes (TS <-> SQL split -- read this before touching the RPC migrations):
--
-- * The pure bracket engine (lib/brackets) is the source of truth for *generation* and
--   *advancement logic*. The SQL layer stores exactly what the engine produces and mirrors its
--   propagation rules (BYE cascade, grand-final reset, winner/loser routing) so that writes can be
--   validated and made atomic server-side, per "the client is never trusted" -- the client cannot
--   compute results, it can only submit raw scores through confirm_match_result/edit_match_result.
--
-- * Engine ids are deterministic strings (e.g. `s1-wb-r1-m1`); the server maps them to uuid PKs.
--   Every stage/group/match row carries its engine id in `engine_key` (unique per tournament) so
--   the TS server can round-trip TournamentState: `persist_bracket`'s jsonb payload mirrors
--   lib/brackets/types.ts's Stage/Group/Match shape almost verbatim (camelCase keys), so the TS
--   server can pass `state.stages` / `state.groups` / `state.matches` with no transformation
--   beyond JSON.stringify. `entry1Id`/`entry2Id`/`winnerEntryId`/`loserEntryId` in that payload are
--   always the *real* tournament_entries.id (as text) -- the engine treats Entry.id opaquely, so
--   the TS server seeds Entry.id with the entry row's uuid, and no separate entry mapping is
--   needed at persist time.
--
-- * The engine's EntrySlot is `string | "__bye__" | null` (see lib/brackets/types.ts BYE). Slot
--   columns (entry1_id/entry2_id) are therefore `text`, holding either a tournament_entries.id (as
--   text), the literal sentinel '__bye__', or null -- not a uuid FK, because the sentinel isn't a
--   real entry. A check constraint keeps the column to those three shapes; entry existence is
--   validated by the RPCs (private.tm_insert_match) instead of a DB-level FK. winner_entry_id /
--   loser_entry_id *are* real uuid FKs to tournament_entries: a BYE never "wins" as an entry (a
--   double-BYE match has winner_entry_id null and cascades BYE onward).
--
-- * private.tm_set_slot mirrors lib/brackets/propagation.ts's setSlot/tryAutoResolveBye/
--   propagateResult, recursively, directly against the tournament_matches table. confirm_match_result
--   mirrors engine.ts's resolveWinner/applyResult/handleGrandFinalTransition; edit_match_result
--   mirrors canEditResult/editResult. See 20260923161342_tournament_rpcs_advance.sql.
--
-- * No `standings` table: standings (lib/brackets/standings.ts) are a pure function of already
--   client-readable data (tournament_matches + tournament_entries, no private inputs), cheap to
--   recompute, and format-specific (league/group/swiss tiebreakers differ). Materializing them
--   would add another derived cache to keep transactionally consistent with confirm_match_result /
--   edit_match_result / append_swiss_round for no read-side benefit. Per "pure engines are the
--   source of truth: server loads rows -> calls engine", standings are computed on read: an RSC
--   loads tournament_matches for a stage/group and calls `standings()` directly. Same for swiss
--   round bookkeeping: swissRoundsGenerated is `select max(round) from tournament_matches where
--   stage_id = ... and bracket = 'swiss'`, no counter column needed.
--
-- * Groups-KO qualifier placeholders: KO round-1 matches are generated up front (persist_bracket)
--   with entry1_from/entry2_from set to the engine's QualifierRef ({"fromGroup","rank"}, same key
--   names, stored as-is in jsonb) and entry1_id/entry2_id left null (or '__bye__' for placeholders
--   the engine could already resolve, e.g. a vacant group slot). Once the TS server sees every
--   match in a group is `completed`, it calls lib/brackets `standings()` itself (pure, no DB
--   dependency) and pushes the ranked entry ids into `seed_knockout_from_groups`, which locates
--   every placeholder matching {fromGroup, rank} and resolves it via private.tm_set_slot (cascading
--   any resulting BYEs exactly like a human result would). Swiss's next round is generated the same
--   way: TS calls the pure `nextSwissRound`, then `append_swiss_round` persists just the new round's
--   matches (swiss matches never carry next_match_id -- pairing is recomputed each round).

create type public.tournament_format as enum ('league', 'single_elim', 'double_elim', 'groups_ko', 'swiss');
create type public.tournament_entry_mode as enum ('teams', 'individual');
create type public.tournament_status as enum ('draft', 'registration', 'in_progress', 'finished');
create type public.stage_kind as enum ('league', 'single_elim', 'double_elim', 'group', 'knockout', 'swiss');
create type public.tournament_bracket as enum ('winners', 'losers', 'final', 'third', 'group', 'swiss');
create type public.tournament_match_status as enum (
  'locked', 'waiting', 'ready', 'in_progress', 'completed', 'archived'
);
create type public.tournament_decided_by as enum ('regular', 'pens', 'walkover', 'bye', 'manual');

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  format public.tournament_format not null,
  entry_mode public.tournament_entry_mode not null default 'teams',
  team_size int not null check (team_size between 3 and 11),
  status public.tournament_status not null default 'draft',
  settings jsonb not null default '{}'::jsonb,
  organizer_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists tournaments_group_id_idx on public.tournaments (group_id);

alter table public.tournaments enable row level security;

create table if not exists public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  seed int check (seed is null or seed > 0),
  player_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  unique (tournament_id, seed)
);

create index if not exists tournament_entries_tournament_id_idx on public.tournament_entries (tournament_id);

alter table public.tournament_entries enable row level security;

create table if not exists public.tournament_registrations (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  registered_at timestamptz not null default now(),
  primary key (tournament_id, player_id)
);

create index if not exists tournament_registrations_player_id_idx on public.tournament_registrations (player_id);

alter table public.tournament_registrations enable row level security;

create table if not exists public.stages (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  kind public.stage_kind not null,
  -- "order" is a reserved word; stage_order mirrors CLAUDE.md's `stages(..., order, ...)` column.
  stage_order int not null check (stage_order > 0),
  settings jsonb not null default '{}'::jsonb,
  engine_key text not null,
  unique (tournament_id, engine_key)
);

create index if not exists stages_tournament_id_idx on public.stages (tournament_id);

alter table public.stages enable row level security;

create table if not exists public.stage_groups (
  id uuid primary key default gen_random_uuid(),
  -- Denormalized (also reachable via stage_id -> stages.tournament_id): keeps the RLS policy and
  -- persist_bracket's per-tournament lookups to a single join instead of two.
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  stage_id uuid not null references public.stages (id) on delete cascade,
  number int not null check (number > 0),
  label text not null,
  engine_key text not null,
  unique (tournament_id, engine_key)
);

create index if not exists stage_groups_tournament_id_idx on public.stage_groups (tournament_id);
create index if not exists stage_groups_stage_id_idx on public.stage_groups (stage_id);

alter table public.stage_groups enable row level security;

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  -- Denormalized, see stage_groups.tournament_id above.
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  stage_id uuid not null references public.stages (id) on delete cascade,
  stage_group_id uuid references public.stage_groups (id) on delete cascade,
  bracket public.tournament_bracket not null,
  -- 1-based, scoped to (stage_id, bracket): see lib/brackets/types.ts Match doc comment.
  round int not null check (round > 0),
  number int not null check (number > 0),
  -- EntrySlot: a tournament_entries.id (as text), the '__bye__' sentinel, or null. See the design
  -- note at the top of this file for why this isn't a uuid FK.
  entry1_id text check (
    entry1_id is null or entry1_id = '__bye__'
    or entry1_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  entry2_id text check (
    entry2_id is null or entry2_id = '__bye__'
    or entry2_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  -- QualifierRef {"fromGroup": text, "rank": int}, set only ahead of a group stage resolving.
  entry1_from jsonb,
  entry2_from jsonb,
  status public.tournament_match_status not null default 'locked',
  winner_entry_id uuid references public.tournament_entries (id) on delete set null,
  loser_entry_id uuid references public.tournament_entries (id) on delete set null,
  score1 int check (score1 is null or score1 >= 0),
  score2 int check (score2 is null or score2 >= 0),
  pens1 int check (pens1 is null or pens1 >= 0),
  pens2 int check (pens2 is null or pens2 >= 0),
  decided_by public.tournament_decided_by,
  next_match_id uuid references public.tournament_matches (id) on delete set null,
  next_slot smallint check (next_slot is null or next_slot in (1, 2)),
  next_loser_match_id uuid references public.tournament_matches (id) on delete set null,
  next_loser_slot smallint check (next_loser_slot is null or next_loser_slot in (1, 2)),
  -- The real-football match this tournament fixture is played as, once linked.
  match_id uuid,
  engine_key text not null,
  unique (tournament_id, engine_key)
);

create index if not exists tournament_matches_tournament_id_idx on public.tournament_matches (tournament_id);
create index if not exists tournament_matches_stage_id_idx on public.tournament_matches (stage_id);
create index if not exists tournament_matches_stage_group_id_idx on public.tournament_matches (stage_group_id);
create index if not exists tournament_matches_next_match_id_idx on public.tournament_matches (next_match_id);
create index if not exists tournament_matches_next_loser_match_id_idx
  on public.tournament_matches (next_loser_match_id);
create index if not exists tournament_matches_match_id_idx on public.tournament_matches (match_id);

alter table public.tournament_matches enable row level security;

-- matches.tournament_match_id was added without a FK in 20260923061614_matches_tables.sql
-- ("tournaments land in a later migration") -- add it now that tournament_matches exists, plus
-- the reverse link (tournament_matches.match_id) declared above.
alter table public.matches
  add constraint matches_tournament_match_id_fkey
  foreign key (tournament_match_id) references public.tournament_matches (id) on delete set null;

create index if not exists matches_tournament_match_id_idx on public.matches (tournament_match_id);

alter table public.tournament_matches
  add constraint tournament_matches_match_id_fkey
  foreign key (match_id) references public.matches (id) on delete set null;
