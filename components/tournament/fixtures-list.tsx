import Link from "next/link";
import { BYE, type Bracket, type DecidedBy, type MatchStatus } from "@/lib/brackets";
import { MatchAdminMenu } from "@/components/tournament/match-admin-menu";
import { ClubCrest } from "@/components/clubs/club-crest";
import { es } from "@/messages/es";

/** Minimal crest/colors an entry's club needs to render, keyed by club id in `clubsById`. */
export type FixtureClub = {
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  crestUrl: string | null;
};

export interface FixtureMatch {
  id: string;
  bracket: Bracket;
  round: number;
  /** Only set for a groups_ko group-stage match (bracket === "group" with a real group). */
  groupLabel: string | null;
  entry1Id: string | null;
  entry2Id: string | null;
  status: MatchStatus;
  score1: number | null;
  score2: number | null;
  pens1: number | null;
  pens2: number | null;
  decidedBy: DecidedBy | null;
  matchId: string | null;
}

export interface FixtureEntryInfo {
  id: string;
  name: string;
  clubId: string | null;
}

type KoBracket = "winners" | "losers" | "final" | "third";

const BRACKET_FALLBACK_LABEL: Record<KoBracket, string> = {
  winners: es.bracket.winners,
  losers: es.bracket.losers,
  final: es.bracket.final,
  third: es.bracket.third,
};

interface EntrySide {
  entryId: string | null;
  name: string;
  clubId: string | null;
  isBye: boolean;
}

function resolveSide(id: string | null, entryById: Map<string, FixtureEntryInfo>): EntrySide {
  if (id === BYE) return { entryId: null, name: es.bracket.bye, clubId: null, isBye: true };
  if (id === null) return { entryId: null, name: es.bracket.tbd, clubId: null, isBye: false };
  const entry = entryById.get(id);
  return { entryId: id, name: entry?.name ?? es.bracket.tbd, clubId: entry?.clubId ?? null, isBye: false };
}

interface FixtureSection {
  key: string;
  label: string;
  matches: FixtureMatch[];
}

function buildSections(matches: FixtureMatch[]): FixtureSection[] {
  const sections: FixtureSection[] = [];

  const groupMatches = matches.filter((m) => m.bracket === "group" && m.groupLabel !== null);
  const byGroupRound = new Map<string, FixtureMatch[]>();
  for (const m of groupMatches) {
    const key = `${m.groupLabel}|${m.round}`;
    byGroupRound.set(key, [...(byGroupRound.get(key) ?? []), m]);
  }
  const groupKeys = [...byGroupRound.keys()].sort((a, b) => {
    const [labelA, roundA] = a.split("|") as [string, string];
    const [labelB, roundB] = b.split("|") as [string, string];
    return labelA.localeCompare(labelB) || Number(roundA) - Number(roundB);
  });
  for (const key of groupKeys) {
    const [label, round] = key.split("|") as [string, string];
    sections.push({
      key,
      label: `${es.standings.group(label)} · ${es.standings.matchday(Number(round))}`,
      matches: byGroupRound.get(key)!,
    });
  }

  const leagueMatches = matches.filter((m) => m.bracket === "group" && m.groupLabel === null);
  const byLeagueRound = new Map<number, FixtureMatch[]>();
  for (const m of leagueMatches) byLeagueRound.set(m.round, [...(byLeagueRound.get(m.round) ?? []), m]);
  for (const round of [...byLeagueRound.keys()].sort((a, b) => a - b)) {
    sections.push({ key: `league-${round}`, label: es.standings.matchday(round), matches: byLeagueRound.get(round)! });
  }

  const swissMatches = matches.filter((m) => m.bracket === "swiss");
  const bySwissRound = new Map<number, FixtureMatch[]>();
  for (const m of swissMatches) bySwissRound.set(m.round, [...(bySwissRound.get(m.round) ?? []), m]);
  for (const round of [...bySwissRound.keys()].sort((a, b) => a - b)) {
    sections.push({ key: `swiss-${round}`, label: es.standings.swissRound(round), matches: bySwissRound.get(round)! });
  }

  // Pure knockout matches (single_elim/double_elim, or a groups_ko KO stage) don't have a
  // matchday/round concept -- lumped under one section per bracket type, in bracket play order.
  const koBrackets: KoBracket[] = ["winners", "losers", "final", "third"];
  for (const bracket of koBrackets) {
    const koMatches = matches
      .filter((m) => m.bracket === bracket)
      .sort((a, b) => a.round - b.round || a.id.localeCompare(b.id));
    if (koMatches.length > 0) {
      sections.push({ key: `ko-${bracket}`, label: BRACKET_FALLBACK_LABEL[bracket], matches: koMatches });
    }
  }

  return sections;
}

function EntryNameRow({ side, club }: { side: EntrySide; club: FixtureClub | undefined }) {
  return (
    <p className={`flex items-center gap-1.5 truncate text-sm ${side.isBye ? "text-muted-foreground/60" : ""}`}>
      {club && (
        <ClubCrest
          crestUrl={club.crestUrl}
          primaryColor={club.primaryColor}
          secondaryColor={club.secondaryColor}
          shortName={club.shortName}
          name={club.name}
          size="sm"
        />
      )}
      <span className="truncate">{side.name}</span>
    </p>
  );
}

function FixtureRow({
  groupId,
  tournamentId,
  match,
  entryById,
  clubsById,
  admin,
}: {
  groupId: string;
  tournamentId: string;
  match: FixtureMatch;
  entryById: Map<string, FixtureEntryInfo>;
  clubsById: Map<string, FixtureClub>;
  admin: boolean;
}) {
  const side1 = resolveSide(match.entry1Id, entryById);
  const side2 = resolveSide(match.entry2Id, entryById);
  const hasScore = match.score1 !== null && match.score2 !== null;
  const pensLabel = match.pens1 !== null && match.pens2 !== null ? ` (${match.pens1}-${match.pens2} pen.)` : "";

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-card p-2.5 ring-1 ring-foreground/10">
      <div className="min-w-0 flex-1">
        <EntryNameRow side={side1} club={side1.clubId ? clubsById.get(side1.clubId) : undefined} />
        <EntryNameRow side={side2} club={side2.clubId ? clubsById.get(side2.clubId) : undefined} />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {hasScore ? (
          <span className="text-sm font-medium tabular-nums">
            {match.score1}-{match.score2}
            {pensLabel}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{es.bracket.matchStatus[match.status]}</span>
        )}
        {match.matchId && (
          <Link
            href={`/g/${groupId}/partidos/${match.matchId}`}
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {es.bracket.goToMatch}
          </Link>
        )}
      </div>
      {admin && (
        <MatchAdminMenu
          groupId={groupId}
          tournamentId={tournamentId}
          tournamentMatchId={match.id}
          status={match.status}
          matchId={match.matchId}
          slot1={{ kind: side1.isBye ? "bye" : side1.entryId ? "entry" : "tbd", entryId: side1.entryId, label: side1.name, isWinner: false }}
          slot2={{ kind: side2.isBye ? "bye" : side2.entryId ? "entry" : "tbd", entryId: side2.entryId, label: side2.name, isWinner: false }}
          initialScore1={match.score1}
          initialScore2={match.score2}
          initialPens1={match.pens1}
          initialPens2={match.pens2}
        />
      )}
    </div>
  );
}

/**
 * Server-safe: groups `tournament_matches` rows by matchday (league / groups_ko group stage),
 * swiss round, or bracket (a fallback for pure single_elim/double_elim KO fixtures, which the
 * `llave` bracket view already covers visually -- this just keeps the "Fechas" tab from looking
 * broken for those formats).
 */
export function FixturesList({
  groupId,
  tournamentId,
  matches,
  entries,
  clubsById = new Map(),
  admin,
}: {
  groupId: string;
  tournamentId: string;
  matches: FixtureMatch[];
  entries: FixtureEntryInfo[];
  clubsById?: Map<string, FixtureClub>;
  admin: boolean;
}) {
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const sections = buildSections(matches);

  if (sections.length === 0) {
    return <p className="text-sm text-muted-foreground">{es.standings.noMatches}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <div key={section.key} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{section.label}</h3>
          <div className="flex flex-col gap-2">
            {section.matches.map((match) => (
              <FixtureRow
                key={match.id}
                groupId={groupId}
                tournamentId={tournamentId}
                match={match}
                entryById={entryById}
                clubsById={clubsById}
                admin={admin}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
