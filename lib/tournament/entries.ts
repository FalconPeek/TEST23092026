// Pure state transitions + validation for the tournament entries (teams) editor. No I/O;
// components/tournament/entries-editor.tsx owns the actual state and calls into this, then
// hands the result to lib/actions/tournaments.ts's saveTournamentEntries.

export interface DraftEntry {
  id: string;
  name: string;
  seed: number | null;
  playerIds: string[];
  clubId: string | null;
}

export function addEntry(entries: DraftEntry[], id: string, name: string): DraftEntry[] {
  return [...entries, { id, name, seed: null, playerIds: [], clubId: null }];
}

export function removeEntry(entries: DraftEntry[], entryId: string): DraftEntry[] {
  return entries.filter((e) => e.id !== entryId);
}

export function renameEntry(entries: DraftEntry[], entryId: string, name: string): DraftEntry[] {
  return entries.map((e) => (e.id === entryId ? { ...e, name } : e));
}

export function setSeed(entries: DraftEntry[], entryId: string, seed: number | null): DraftEntry[] {
  return entries.map((e) => (e.id === entryId ? { ...e, seed } : e));
}

/** Moves a player onto `entryId`'s roster, removing them from every other entry first so a
 * player is always on at most one team (mirrors save_tournament_entries' own constraint). */
export function assignPlayer(entries: DraftEntry[], entryId: string, playerId: string): DraftEntry[] {
  return entries.map((e) => {
    if (e.id === entryId) {
      return e.playerIds.includes(playerId) ? e : { ...e, playerIds: [...e.playerIds, playerId] };
    }
    return e.playerIds.includes(playerId) ? { ...e, playerIds: e.playerIds.filter((id) => id !== playerId) } : e;
  });
}

/** Removes a player from whichever entry they're currently on; a no-op if already unassigned. */
export function unassignPlayer(entries: DraftEntry[], playerId: string): DraftEntry[] {
  return entries.map((e) =>
    e.playerIds.includes(playerId) ? { ...e, playerIds: e.playerIds.filter((id) => id !== playerId) } : e,
  );
}

/**
 * Sets (or clears) an entry's club. Picking a club renames the entry to the club's name and
 * replaces its roster with the club's players, minus whoever is already on another entry — the
 * admin can still hand-edit the roster afterwards. Clearing the club (`club: null`) only clears
 * `clubId`, leaving the current name and players untouched.
 */
export function setEntryClub(
  entries: DraftEntry[],
  entryId: string,
  club: { id: string; name: string; playerIds: string[] } | null,
): DraftEntry[] {
  if (club === null) {
    return entries.map((e) => (e.id === entryId ? { ...e, clubId: null } : e));
  }
  const takenElsewhere = new Set(entries.flatMap((e) => (e.id === entryId ? [] : e.playerIds)));
  const rosterPlayerIds = club.playerIds.filter((id) => !takenElsewhere.has(id));
  return entries.map((e) =>
    e.id === entryId ? { ...e, clubId: club.id, name: club.name, playerIds: rosterPlayerIds } : e,
  );
}

export function unassignedPlayerIds(entries: DraftEntry[], allPlayerIds: string[]): string[] {
  const assigned = new Set(entries.flatMap((e) => e.playerIds));
  return allPlayerIds.filter((id) => !assigned.has(id));
}

/** Mirrors lib/server/tournaments.ts's averageOvr: an empty roster defaults to the group-wide
 * default (60) so it doesn't distort the sort/display before any player is assigned. */
export function averageOvr(playerIds: string[], ovrByPlayer: Map<string, number>, defaultOvr = 60): number {
  if (playerIds.length === 0) return defaultOvr;
  const sum = playerIds.reduce((acc, id) => acc + (ovrByPlayer.get(id) ?? defaultOvr), 0);
  return sum / playerIds.length;
}

export type EntriesValidationError = "too_few" | "empty_name" | "duplicate_seed";

/** null = valid. Player uniqueness is guaranteed by construction (assignPlayer always removes
 * the player from every other entry first), so it isn't re-checked here. */
export function validateEntries(entries: DraftEntry[]): EntriesValidationError | null {
  if (entries.length < 2) return "too_few";
  if (entries.some((e) => e.name.trim().length === 0)) return "empty_name";
  const seeds = entries.map((e) => e.seed).filter((s): s is number => s !== null);
  if (new Set(seeds).size !== seeds.length) return "duplicate_seed";
  return null;
}
