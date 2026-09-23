// 15 playable positions x weights over sub-attributes, used to compute OVR at a position.
//
// NOTE (deviation from CLAUDE.md wording): CLAUDE.md calls these "FIFA reverse-engineered
// weights". We do not have a verified, licensed source for EA's exact per-position formulas,
// so these tables are an original approximation built from well-known football archetypes
// (e.g. a CB leans on tackling/heading/strength, a winger leans on pace/dribbling/crossing).
// Each row is built from a small set of "emphasis" attributes on top of a flat baseline and
// then normalized to sum to exactly 1 — see `buildOutfieldRow`. If real reference weights
// become available, only the emphasis tables below need to change.

import { GK_ATTRIBUTES, OUTFIELD_ATTRIBUTES, type AttributeKey, type GkAttributeKey, type OutfieldAttributeKey } from "./attributes";

export const POSITIONS = [
  "POR",
  "LI",
  "DFC",
  "LD",
  "CAI",
  "CAD",
  "MCD",
  "MC",
  "MCO",
  "MI",
  "MD",
  "EI",
  "ED",
  "SD",
  "DC",
] as const;

export type PositionCode = (typeof POSITIONS)[number];

export type PositionWeights = Partial<Record<AttributeKey, number>>;

const BASE_WEIGHT = 0.3;

function normalizeRow<K extends string>(raw: Record<K, number>): Record<K, number> {
  const total = Object.values<number>(raw).reduce((a, b) => a + b, 0);
  const out = {} as Record<K, number>;
  for (const key of Object.keys(raw) as K[]) {
    out[key] = raw[key] / total;
  }
  return out;
}

function buildOutfieldRow(emphasis: Partial<Record<OutfieldAttributeKey, number>>): Record<OutfieldAttributeKey, number> {
  const raw = {} as Record<OutfieldAttributeKey, number>;
  for (const attr of OUTFIELD_ATTRIBUTES) {
    raw[attr] = BASE_WEIGHT + (emphasis[attr] ?? 0);
  }
  return normalizeRow(raw);
}

function buildGkRow(emphasis: Partial<Record<GkAttributeKey, number>>): Record<GkAttributeKey, number> {
  const raw = {} as Record<GkAttributeKey, number>;
  for (const attr of GK_ATTRIBUTES) {
    raw[attr] = emphasis[attr] ?? 0;
  }
  return normalizeRow(raw);
}

// Fullback emphasis, mirrored left/right since side does not change the weighting.
const FULLBACK_EMPHASIS: Partial<Record<OutfieldAttributeKey, number>> = {
  standing_tackle: 1.4,
  interceptions: 1.2,
  def_awareness: 1.2,
  sprint_speed: 1.0,
  stamina: 0.9,
  crossing: 0.7,
  sliding_tackle: 0.8,
  reactions: 0.5,
  acceleration: 0.6,
};

// Wing-back: same defensive core as a fullback plus a lot more attacking output.
const WING_BACK_EMPHASIS: Partial<Record<OutfieldAttributeKey, number>> = {
  sprint_speed: 1.2,
  acceleration: 1.0,
  stamina: 1.3,
  crossing: 1.1,
  dribbling: 0.8,
  standing_tackle: 0.9,
  interceptions: 0.8,
  agility: 0.6,
  short_passing: 0.5,
};

const CENTER_BACK_EMPHASIS: Partial<Record<OutfieldAttributeKey, number>> = {
  standing_tackle: 1.5,
  def_awareness: 1.5,
  heading: 1.2,
  strength: 1.1,
  interceptions: 1.1,
  sliding_tackle: 0.9,
  jumping: 0.8,
  reactions: 0.6,
  aggression: 0.5,
};

const DEFENSIVE_MID_EMPHASIS: Partial<Record<OutfieldAttributeKey, number>> = {
  interceptions: 1.3,
  standing_tackle: 1.1,
  def_awareness: 1.1,
  short_passing: 0.9,
  vision: 0.6,
  stamina: 0.8,
  reactions: 0.6,
  aggression: 0.6,
  strength: 0.5,
};

const CENTER_MID_EMPHASIS: Partial<Record<OutfieldAttributeKey, number>> = {
  short_passing: 1.2,
  long_passing: 0.9,
  vision: 1.0,
  stamina: 1.1,
  ball_control: 0.8,
  dribbling: 0.6,
  reactions: 0.6,
  interceptions: 0.5,
  composure: 0.6,
};

const ATTACKING_MID_EMPHASIS: Partial<Record<OutfieldAttributeKey, number>> = {
  vision: 1.3,
  short_passing: 1.1,
  dribbling: 1.0,
  ball_control: 1.0,
  finishing: 0.7,
  positioning: 0.7,
  agility: 0.6,
  composure: 0.7,
  curve: 0.5,
};

// Wide midfielder, mirrored left/right.
const WIDE_MID_EMPHASIS: Partial<Record<OutfieldAttributeKey, number>> = {
  dribbling: 1.1,
  crossing: 1.1,
  sprint_speed: 1.0,
  acceleration: 0.9,
  short_passing: 0.7,
  agility: 0.7,
  stamina: 0.8,
  ball_control: 0.8,
};

// Winger, mirrored left/right.
const WINGER_EMPHASIS: Partial<Record<OutfieldAttributeKey, number>> = {
  sprint_speed: 1.3,
  acceleration: 1.2,
  dribbling: 1.2,
  ball_control: 1.0,
  crossing: 0.8,
  finishing: 0.8,
  agility: 0.8,
  curve: 0.5,
};

const SECOND_STRIKER_EMPHASIS: Partial<Record<OutfieldAttributeKey, number>> = {
  finishing: 1.2,
  positioning: 1.1,
  dribbling: 0.9,
  vision: 0.8,
  ball_control: 0.9,
  shot_power: 0.7,
  composure: 0.8,
  agility: 0.6,
};

const STRIKER_EMPHASIS: Partial<Record<OutfieldAttributeKey, number>> = {
  finishing: 1.5,
  positioning: 1.3,
  shot_power: 1.0,
  heading: 0.9,
  strength: 0.7,
  composure: 0.9,
  reactions: 0.7,
  volleys: 0.6,
  penalties: 0.4,
};

const GOALKEEPER_EMPHASIS: Partial<Record<GkAttributeKey, number>> = {
  gk_reflexes: 30,
  gk_diving: 25,
  gk_positioning: 20,
  gk_handling: 20,
  gk_kicking: 5,
};

export const POSITION_WEIGHTS: Record<PositionCode, PositionWeights> = {
  POR: buildGkRow(GOALKEEPER_EMPHASIS),
  LI: buildOutfieldRow(FULLBACK_EMPHASIS),
  DFC: buildOutfieldRow(CENTER_BACK_EMPHASIS),
  LD: buildOutfieldRow(FULLBACK_EMPHASIS),
  CAI: buildOutfieldRow(WING_BACK_EMPHASIS),
  CAD: buildOutfieldRow(WING_BACK_EMPHASIS),
  MCD: buildOutfieldRow(DEFENSIVE_MID_EMPHASIS),
  MC: buildOutfieldRow(CENTER_MID_EMPHASIS),
  MCO: buildOutfieldRow(ATTACKING_MID_EMPHASIS),
  MI: buildOutfieldRow(WIDE_MID_EMPHASIS),
  MD: buildOutfieldRow(WIDE_MID_EMPHASIS),
  EI: buildOutfieldRow(WINGER_EMPHASIS),
  ED: buildOutfieldRow(WINGER_EMPHASIS),
  SD: buildOutfieldRow(SECOND_STRIKER_EMPHASIS),
  DC: buildOutfieldRow(STRIKER_EMPHASIS),
};

export function isGoalkeeperPosition(position: PositionCode): boolean {
  return position === "POR";
}

/** OVR(pos) = round(sum(weight * attribute value)); missing attributes fall back to `fallback`. */
export function computeOvr(position: PositionCode, attributes: Partial<Record<AttributeKey, number>>, fallback: number): number {
  const weights = POSITION_WEIGHTS[position];
  let sum = 0;
  for (const [attr, weight] of Object.entries(weights)) {
    sum += (attributes[attr as AttributeKey] ?? fallback) * (weight as number);
  }
  return Math.round(sum);
}

/** Top-N highest-weighted attributes for a position — used by form.ts to target form adjustments. */
export function topAttributesForPosition(position: PositionCode, n: number): AttributeKey[] {
  const weights = POSITION_WEIGHTS[position];
  return (Object.entries(weights) as [AttributeKey, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([attr]) => attr);
}
