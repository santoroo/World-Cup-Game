// Loads the curated database and resolves it into engine editions (derived
// attributes applied). Memoised module-level so it only runs once.

import editionsRaw from '../data/editions.json';
import { loadEditions, type Edition, type RawEdition } from '../engine';

interface EditionsFile {
  editions: RawEdition[];
}

export const EDITIONS: Edition[] = loadEditions((editionsRaw as EditionsFile).editions);

export const REAL_EDITIONS = EDITIONS.filter((e) => !e.isBonus);
export const BONUS_EDITIONS = EDITIONS.filter((e) => e.isBonus);
