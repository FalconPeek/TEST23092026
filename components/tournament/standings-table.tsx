import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { es } from "@/messages/es";

export interface StandingsRowDisplay {
  entryId: string;
  entryName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  buchholz: number;
  sonnebornBerger: number;
  lot: number | null;
  rank: number;
  qualifies: boolean;
}

const EXTRA_CELL = "hidden text-center tabular-nums sm:table-cell";
const EXTRA_HEAD = "hidden text-center sm:table-cell";

/**
 * Server-safe: `rows` come straight from `computeStandings` (lib/server/tournaments.ts), already
 * ranked and tiebroken -- this component only renders them, no ad-hoc client-side math. Default
 * visible columns at 375px are Pos/Equipo/PJ/DG/Pts; G/E/P/GF/GC and (for swiss) Buch./S-B only
 * show from `sm:`. The table's own container scrolls horizontally on its own if needed, never
 * the page.
 */
export function StandingsTable({
  rows,
  showSwissColumns,
  groupLabel,
}: {
  rows: StandingsRowDisplay[];
  showSwissColumns: boolean;
  groupLabel?: string | null;
}) {
  return (
    <div className="flex flex-col gap-2">
      {groupLabel && <h3 className="text-sm font-medium text-muted-foreground">{es.standings.group(groupLabel)}</h3>}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{es.standings.noMatches}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead title={es.standings.posTitle}>{es.standings.pos}</TableHead>
              <TableHead />
              <TableHead className="text-center" title={es.standings.playedTitle}>
                {es.standings.played}
              </TableHead>
              <TableHead className={EXTRA_HEAD} title={es.standings.winsTitle}>
                {es.standings.wins}
              </TableHead>
              <TableHead className={EXTRA_HEAD} title={es.standings.drawsTitle}>
                {es.standings.draws}
              </TableHead>
              <TableHead className={EXTRA_HEAD} title={es.standings.lossesTitle}>
                {es.standings.losses}
              </TableHead>
              <TableHead className={EXTRA_HEAD} title={es.standings.goalsForTitle}>
                {es.standings.goalsFor}
              </TableHead>
              <TableHead className={EXTRA_HEAD} title={es.standings.goalsAgainstTitle}>
                {es.standings.goalsAgainst}
              </TableHead>
              <TableHead className="text-center" title={es.standings.goalDiffTitle}>
                {es.standings.goalDiff}
              </TableHead>
              <TableHead className="text-center" title={es.standings.pointsTitle}>
                {es.standings.points}
              </TableHead>
              {showSwissColumns && (
                <>
                  <TableHead className={EXTRA_HEAD} title={es.standings.buchholzTitle}>
                    {es.standings.buchholz}
                  </TableHead>
                  <TableHead className={EXTRA_HEAD} title={es.standings.sonnebornBergerTitle}>
                    {es.standings.sonnebornBerger}
                  </TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.entryId} className={row.qualifies ? "border-l-4 border-l-primary" : undefined}>
                <TableCell className="tabular-nums">
                  {row.rank}
                  {row.lot !== null && (
                    <span title={es.standings.lot} className="ml-0.5 text-muted-foreground">
                      *
                    </span>
                  )}
                </TableCell>
                <TableCell className="max-w-28 truncate text-sm">{row.entryName}</TableCell>
                <TableCell className="text-center tabular-nums">{row.played}</TableCell>
                <TableCell className={EXTRA_CELL}>{row.wins}</TableCell>
                <TableCell className={EXTRA_CELL}>{row.draws}</TableCell>
                <TableCell className={EXTRA_CELL}>{row.losses}</TableCell>
                <TableCell className={EXTRA_CELL}>{row.goalsFor}</TableCell>
                <TableCell className={EXTRA_CELL}>{row.goalsAgainst}</TableCell>
                <TableCell className="text-center tabular-nums">{row.goalDiff}</TableCell>
                <TableCell className="text-center font-semibold tabular-nums">{row.points}</TableCell>
                {showSwissColumns && (
                  <>
                    <TableCell className={EXTRA_CELL}>{row.buchholz.toFixed(1)}</TableCell>
                    <TableCell className={EXTRA_CELL}>{row.sonnebornBerger.toFixed(1)}</TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
