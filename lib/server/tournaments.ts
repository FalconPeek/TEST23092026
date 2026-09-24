// Pure orchestration between lib/brackets (the engine, source of truth for generation/advancement)
// and TournamentRepo (the only I/O boundary) -- mirrors lib/server/finalize.ts's split, so every
// function here is synchronously testable against an in-memory fake repo
// (tournaments.test.ts) and never touches Postgres/Date.now()/Math.random() itself; callers
// inject `rng` (see lib/brackets/rng.ts's seededRng) exactly like finalizeMatch is injected `now`.
import {
  BracketError,
  defaultSwissRounds,
  generate,
  nextSwissRound,
  standings as computeStandingsRows,
  type Entry,
  type Match,
  type Rng,
  type StandingsRow,
  type TournamentState,
} from "@/lib/brackets";
import { balanceTeams, type BalancePlayer } from "@/lib/rating";
import type { PlayerBadgeAward } from "@/lib/server/badges";
import { awardTournamentBadges } from "@/lib/server/badges";
import type { BadgesRepo } from "@/lib/server/badges-repo";
import type { EntryRow, GroupQualifiers, TournamentRepo } from "./tournament-repo";

export class TournamentNotFoundError extends Error {
  constructor(tournamentId: string) {
    super(`Tournament ${tournamentId} not found`);
  }
}

/** Mirrors persist_bracket / append_swiss_round's PICADO_ALREADY_GENERATED: checked here too so
 * buildIndividualEntries never clobbers entries ahead of a persist that's doomed to fail anyway. */
export class TournamentAlreadyGeneratedError extends Error {
  constructor(tournamentId: string) {
    super(`Tournament ${tournamentId} already has a bracket`);
  }
}

const DEFAULT_OVR = 60;
const DEFAULT_MU = 25;

/** Average OVR (player_cards.ovr, default 60) across an entry's roster; an entry with no players
 * yet defaults to the group-wide default so it doesn't distort the sort. */
function averageOvr(playerIds: string[], ovrByPlayer: Map<string, number>): number {
  if (playerIds.length === 0) return DEFAULT_OVR;
  const sum = playerIds.reduce((acc, id) => acc + (ovrByPlayer.get(id) ?? DEFAULT_OVR), 0);
  return sum / playerIds.length;
}

/**
 * Assigns Entry.seed: if every entry already has an organizer-assigned seed (manual seeding via
 * saveTournamentEntries), keeps it untouched; otherwise seeds 1..n by descending average roster
 * OVR (ties broken by name then id, for a deterministic order independent of DB row order).
 * settings.seeding === 'random' still applies on top of this in lib/brackets/engine's `generate`.
 */
async function seedEntries(repo: TournamentRepo, entries: EntryRow[]): Promise<Entry[]> {
  if (entries.every((e) => e.seed !== null)) {
    return entries.map((e) => ({ id: e.id, name: e.name, seed: e.seed as number }));
  }
  const allPlayerIds = [...new Set(entries.flatMap((e) => e.playerIds))];
  const ovrByPlayer = await repo.loadPlayerOvrs(allPlayerIds);
  return entries
    .map((entry) => ({ entry, avgOvr: averageOvr(entry.playerIds, ovrByPlayer) }))
    .sort(
      (a, b) =>
        b.avgOvr - a.avgOvr || a.entry.name.localeCompare(b.entry.name) || (a.entry.id < b.entry.id ? -1 : 1),
    )
    .map(({ entry }, i) => ({ id: entry.id, name: entry.name, seed: i + 1 }));
}

/**
 * Generates and persists the bracket for a tournament whose entries are already saved (teams
 * mode: via saveTournamentEntries beforehand; individual mode: call buildIndividualEntries
 * first). Requires >= 2 entries; settings come from the tournament row, already validated by
 * lib/settings/tournament.ts's schema at createTournament/updateTournament time.
 */
export async function generateBracket(repo: TournamentRepo, tournamentId: string, rng: Rng): Promise<TournamentState> {
  const tournament = await repo.loadTournament(tournamentId);
  if (!tournament) throw new TournamentNotFoundError(tournamentId);
  if (await repo.hasBracket(tournamentId)) throw new TournamentAlreadyGeneratedError(tournamentId);

  const entryRows = await repo.loadEntries(tournamentId);
  if (entryRows.length < 2) {
    throw new BracketError("a tournament needs at least 2 entries to generate a bracket");
  }
  const entries = await seedEntries(repo, entryRows);

  const state = generate(tournament.format, entries, tournament.settings, rng);
  await repo.persistBracket(tournamentId, state);
  return state;
}

/**
 * Individual-entry tournaments: turns registrations into balanced teams (snake draft on OpenSkill
 * mu, tie-break OVR, then a local swap search -- lib/rating/balance.ts's balanceTeams) and saves
 * them as tournament_entries (unseeded: generateBracket's OVR-based seeding then runs on top).
 *
 * teamCount = max(2, round(registrations / team_size)) -- the nearest whole number of team_size
 * teams that fits the registration pool, floored at 2 (a tournament needs at least two entries).
 * balanceTeams's snake draft then spreads any remainder across teams by itself (sizes differ by
 * at most one, no separate "leftover players" bucket), which reads better for a casual 5-a-side
 * group than strictly filling teams to `team_size` and stranding whoever's left.
 */
export async function buildIndividualEntries(repo: TournamentRepo, tournamentId: string, rng: Rng): Promise<void> {
  const tournament = await repo.loadTournament(tournamentId);
  if (!tournament) throw new TournamentNotFoundError(tournamentId);
  if (tournament.entryMode !== "individual") {
    throw new BracketError("buildIndividualEntries is only valid for individual-entry tournaments");
  }
  if (await repo.hasBracket(tournamentId)) throw new TournamentAlreadyGeneratedError(tournamentId);

  const playerIds = await repo.loadRegistrations(tournamentId);
  if (playerIds.length < 2) {
    throw new BracketError("at least 2 registered players are required to build teams");
  }

  const inputs = await repo.loadBalanceInputs(playerIds);
  const players: BalancePlayer[] = playerIds.map((id) => {
    const b = inputs.get(id);
    return { id, mu: b?.mu ?? DEFAULT_MU, ovr: b?.ovr ?? DEFAULT_OVR, isGk: b?.isGk ?? false };
  });

  const teamCount = Math.max(2, Math.round(playerIds.length / tournament.teamSize));
  const teams = balanceTeams(players, teamCount, rng);

  await repo.saveEntries(
    tournamentId,
    teams.map((team, i) => ({ name: `Equipo ${i + 1}`, seed: null, playerIds: team.playerIds })),
  );
}

/** Every knockout placeholder still waiting on `group.label`'s standings (entry slot unresolved). */
function groupHasPendingQualifiers(state: TournamentState, groupLabel: string): boolean {
  return state.matches.some(
    (m) =>
      (m.entry1From?.fromGroup === groupLabel && m.entry1Id === null) ||
      (m.entry2From?.fromGroup === groupLabel && m.entry2Id === null),
  );
}

/** Engine-key ids (Match.id, stable across reloads -- see tournament-repo.ts's loadState doc
 * comment) of every placeholder match that referenced one of the groups just resolved. Returned
 * so afterTournamentMatchCompleted can, after reloading state, tell exactly which matches became
 * fully ready (both entries assigned) *because of this call* -- as opposed to matches that were
 * already ready from an earlier group's seeding, which must NOT be re-reported (or a repeated
 * caller would re-notify participants of a match that's been ready for a while). */
async function seedDueGroups(repo: TournamentRepo, tournamentId: string, state: TournamentState, rng: Rng): Promise<string[]> {
  const qualifiersPerGroup = state.settings.groups_ko.qualifiers_per_group;
  const qualifiers: GroupQualifiers[] = [];

  for (const group of state.groups) {
    const groupMatches = state.matches.filter((m) => m.groupId === group.id);
    if (groupMatches.length === 0 || !groupMatches.every((m) => m.status === "completed")) continue;
    if (!groupHasPendingQualifiers(state, group.label)) continue; // already seeded, or nothing references it

    const table: StandingsRow[] = computeStandingsRows(groupMatches, state.settings, rng);
    const ranked: (string | null)[] = table.map((row) => row.entryId);
    while (ranked.length < qualifiersPerGroup) ranked.push(null);
    qualifiers.push({ group: group.label, entries: ranked.slice(0, qualifiersPerGroup) });
  }

  if (qualifiers.length === 0) return [];
  await repo.seedKnockoutFromGroups(tournamentId, qualifiers);

  const seededLabels = new Set(qualifiers.map((q) => q.group));
  return state.matches
    .filter((m) => (m.entry1From && seededLabels.has(m.entry1From.fromGroup)) || (m.entry2From && seededLabels.has(m.entry2From.fromGroup)))
    .map((m) => m.id);
}

/** Returns the brand-new round's matches (or [] if no round was due), which -- unlike groups_ko's
 * placeholders -- are unambiguously "newly ready": a swiss round is generated with both entries of
 * every pairing already assigned, all at once. */
async function appendSwissRoundIfDue(repo: TournamentRepo, tournamentId: string, state: TournamentState, rng: Rng): Promise<Match[]> {
  const stage = state.stages[0];
  if (!stage) return [];
  const currentRound = state.swissRoundsGenerated ?? 0;
  const totalRounds = state.settings.swiss.rounds ?? defaultSwissRounds(state.entries.length);
  if (currentRound === 0 || currentRound >= totalRounds) return []; // nothing generated yet, or event is over

  const currentRoundMatches = state.matches.filter((m) => m.stageId === stage.id && m.round === currentRound);
  if (currentRoundMatches.length === 0 || !currentRoundMatches.every((m) => m.status === "completed")) return [];

  const next = nextSwissRound(state, rng);
  const newRoundMatches = next.matches.filter((m) => m.stageId === stage.id && m.round === currentRound + 1);
  await repo.appendSwissRound(tournamentId, stage.id, newRoundMatches);
  return newRoundMatches;
}

export interface NewlyReadyMatch {
  round: number;
  /** [entry1Id, entry2Id] -- both always non-null by construction (only fully-resolved matches
   * are reported, see seedDueGroups/appendSwissRoundIfDue's doc comments). */
  entryIds: [string, string];
}

export interface AdvanceResult {
  /** Matches that became ready to be scheduled (both entries assigned) as a DIRECT result of this
   * call -- for the caller to fan out `tournament_match_ready` notifications from. Empty for
   * formats without a pending-placeholder concept (single_elim/double_elim/league already have
   * every match's entries assigned once the bracket/table is generated) or when nothing new
   * happened this call (the common case: most finalize/confirm calls don't complete a group/round). */
  newlyReadyMatches: NewlyReadyMatch[];
}

const EMPTY_ADVANCE_RESULT: AdvanceResult = { newlyReadyMatches: [] };

/**
 * Progresses a tournament after one of its matches' results changed: for groups_ko, seeds the
 * knockout stage from any group whose matches are now all completed; for swiss, appends the next
 * round once the current one is fully completed. Re-derives everything from the current DB state
 * on every call (no separate "already done" flag needed), so it's safe -- and a no-op -- to call
 * after every confirm/edit/finalize, including ones that don't actually complete anything new.
 */
export async function afterTournamentMatchCompleted(repo: TournamentRepo, tournamentId: string, rng: Rng): Promise<AdvanceResult> {
  const state = await repo.loadState(tournamentId);
  if (!state) return EMPTY_ADVANCE_RESULT;

  if (state.format === "groups_ko") {
    const affectedIds = await seedDueGroups(repo, tournamentId, state, rng);
    if (affectedIds.length === 0) return EMPTY_ADVANCE_RESULT;
    const after = await repo.loadState(tournamentId);
    const affectedSet = new Set(affectedIds);
    const newlyReadyMatches: NewlyReadyMatch[] = (after?.matches ?? [])
      .filter((m) => affectedSet.has(m.id) && m.status === "ready" && m.entry1Id !== null && m.entry2Id !== null)
      .map((m) => ({ round: m.round, entryIds: [m.entry1Id as string, m.entry2Id as string] }));
    return { newlyReadyMatches };
  }

  if (state.format === "swiss") {
    const newRoundMatches = await appendSwissRoundIfDue(repo, tournamentId, state, rng);
    const newlyReadyMatches: NewlyReadyMatch[] = newRoundMatches
      .filter((m) => m.entry1Id !== null && m.entry2Id !== null)
      .map((m) => ({ round: m.round, entryIds: [m.entry1Id as string, m.entry2Id as string] }));
    return { newlyReadyMatches };
  }

  return EMPTY_ADVANCE_RESULT;
}

/** The winning entry once the tournament is fully decided, or null while it's still in progress.
 * Bracket formats (single_elim/double_elim/groups_ko) finish when their `final` match completes;
 * league/swiss have no elimination final, so "finished" means every match is completed/archived
 * and the champion is the top-ranked standings row (`rng` only matters if that ranking bottoms out
 * at a 'lots' tiebreaker). */
function computeChampionEntryId(state: TournamentState, rng?: Rng): string | null {
  const finalMatch = state.matches.find((m) => m.bracket === "final");
  if (finalMatch) return finalMatch.status === "completed" && finalMatch.winnerEntryId ? finalMatch.winnerEntryId : null;

  if (state.matches.length === 0) return null;
  if (!state.matches.every((m) => m.status === "completed" || m.status === "archived")) return null;

  const tableMatches = state.matches.filter((m) => m.bracket === "group" || m.bracket === "swiss");
  const rows = computeStandingsRows(tableMatches, state.settings, rng, state.settings.tiebreakers);
  return rows[0]?.entryId ?? null;
}

/**
 * Awards tournament_champion (lib/badges/engine.ts) to every player on the winning entry, once,
 * the first time the tournament is detected as decided -- guarded by
 * TournamentRepo.hasAwardedTournamentChampion so repeated calls (this runs from the same places as
 * afterTournamentMatchCompleted) don't re-increment the badge's repeatable count. Returns [] while
 * the tournament isn't finished yet, if it has no players on the winning entry (e.g. a bye-only
 * bracket edge case), or if it was already awarded.
 */
export async function awardTournamentChampionIfDone(
  repo: TournamentRepo,
  badgesRepo: BadgesRepo,
  tournamentId: string,
  badgesEnabled: boolean,
  rng?: Rng,
): Promise<PlayerBadgeAward[]> {
  const state = await repo.loadState(tournamentId);
  if (!state) return [];
  const championEntryId = computeChampionEntryId(state, rng);
  if (!championEntryId) return [];
  if (await repo.hasAwardedTournamentChampion(tournamentId)) return [];

  const entries = await repo.loadEntries(tournamentId);
  const champion = entries.find((e) => e.id === championEntryId);
  if (!champion || champion.playerIds.length === 0) return [];

  return awardTournamentBadges(badgesRepo, champion.playerIds, tournamentId, badgesEnabled);
}

export interface StageStandings {
  stageId: string;
  groupId: string | null;
  rows: StandingsRow[];
}

/**
 * Standings for every group/league/swiss bracket in the tournament (matches with bracket 'group'
 * or 'swiss' -- pure knockout brackets like winners/losers/final have no table, only a final
 * placement from the bracket itself). Swiss stages use settings.swiss.tiebreakers instead of the
 * top-level settings.tiebreakers, mirroring lib/brackets/swiss.ts's nextSwissRound. `rng` is only
 * required if a tiebreaker chain bottoms out at 'lots'.
 */
export async function computeStandings(repo: TournamentRepo, tournamentId: string, rng?: Rng): Promise<StageStandings[]> {
  const state = await repo.loadState(tournamentId);
  if (!state) return [];

  const buckets = new Map<string, { stageId: string; groupId: string | null; matches: Match[] }>();
  for (const m of state.matches) {
    if (m.bracket !== "group" && m.bracket !== "swiss") continue;
    const key = `${m.stageId}|${m.groupId ?? ""}`;
    const bucket = buckets.get(key) ?? { stageId: m.stageId, groupId: m.groupId, matches: [] };
    bucket.matches.push(m);
    buckets.set(key, bucket);
  }

  const results: StageStandings[] = [];
  for (const { stageId, groupId, matches } of buckets.values()) {
    const stage = state.stages.find((s) => s.id === stageId);
    const tiebreakers = stage?.kind === "swiss" ? state.settings.swiss.tiebreakers : state.settings.tiebreakers;
    results.push({ stageId, groupId, rows: computeStandingsRows(matches, state.settings, rng, tiebreakers) });
  }
  return results;
}
