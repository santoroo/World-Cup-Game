// ============================================================================
// Attribute derivation — Section 3b.
// Each player is defined by positions + overall; the 7 attributes are derived
// from the overall via per-position multipliers (unless explicit in the JSON).
// NO upper cap (Colégio Módulo intentionally exceeds 99).
// ============================================================================

import type { Attributes, Position, RawPlayer } from './types';

type Mult = Record<keyof Attributes, number>;

/** Multiplier table (Section 3b). */
const MULTIPLIERS: Record<Position, Mult> = {
  GK: { attack: 0.12, midfield: 0.2, defense: 0.7, goalkeeper: 1.0, technique: 0.7, physical: 0.8, clutch: 0.9 },
  CB: { attack: 0.4, midfield: 0.6, defense: 1.0, goalkeeper: 0.0, technique: 0.7, physical: 0.95, clutch: 0.85 },
  LB: { attack: 0.7, midfield: 0.75, defense: 0.9, goalkeeper: 0.0, technique: 0.8, physical: 0.9, clutch: 0.8 },
  RB: { attack: 0.7, midfield: 0.75, defense: 0.9, goalkeeper: 0.0, technique: 0.8, physical: 0.9, clutch: 0.8 },
  DM: { attack: 0.6, midfield: 1.0, defense: 0.88, goalkeeper: 0.0, technique: 0.8, physical: 0.9, clutch: 0.82 },
  CM: { attack: 0.75, midfield: 1.0, defense: 0.7, goalkeeper: 0.0, technique: 0.9, physical: 0.8, clutch: 0.85 },
  AM: { attack: 0.9, midfield: 0.92, defense: 0.5, goalkeeper: 0.0, technique: 0.95, physical: 0.72, clutch: 0.88 },
  LW: { attack: 0.92, midfield: 0.78, defense: 0.42, goalkeeper: 0.0, technique: 0.92, physical: 0.82, clutch: 0.85 },
  RW: { attack: 0.92, midfield: 0.78, defense: 0.42, goalkeeper: 0.0, technique: 0.92, physical: 0.82, clutch: 0.85 },
  ST: { attack: 1.0, midfield: 0.62, defense: 0.35, goalkeeper: 0.0, technique: 0.86, physical: 0.86, clutch: 0.92 },
  ALL: { attack: 0.95, midfield: 0.95, defense: 0.95, goalkeeper: 0.92, technique: 0.95, physical: 0.95, clutch: 0.95 },
};

const ATTR_KEYS: (keyof Attributes)[] = [
  'attack',
  'midfield',
  'defense',
  'goalkeeper',
  'technique',
  'physical',
  'clutch',
];

/** Average the multipliers across all listed positions (Section 3b). */
export function averagedMultipliers(positions: Position[]): Mult {
  const acc: Mult = { attack: 0, midfield: 0, defense: 0, goalkeeper: 0, technique: 0, physical: 0, clutch: 0 };
  const valid = positions.filter((p) => MULTIPLIERS[p]);
  const list = valid.length ? valid : (['CM'] as Position[]);
  for (const pos of list) {
    const m = MULTIPLIERS[pos];
    for (const k of ATTR_KEYS) acc[k] += m[k];
  }
  for (const k of ATTR_KEYS) acc[k] /= list.length;
  return acc;
}

/**
 * Derive the 7 attributes for a raw player.
 * Explicit values present on the raw player win over derived ones.
 * Rounded, no upper cap.
 */
export function deriveAttributes(raw: RawPlayer): Attributes {
  const mult = averagedMultipliers(raw.positions);
  const out = {} as Attributes;
  for (const k of ATTR_KEYS) {
    out[k] = raw[k] !== undefined ? (raw[k] as number) : Math.round(raw.overall * mult[k]);
  }
  return out;
}

/** Primary position is always the first listed. */
export function primaryPosition(positions: Position[]): Position {
  return positions[0] ?? 'CM';
}
