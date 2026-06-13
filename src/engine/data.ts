// ============================================================================
// Data loading — turns RawEdition[] (editions.json) into resolved Edition[]
// with derived attributes (Section 3b) and edition metadata stamped on players.
// ============================================================================

import { deriveAttributes } from './attributes';
import type { Edition, Player, RawEdition, RawPlayer, Rarity } from './types';

/** Infer a rarity bucket from overall when not provided. */
function inferRarity(overall: number, isBonus: boolean): Rarity {
  if (overall >= (isBonus ? 100 : 95)) return 'lenda';
  if (overall >= 90) return 'craque';
  if (overall >= 82) return 'raro';
  return 'comum';
}

export function resolvePlayer(raw: RawPlayer, edition: RawEdition): Player {
  const attrs = deriveAttributes(raw);
  return {
    id: raw.id,
    name: raw.name,
    positions: raw.positions,
    overall: raw.overall,
    desc: raw.desc,
    rarity: raw.rarity ?? inferRarity(raw.overall, edition.isBonus),
    ...attrs,
    editionId: edition.id,
    country: edition.country,
    flag: edition.flag,
    year: edition.year,
    isBonus: edition.isBonus,
  };
}

export function resolveEdition(raw: RawEdition): Edition {
  return {
    id: raw.id,
    country: raw.country,
    flag: raw.flag,
    year: raw.year,
    strength: raw.strength,
    weight: raw.weight,
    isBonus: raw.isBonus,
    players: raw.players.map((p) => resolvePlayer(p, raw)),
  };
}

export function loadEditions(raw: RawEdition[]): Edition[] {
  return raw
    .filter((e) => e.players && e.players.length > 0) // skip empty (e.g. modulo_2022)
    .map(resolveEdition);
}
