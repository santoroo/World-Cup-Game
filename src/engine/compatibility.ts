// ============================================================================
// Position compatibility — Section 4.
// Decides whether a player can fill a slot and the resulting fit multiplier.
// ============================================================================

import type { Player, Position } from './types';

export const FIT = {
  PERFECT: 1.0,
  SMALL: 0.93,
  MEDIUM: 0.82,
  GENERIC: 0.7,
} as const;

const FULLBACKS: Position[] = ['LB', 'RB'];
const WINGS: Position[] = ['LW', 'RW'];
const CENTRAL_MID: Position[] = ['DM', 'CM', 'AM'];

function inGroup(p: Position, group: Position[]): boolean {
  return group.includes(p);
}

/**
 * Fit between one of a player's positions and a slot position.
 * Returns null when the pairing is forbidden.
 */
function pairFit(playerPos: Position, slotPos: Position): number | null {
  if (playerPos === 'ALL') return FIT.PERFECT;
  if (playerPos === slotPos) return FIT.PERFECT;

  // Goalkeeper rules: only GK (or ALL) in goal; a GK can't play outfield.
  if (slotPos === 'GK') return null; // playerPos !== GK here
  if (playerPos === 'GK') return null;

  // ST ↔ LW/RW: small.
  if (playerPos === 'ST' && inGroup(slotPos, WINGS)) return FIT.SMALL;
  if (inGroup(playerPos, WINGS) && slotPos === 'ST') return FIT.SMALL;

  // Wings interchange (LW ↔ RW): small.
  if (inGroup(playerPos, WINGS) && inGroup(slotPos, WINGS)) return FIT.SMALL;

  // Central midfield: CM ↔ DM and CM ↔ AM are small; DM ↔ AM is medium.
  if (inGroup(playerPos, CENTRAL_MID) && inGroup(slotPos, CENTRAL_MID)) {
    const pair = new Set([playerPos, slotPos]);
    if (pair.has('CM')) return FIT.SMALL;
    return FIT.MEDIUM; // DM ↔ AM
  }

  // Fullbacks interchange (LB ↔ RB): small.
  if (inGroup(playerPos, FULLBACKS) && inGroup(slotPos, FULLBACKS)) return FIT.SMALL;

  // CB → fullback: medium.
  if (playerPos === 'CB' && inGroup(slotPos, FULLBACKS)) return FIT.MEDIUM;
  // Fullback → CB: medium.
  if (inGroup(playerPos, FULLBACKS) && slotPos === 'CB') return FIT.MEDIUM;
  // CB → DM: medium.
  if (playerPos === 'CB' && slotPos === 'DM') return FIT.MEDIUM;

  // AM/CM ↔ wings: medium (inside forwards / inverted wingers).
  if (inGroup(playerPos, ['AM', 'CM']) && inGroup(slotPos, WINGS)) return FIT.MEDIUM;
  if (inGroup(playerPos, WINGS) && inGroup(slotPos, ['AM', 'CM'])) return FIT.MEDIUM;
  // ST ↔ AM: medium.
  if ((playerPos === 'ST' && slotPos === 'AM') || (playerPos === 'AM' && slotPos === 'ST')) return FIT.MEDIUM;
  // Fullback ↔ wing: medium.
  if (inGroup(playerPos, FULLBACKS) && inGroup(slotPos, WINGS)) return FIT.MEDIUM;
  if (inGroup(playerPos, WINGS) && inGroup(slotPos, FULLBACKS)) return FIT.MEDIUM;

  // Anything else outfield: allowed but clumsy.
  return FIT.GENERIC;
}

export interface FitResult {
  allowed: boolean;
  fitMultiplier: number;
  outOfPosition: boolean;
}

/** Best fit across all of a player's listed positions for a given slot. */
export function evaluateFit(player: Player, slotPos: Position): FitResult {
  let best: number | null = null;
  for (const pos of player.positions) {
    const f = pairFit(pos, slotPos);
    if (f !== null && (best === null || f > best)) best = f;
  }
  if (best === null) return { allowed: false, fitMultiplier: 0, outOfPosition: true };
  return { allowed: true, fitMultiplier: best, outOfPosition: best < FIT.PERFECT };
}

/** Can this player legally fill this slot at all? */
export function canFill(player: Player, slotPos: Position): boolean {
  return evaluateFit(player, slotPos).allowed;
}
