// Attribute keys and FC 26 face-stat weight tables. Source of truth for every other
// module in lib/rating that needs to know "what is an attribute" or "how do sub-attributes
// roll up into a face stat".

export const OUTFIELD_ATTRIBUTES = [
  "acceleration",
  "sprint_speed",
  "positioning",
  "finishing",
  "shot_power",
  "long_shots",
  "volleys",
  "penalties",
  "vision",
  "crossing",
  "free_kick",
  "short_passing",
  "long_passing",
  "curve",
  "agility",
  "balance",
  "reactions",
  "ball_control",
  "dribbling",
  "composure",
  "interceptions",
  "heading",
  "def_awareness",
  "standing_tackle",
  "sliding_tackle",
  "jumping",
  "stamina",
  "strength",
  "aggression",
] as const;

export const GK_ATTRIBUTES = ["gk_diving", "gk_handling", "gk_kicking", "gk_reflexes", "gk_positioning"] as const;

export const ALL_ATTRIBUTES = [...OUTFIELD_ATTRIBUTES, ...GK_ATTRIBUTES] as const;

export type OutfieldAttributeKey = (typeof OUTFIELD_ATTRIBUTES)[number];
export type GkAttributeKey = (typeof GK_ATTRIBUTES)[number];
export type AttributeKey = (typeof ALL_ATTRIBUTES)[number];

export function isAttributeKey(value: string): value is AttributeKey {
  return (ALL_ATTRIBUTES as readonly string[]).includes(value);
}

export function isGkAttributeKey(value: AttributeKey): value is GkAttributeKey {
  return (GK_ATTRIBUTES as readonly string[]).includes(value);
}

// --- Face stats -------------------------------------------------------------------------

export const OUTFIELD_FACE_STATS = ["pac", "sho", "pas", "dri", "def", "phy"] as const;
export type OutfieldFaceStat = (typeof OUTFIELD_FACE_STATS)[number];

export const GK_FACE_STATS = ["div", "han", "kic", "ref", "pos", "spd"] as const;
export type GkFaceStat = (typeof GK_FACE_STATS)[number];

/** FC 26 face-stat weights over outfield sub-attributes. Every row sums to 1. */
export const FACE_STAT_WEIGHTS: Record<OutfieldFaceStat, Partial<Record<OutfieldAttributeKey, number>>> = {
  pac: { sprint_speed: 0.55, acceleration: 0.45 },
  sho: {
    finishing: 0.45,
    shot_power: 0.2,
    long_shots: 0.2,
    positioning: 0.05,
    volleys: 0.05,
    penalties: 0.05,
  },
  pas: {
    short_passing: 0.35,
    vision: 0.2,
    crossing: 0.2,
    long_passing: 0.15,
    curve: 0.05,
    free_kick: 0.05,
  },
  dri: { dribbling: 0.5, ball_control: 0.35, agility: 0.1, balance: 0.05 },
  def: {
    def_awareness: 0.3,
    standing_tackle: 0.3,
    interceptions: 0.2,
    heading: 0.1,
    sliding_tackle: 0.1,
  },
  phy: { strength: 0.5, stamina: 0.25, aggression: 0.2, jumping: 0.05 },
};

/** Sub-attributes that feed a given face stat (used to expand quick-mode votes). */
export function subAttributesOfFaceStat(faceStat: OutfieldFaceStat): OutfieldAttributeKey[] {
  return Object.keys(FACE_STAT_WEIGHTS[faceStat]) as OutfieldAttributeKey[];
}

/** Quick-mode keys for goalkeeper targets, each mapping 1:1 to a gk_* attribute (SPD isn't
 * votable: it's derived from PAC). */
export const GK_QUICK_KEYS = {
  div: "gk_diving",
  han: "gk_handling",
  kic: "gk_kicking",
  ref: "gk_reflexes",
  pos: "gk_positioning",
} as const satisfies Partial<Record<GkFaceStat, GkAttributeKey>>;
export type GkQuickKey = keyof typeof GK_QUICK_KEYS;

export function isGkQuickKey(value: string): value is GkQuickKey {
  return Object.hasOwn(GK_QUICK_KEYS, value);
}

/** Every key a quick-mode ballot may carry: the 6 outfield face stats plus, for GK targets, the
 * 5 GK quick keys. */
/** Any key a stored scouting ballot row can carry. */
export type ScoutingVoteKey = AttributeKey | OutfieldFaceStat | GkQuickKey;

export const QUICK_VOTE_KEYS = [...OUTFIELD_FACE_STATS, ...(Object.keys(GK_QUICK_KEYS) as GkQuickKey[])] as const;

/**
 * The sub-attributes a stored scouting ballot row affects: a quick outfield face stat expands to
 * every sub-attribute feeding it, a quick GK key to its single gk_* attribute, and a detailed
 * ballot to itself. Returns [] for an unknown key.
 */
export function quickVoteAttributes(key: string): AttributeKey[] {
  if ((OUTFIELD_FACE_STATS as readonly string[]).includes(key)) return subAttributesOfFaceStat(key as OutfieldFaceStat);
  if (isGkQuickKey(key)) return [GK_QUICK_KEYS[key]];
  if (isAttributeKey(key)) return [key];
  return [];
}

/** Compute a single outfield face stat (1-99) from a complete attribute value map. */
export function computeFaceStat(
  faceStat: OutfieldFaceStat,
  attributes: Partial<Record<OutfieldAttributeKey, number>>,
  fallback: number,
): number {
  const weights = FACE_STAT_WEIGHTS[faceStat];
  let sum = 0;
  for (const [attr, weight] of Object.entries(weights)) {
    sum += (attributes[attr as OutfieldAttributeKey] ?? fallback) * weight;
  }
  return sum;
}

/** GK card face stats: DIV/HAN/KIC/REF/POS map 1:1 from gk_*; SPD reuses the PAC formula. */
export function computeGkFaceStats(
  attributes: Partial<Record<AttributeKey, number>>,
  fallback: number,
): Record<GkFaceStat, number> {
  return {
    div: attributes.gk_diving ?? fallback,
    han: attributes.gk_handling ?? fallback,
    kic: attributes.gk_kicking ?? fallback,
    ref: attributes.gk_reflexes ?? fallback,
    pos: attributes.gk_positioning ?? fallback,
    spd: Math.round(computeFaceStat("pac", attributes, fallback)),
  };
}

export function computeOutfieldFaceStats(
  attributes: Partial<Record<AttributeKey, number>>,
  fallback: number,
): Record<OutfieldFaceStat, number> {
  const out = {} as Record<OutfieldFaceStat, number>;
  for (const stat of OUTFIELD_FACE_STATS) {
    // Card face stats are whole numbers, like OVR.
    out[stat] = Math.round(computeFaceStat(stat, attributes, fallback));
  }
  return out;
}
