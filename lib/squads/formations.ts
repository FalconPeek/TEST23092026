import type { PositionCode } from "@/lib/rating/positions";

export const TEAM_SIZES = [5, 6, 7, 8, 9, 11] as const;
export type TeamSize = (typeof TEAM_SIZES)[number];

/** One place on the pitch. x: 0 (left) → 100 (right); y: 0 (attacking end) → 100 (own goal). */
export interface FormationSlot {
  slot: number;
  position: PositionCode;
  x: number;
  y: number;
}

export interface Formation {
  code: string;
  teamSize: TeamSize;
  slots: FormationSlot[];
}

type Row = [PositionCode, number, number];

function formation(code: string, teamSize: TeamSize, rows: Row[]): Formation {
  return { code, teamSize, slots: rows.map(([position, x, y], slot) => ({ slot, position, x, y })) };
}

const GK: Row = ["POR", 50, 90];

// Small-sided layouts use generic lines; 11-a-side mirrors the usual FC formations.
export const FORMATIONS: Formation[] = [
  formation("2-2", 5, [GK, ["DFC", 30, 66], ["DFC", 70, 66], ["DC", 30, 28], ["DC", 70, 28]]),
  formation("1-2-1", 5, [GK, ["DFC", 50, 68], ["MI", 18, 46], ["MD", 82, 46], ["DC", 50, 22]]),
  formation("2-1-1", 5, [GK, ["DFC", 30, 68], ["DFC", 70, 68], ["MC", 50, 45], ["DC", 50, 22]]),

  formation("2-2-1", 6, [GK, ["DFC", 30, 70], ["DFC", 70, 70], ["MC", 30, 45], ["MC", 70, 45], ["DC", 50, 20]]),
  formation("2-1-2", 6, [GK, ["DFC", 30, 70], ["DFC", 70, 70], ["MC", 50, 48], ["DC", 30, 24], ["DC", 70, 24]]),
  formation("3-2", 6, [GK, ["LI", 18, 66], ["DFC", 50, 70], ["LD", 82, 66], ["DC", 32, 28], ["DC", 68, 28]]),

  formation("2-3-1", 7, [GK, ["DFC", 32, 72], ["DFC", 68, 72], ["MI", 15, 46], ["MC", 50, 50], ["MD", 85, 46], ["DC", 50, 20]]),
  formation("3-2-1", 7, [GK, ["DFC", 20, 70], ["DFC", 50, 74], ["DFC", 80, 70], ["MC", 32, 46], ["MC", 68, 46], ["DC", 50, 20]]),
  formation("2-2-2", 7, [GK, ["DFC", 30, 72], ["DFC", 70, 72], ["MC", 30, 48], ["MC", 70, 48], ["DC", 30, 22], ["DC", 70, 22]]),
  formation("3-1-2", 7, [GK, ["DFC", 20, 70], ["DFC", 50, 74], ["DFC", 80, 70], ["MC", 50, 48], ["DC", 32, 22], ["DC", 68, 22]]),

  formation("3-3-1", 8, [
    GK, ["DFC", 20, 72], ["DFC", 50, 75], ["DFC", 80, 72], ["MI", 15, 46], ["MC", 50, 50], ["MD", 85, 46], ["DC", 50, 20],
  ]),
  formation("3-2-2", 8, [
    GK, ["DFC", 20, 72], ["DFC", 50, 75], ["DFC", 80, 72], ["MC", 32, 48], ["MC", 68, 48], ["DC", 32, 22], ["DC", 68, 22],
  ]),
  formation("2-3-2", 8, [
    GK, ["DFC", 32, 74], ["DFC", 68, 74], ["MI", 15, 48], ["MC", 50, 52], ["MD", 85, 48], ["DC", 32, 22], ["DC", 68, 22],
  ]),

  formation("3-3-2", 9, [
    GK, ["LI", 18, 70], ["DFC", 50, 75], ["LD", 82, 70], ["MI", 18, 46], ["MC", 50, 50], ["MD", 82, 46], ["DC", 32, 20], ["DC", 68, 20],
  ]),
  formation("3-4-1", 9, [
    GK, ["DFC", 22, 72], ["DFC", 50, 75], ["DFC", 78, 72], ["MI", 12, 46], ["MC", 38, 50], ["MC", 62, 50], ["MD", 88, 46], ["DC", 50, 20],
  ]),
  formation("4-3-1", 9, [
    GK, ["LI", 12, 68], ["DFC", 37, 74], ["DFC", 63, 74], ["LD", 88, 68], ["MC", 25, 48], ["MCD", 50, 52], ["MC", 75, 48], ["DC", 50, 20],
  ]),

  formation("4-3-3", 11, [
    GK, ["LI", 12, 70], ["DFC", 37, 76], ["DFC", 63, 76], ["LD", 88, 70],
    ["MC", 28, 50], ["MCD", 50, 56], ["MC", 72, 50], ["EI", 15, 22], ["DC", 50, 16], ["ED", 85, 22],
  ]),
  formation("4-4-2", 11, [
    GK, ["LI", 12, 70], ["DFC", 37, 76], ["DFC", 63, 76], ["LD", 88, 70],
    ["MI", 12, 46], ["MC", 37, 50], ["MC", 63, 50], ["MD", 88, 46], ["DC", 35, 20], ["DC", 65, 20],
  ]),
  formation("4-2-3-1", 11, [
    GK, ["LI", 12, 70], ["DFC", 37, 76], ["DFC", 63, 76], ["LD", 88, 70],
    ["MCD", 35, 56], ["MCD", 65, 56], ["EI", 15, 34], ["MCO", 50, 36], ["ED", 85, 34], ["DC", 50, 15],
  ]),
  formation("3-5-2", 11, [
    GK, ["DFC", 25, 74], ["DFC", 50, 77], ["DFC", 75, 74],
    ["MI", 10, 48], ["MC", 32, 52], ["MCD", 50, 58], ["MC", 68, 52], ["MD", 90, 48], ["DC", 35, 20], ["DC", 65, 20],
  ]),
  formation("4-1-2-1-2", 11, [
    GK, ["LI", 12, 70], ["DFC", 37, 76], ["DFC", 63, 76], ["LD", 88, 70],
    ["MCD", 50, 60], ["MC", 28, 48], ["MC", 72, 48], ["MCO", 50, 36], ["DC", 35, 18], ["DC", 65, 18],
  ]),
  formation("5-3-2", 11, [
    GK, ["CAI", 8, 62], ["DFC", 30, 76], ["DFC", 50, 78], ["DFC", 70, 76], ["CAD", 92, 62],
    ["MC", 28, 48], ["MC", 50, 52], ["MC", 72, 48], ["DC", 35, 20], ["DC", 65, 20],
  ]),
];

export function formationsFor(teamSize: TeamSize): Formation[] {
  return FORMATIONS.filter((f) => f.teamSize === teamSize);
}

export function findFormation(teamSize: TeamSize, code: string): Formation | undefined {
  return FORMATIONS.find((f) => f.teamSize === teamSize && f.code === code);
}

export function defaultFormation(teamSize: TeamSize): Formation {
  return formationsFor(teamSize)[0]!;
}
