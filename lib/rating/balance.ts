// Splits players into `teamCount` balanced teams: snake draft on OpenSkill mu (tie-break OVR,
// then an rng-shuffled deterministic order for genuine ties), followed by a local swap search
// minimizing the spread of team strength. Optionally keeps at most one GK per team.

export interface BalancePlayer {
  id: string;
  mu: number;
  ovr: number;
  isGk?: boolean;
}

export interface BalancedTeam {
  playerIds: string[];
  sumMu: number;
  sumOvr: number;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Standard snake draft: team order 0..k-1, k-1..0, 0..k-1, ... */
function snakeDraft<T>(sorted: T[], teamCount: number): T[][] {
  const teams: T[][] = Array.from({ length: teamCount }, () => []);
  let team = 0;
  let dir = 1;
  for (const item of sorted) {
    teams[team].push(item);
    if (dir === 1) {
      if (team === teamCount - 1) dir = -1;
      else team += 1;
    } else if (team === 0) {
      dir = 1;
    } else {
      team -= 1;
    }
  }
  return teams;
}

function teamSums(team: BalancePlayer[]): { mu: number; ovr: number } {
  return {
    mu: team.reduce((a, p) => a + p.mu, 0),
    ovr: team.reduce((a, p) => a + p.ovr, 0),
  };
}

/** [range of team mu sums, range of team ovr sums] — lexicographic cost, lower is better. */
function cost(teams: BalancePlayer[][]): [number, number] {
  const sums = teams.map(teamSums);
  const mus = sums.map((s) => s.mu);
  const ovrs = sums.map((s) => s.ovr);
  return [Math.max(...mus) - Math.min(...mus), Math.max(...ovrs) - Math.min(...ovrs)];
}

function costLess(a: [number, number], b: [number, number]): boolean {
  const EPS = 1e-9;
  if (a[0] < b[0] - EPS) return true;
  if (a[0] > b[0] + EPS) return false;
  return a[1] < b[1] - EPS;
}

function gkCount(team: BalancePlayer[]): number {
  return team.filter((p) => p.isGk).length;
}

/** A swap must not push a team's GK count above 1 unless it was already above 1 (best effort). */
function swapAllowedByGkConstraint(teamA: BalancePlayer[], teamB: BalancePlayer[], a: BalancePlayer, b: BalancePlayer): boolean {
  const gkA = gkCount(teamA);
  const gkB = gkCount(teamB);
  const newGkA = gkA - (a.isGk ? 1 : 0) + (b.isGk ? 1 : 0);
  const newGkB = gkB - (b.isGk ? 1 : 0) + (a.isGk ? 1 : 0);
  const worseA = newGkA > 1 && newGkA > gkA;
  const worseB = newGkB > 1 && newGkB > gkB;
  return !worseA && !worseB;
}

/** Scans all cross-team pairs for the first swap that strictly improves cost; applies it in place. */
function tryImprovingSwap(teams: BalancePlayer[][], currentCost: [number, number]): boolean {
  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      for (let pi = 0; pi < teams[i].length; pi += 1) {
        for (let pj = 0; pj < teams[j].length; pj += 1) {
          const a = teams[i][pi];
          const b = teams[j][pj];
          if (!swapAllowedByGkConstraint(teams[i], teams[j], a, b)) continue;

          teams[i][pi] = b;
          teams[j][pj] = a;
          if (costLess(cost(teams), currentCost)) return true;
          teams[i][pi] = a;
          teams[j][pj] = b; // revert, no improvement
        }
      }
    }
  }
  return false;
}

export function balanceTeams(
  players: BalancePlayer[],
  teamCount: number,
  rng: () => number,
  maxSwapIterations = 500,
): BalancedTeam[] {
  if (teamCount < 1) throw new Error("balanceTeams: teamCount must be >= 1");
  if (players.length === 0) return Array.from({ length: teamCount }, () => ({ playerIds: [], sumMu: 0, sumOvr: 0 }));

  const sorted = shuffle(players, rng).sort((a, b) => b.mu - a.mu || b.ovr - a.ovr);
  const gks = sorted.filter((p) => p.isGk);
  const outfield = sorted.filter((p) => !p.isGk);

  const gkTeams = snakeDraft(gks, teamCount);
  const outfieldTeams = snakeDraft(outfield, teamCount);
  const teams: BalancePlayer[][] = gkTeams.map((gkTeam, i) => [...gkTeam, ...outfieldTeams[i]]);

  let currentCost = cost(teams);
  let iterations = 0;
  while (iterations < maxSwapIterations && tryImprovingSwap(teams, currentCost)) {
    currentCost = cost(teams);
    iterations += 1;
  }

  return teams.map((team) => {
    const sums = teamSums(team);
    return { playerIds: team.map((p) => p.id), sumMu: sums.mu, sumOvr: sums.ovr };
  });
}
