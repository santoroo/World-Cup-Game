// ============================================================================
// Formations — Section 5. Each formation declares its 11 slots with the
// position requested and a relative pitch coordinate (x,y in 0..100).
// y = 0 is the attacking line (top), y = 100 is our own goal (bottom).
// ============================================================================

import type { Formation, Position, Slot } from './types';

function slot(id: string, position: Position, x: number, y: number, label?: string): Slot {
  return { id, position, x, y, label: label ?? position };
}

export const FORMATIONS: Record<Formation, Slot[]> = {
  '4-3-3': [
    slot('GK', 'GK', 50, 92),
    slot('LB', 'LB', 16, 70),
    slot('CB1', 'CB', 38, 74),
    slot('CB2', 'CB', 62, 74),
    slot('RB', 'RB', 84, 70),
    slot('DM', 'DM', 50, 56),
    slot('CM', 'CM', 28, 48),
    slot('AM', 'AM', 72, 46),
    slot('LW', 'LW', 18, 22),
    slot('ST', 'ST', 50, 15),
    slot('RW', 'RW', 82, 22),
  ],
  '4-4-2': [
    slot('GK', 'GK', 50, 92),
    slot('LB', 'LB', 14, 70),
    slot('CB1', 'CB', 38, 74),
    slot('CB2', 'CB', 62, 74),
    slot('RB', 'RB', 86, 70),
    slot('LM', 'LW', 14, 46, 'LM'),
    slot('CM1', 'CM', 38, 50),
    slot('CM2', 'CM', 62, 50),
    slot('RM', 'RW', 86, 46, 'RM'),
    slot('ST1', 'ST', 36, 18),
    slot('ST2', 'ST', 64, 18),
  ],
  '3-5-2': [
    slot('GK', 'GK', 50, 92),
    slot('CB1', 'CB', 28, 75),
    slot('CB2', 'CB', 50, 78),
    slot('CB3', 'CB', 72, 75),
    slot('LWB', 'LB', 10, 52, 'LWB'),
    slot('DM', 'DM', 36, 56),
    slot('CM', 'CM', 50, 50),
    slot('AM', 'AM', 64, 46),
    slot('RWB', 'RB', 90, 52, 'RWB'),
    slot('ST1', 'ST', 38, 16),
    slot('ST2', 'ST', 62, 16),
  ],
  '4-2-3-1': [
    slot('GK', 'GK', 50, 92),
    slot('LB', 'LB', 14, 70),
    slot('CB1', 'CB', 38, 74),
    slot('CB2', 'CB', 62, 74),
    slot('RB', 'RB', 86, 70),
    slot('DM1', 'DM', 36, 58),
    slot('DM2', 'DM', 64, 58),
    slot('LW', 'LW', 20, 38),
    slot('AM', 'AM', 50, 34),
    slot('RW', 'RW', 80, 38),
    slot('ST', 'ST', 50, 14),
  ],
  '3-4-3': [
    slot('GK', 'GK', 50, 92),
    slot('CB1', 'CB', 28, 75),
    slot('CB2', 'CB', 50, 78),
    slot('CB3', 'CB', 72, 75),
    slot('DM', 'DM', 50, 58),
    slot('CM1', 'CM', 28, 50),
    slot('CM2', 'CM', 72, 50),
    slot('AM', 'AM', 50, 40),
    slot('LW', 'LW', 18, 20),
    slot('ST', 'ST', 50, 14),
    slot('RW', 'RW', 82, 20),
  ],
};

export const FORMATION_LIST: Formation[] = ['4-3-3', '4-4-2', '3-5-2', '4-2-3-1', '3-4-3'];

/** How many slots request each position, for "remaining slots" hints. */
export function slotPositionCounts(formation: Formation): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of FORMATIONS[formation]) {
    counts[s.position] = (counts[s.position] ?? 0) + 1;
  }
  return counts;
}
