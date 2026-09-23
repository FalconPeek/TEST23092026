import { newMatch, setSlot, toMatchMap } from "./propagation";
import { buildRoundRobinMatches } from "./round-robin";
import { nextPow2, standardSeedOrder } from "./seeding";
import { standings } from "./standings";
import { sortMatches } from "./util";
import type { Rng } from "./rng";
import type { TournamentSettings } from "@/lib/settings/tournament";
import { BYE, type ByeMarker, type Entry, type Group, type Match, type QualifierRef, type Stage, type TournamentState } from "./types";

const GROUP_LABELS = "ABCDEFGHIJKLMNOP";

/** Snake distribution: seed 1 -> group0, seed2 -> group1, ..., then reverses each "row". */
function snakeGroups(entries: Entry[], groupCount: number): Entry[][] {
  const sorted = [...entries].sort((a, b) => a.seed - b.seed);
  const groups: Entry[][] = Array.from({ length: groupCount }, () => []);
  let i = 0;
  let row = 0;
  while (i < sorted.length) {
    const forward = row % 2 === 0;
    for (let g = 0; g < groupCount && i < sorted.length; g++) {
      const idx = forward ? g : groupCount - 1 - g;
      groups[idx].push(sorted[i]);
      i++;
    }
    row++;
  }
  return groups;
}

/**
 * Ordered qualifier placeholders for the knockout stage's bracket slots.
 *
 * For the common case (even group count, 2 qualifiers/group) groups are
 * paired into duos; within a duo the 4 slots are laid out as a self-similar
 * mini-bracket (rank1 of A, rank1 of B, rank2 of A, rank2 of B) which,
 * because `standardSeedOrder` is recursively self-similar, reproduces the
 * classic "A1 v B2 / B1 v A2" crossover with each group's two qualifiers
 * landing in opposite halves of the draw.
 *
 * For odd group counts or qualifiers_per_group != 2 we fall back to a
 * simple forward tier assignment (rank1s get the top seeds, rank2s next,
 * etc.) which still guarantees no same-group pairing in round 1 but does
 * not guarantee opposite-halves placement for deep brackets.
 */
function crossoverOrder(groupLabels: string[], qualifiersPerGroup: number): (QualifierRef | ByeMarker)[] {
  const g = groupLabels.length;
  const q = qualifiersPerGroup;
  const seedOf = new Map<string, number>(); // key `${label}#${rank}`
  const key = (label: string, rank: number) => `${label}#${rank}`;

  if (q === 2 && g % 2 === 0) {
    // Each duo gets its own contiguous 4-seed block [4d+1..4d+4]; within the
    // block, seeds 1,2 are the two groups' rank-1s and 3,4 their rank-2s.
    // standardSeedOrder's recursive reflection then keeps each *duo's own*
    // two groups apart (opposite halves) regardless of how many duos there
    // are, because a contiguous 4-seed block is itself a self-similar
    // mini-bracket under the reflection rule.
    for (let d = 0; d < g / 2; d++) {
      const a = groupLabels[2 * d];
      const b = groupLabels[2 * d + 1];
      seedOf.set(key(a, 1), 4 * d + 1);
      seedOf.set(key(b, 1), 4 * d + 2);
      seedOf.set(key(a, 2), 4 * d + 3);
      seedOf.set(key(b, 2), 4 * d + 4);
    }
  } else {
    let seed = 1;
    for (let rank = 1; rank <= q; rank++) {
      for (const label of groupLabels) {
        seedOf.set(key(label, rank), seed++);
      }
    }
  }

  const total = g * q;
  const pow2 = nextPow2(total);
  const order = standardSeedOrder(pow2);
  const bySeed = new Map<number, QualifierRef>();
  for (const [k2, seed] of seedOf) {
    const [label, rankStr] = k2.split("#");
    bySeed.set(seed, { fromGroup: label, rank: Number(rankStr) });
  }
  return order.map((seedNum) => bySeed.get(seedNum) ?? BYE);
}

/**
 * Groups + KO: snake-seeded round-robin groups feeding a knockout bracket.
 * The KO stage is generated up front with qualifier placeholders
 * (`entry1From`/`entry2From`); call `resolveGroupQualifiers` once every
 * group match is completed to fill in real entries (and auto-resolve any
 * knockout byes that result from a non-power-of-two qualifier count).
 */
export function generateGroupsKo(entries: Entry[], settings: TournamentSettings): TournamentState {
  const cfg = settings.groups_ko;
  const groupCount = cfg.group_count;
  const groupStage: Stage = { id: "s1", kind: "group", order: 1 };
  const koStage: Stage = { id: "s2", kind: "knockout", order: 2 };

  const buckets = snakeGroups(entries, groupCount);
  const groups: Group[] = [];
  const matches: Match[] = [];
  const labels: string[] = [];
  buckets.forEach((bucket, idx) => {
    const label = GROUP_LABELS[idx] ?? String(idx + 1);
    labels.push(label);
    const group: Group = { id: `s1-g${label}`, stageId: groupStage.id, number: idx + 1, label };
    groups.push(group);
    matches.push(
      ...buildRoundRobinMatches(bucket, {
        stageId: groupStage.id,
        groupId: group.id,
        bracket: "group",
        idPrefix: `s1-grp${label}`,
        doubleRound: cfg.double_round_robin,
      }),
    );
  });

  const order = crossoverOrder(labels, cfg.qualifiers_per_group);
  const pow2 = order.length;
  const rounds = Math.log2(pow2);
  const koMap = toMatchMap([]);
  const roundMatches: Match[][] = [];

  const round1: Match[] = [];
  for (let i = 0; i < pow2 / 2; i++) {
    const slotA = order[2 * i];
    const slotB = order[2 * i + 1];
    const m = newMatch({
      id: `s2-wb-r1-m${i + 1}`,
      stageId: koStage.id,
      bracket: rounds === 1 ? "final" : "winners",
      round: 1,
      number: i + 1,
      entry1Id: slotA === BYE ? BYE : null,
      entry2Id: slotB === BYE ? BYE : null,
      entry1From: slotA === BYE ? null : slotA,
      entry2From: slotB === BYE ? null : slotB,
    });
    koMap.set(m.id, m);
    round1.push(m);
  }
  roundMatches.push(round1);
  for (let r = 2; r <= rounds; r++) {
    const count = pow2 / 2 ** r;
    const bracket = r === rounds ? "final" : "winners";
    const round: Match[] = [];
    for (let i = 0; i < count; i++) {
      const m = newMatch({ id: `s2-wb-r${r}-m${i + 1}`, stageId: koStage.id, bracket, round: r, number: i + 1 });
      koMap.set(m.id, m);
      round.push(m);
    }
    const prev = roundMatches[r - 2];
    for (let i = 0; i < prev.length; i++) {
      prev[i].nextMatchId = round[Math.floor(i / 2)].id;
      prev[i].nextSlot = ((i % 2) + 1) as 1 | 2;
    }
    roundMatches.push(round);
  }

  if (cfg.third_place && roundMatches.length >= 2) {
    const semis = roundMatches[roundMatches.length - 2];
    if (semis.length === 2) {
      const third = newMatch({ id: "s2-tp-r1-m1", stageId: koStage.id, bracket: "third", round: 1, number: 1 });
      koMap.set(third.id, third);
      semis[0].nextLoserMatchId = third.id;
      semis[0].nextLoserSlot = 1;
      semis[1].nextLoserMatchId = third.id;
      semis[1].nextLoserSlot = 2;
    }
  }

  matches.push(...[...koMap.values()].sort(sortMatches));

  return {
    format: "groups_ko",
    settings,
    entries,
    stages: [groupStage, koStage],
    groups,
    matches: matches.sort(sortMatches),
  };
}

/**
 * Fills knockout qualifier placeholders once their group is complete. Safe
 * to call repeatedly / partially (only groups whose matches are all
 * completed get resolved); returns a new state.
 */
export function resolveGroupQualifiers(state: TournamentState, rng?: Rng): TournamentState {
  const groupStage = state.stages.find((s) => s.kind === "group");
  if (!groupStage) return state;
  const matches = state.matches.map((m) => ({ ...m }));
  const map = toMatchMap(matches);

  const qualifiersByGroup = new Map<string, string[]>();
  for (const group of state.groups) {
    const groupMatches = matches.filter((m) => m.groupId === group.id);
    if (groupMatches.length > 0 && !groupMatches.every((m) => m.status === "completed")) continue;
    // An empty group (group_count larger than the entry pool) is vacuously
    // "done": every qualifier slot from it resolves to BYE.
    const table = standings(groupMatches, state.settings, rng);
    qualifiersByGroup.set(group.label, table.map((row) => row.entryId));
  }

  for (const m of matches) {
    if (m.stageId === groupStage.id) continue;
    if (m.entry1From && m.entry1Id === null) {
      const ranked = qualifiersByGroup.get(m.entry1From.fromGroup);
      if (ranked) setSlot(map, m.id, 1, ranked[m.entry1From.rank - 1] ?? BYE);
    }
    if (m.entry2From && m.entry2Id === null) {
      const ranked = qualifiersByGroup.get(m.entry2From.fromGroup);
      if (ranked) setSlot(map, m.id, 2, ranked[m.entry2From.rank - 1] ?? BYE);
    }
  }

  return { ...state, matches: [...map.values()].sort(sortMatches) };
}
