// ============================================================================
// Position compatibility — Section 4.
// Decides whether a player can fill a slot and the resulting fit multiplier.
// Only the relationships sanctioned by the spec are allowed; everything else
// is forbidden (you cannot drop a striker into central defence, etc.).
//
// Allowed beyond an exact match (or ALL = wildcard):
//   • front three interchange  ST ↔ LW ↔ RW           (small penalty)
//   • central mids             CM ↔ DM, CM ↔ AM small · DM ↔ AM medium
//   • fullbacks interchange    LB ↔ RB                 (small penalty)
//   • CB ↔ fullback            CB ↔ LB/RB              (medium penalty)
//   • CAM aberto/avançado      AM ↔ LW/RW/ST           (medium penalty)
//   • zagueiro que sai jogando CB ↔ DM                 (medium penalty)
//   • ala (lateral↔ponta)      LB ↔ LW, RB ↔ RW         (medium penalty)
// ============================================================================

import type { Player, Position } from './types';

export const FIT = {
  PERFECT: 1.0,
  SMALL: 0.93,
  MEDIUM: 0.82,
} as const;

const FRONT_THREE: Position[] = ['ST', 'LW', 'RW'];
const CENTRAL_MID: Position[] = ['DM', 'CM', 'AM'];
const FULLBACKS: Position[] = ['LB', 'RB'];

function inGroup(p: Position, group: Position[]): boolean {
  return group.includes(p);
}

/**
 * Fit between one of a player's positions and a slot position.
 * Returns null when the pairing is not allowed.
 */
function pairFit(playerPos: Position, slotPos: Position): number | null {
  if (playerPos === 'ALL') return FIT.PERFECT;
  if (playerPos === slotPos) return FIT.PERFECT;

  // Goalkeeper rules: only GK (or ALL) in goal; a GK can't play outfield.
  if (slotPos === 'GK' || playerPos === 'GK') return null;

  // Front three interchange (ST ↔ LW ↔ RW): small penalty.
  if (inGroup(playerPos, FRONT_THREE) && inGroup(slotPos, FRONT_THREE)) return FIT.SMALL;

  // Central midfield: CM ↔ DM and CM ↔ AM small; DM ↔ AM medium.
  if (inGroup(playerPos, CENTRAL_MID) && inGroup(slotPos, CENTRAL_MID)) {
    return playerPos === 'CM' || slotPos === 'CM' ? FIT.SMALL : FIT.MEDIUM;
  }

  // Fullbacks interchange (LB ↔ RB): small penalty.
  if (inGroup(playerPos, FULLBACKS) && inGroup(slotPos, FULLBACKS)) return FIT.SMALL;

  // Centre-back ↔ fullback: medium penalty (both directions).
  if (playerPos === 'CB' && inGroup(slotPos, FULLBACKS)) return FIT.MEDIUM;
  if (inGroup(playerPos, FULLBACKS) && slotPos === 'CB') return FIT.MEDIUM;

  // Um pouco mais de liberdade — só onde faz sentido no futebol moderno:

  // Meia-atacante (CAM) joga aberto (ponta) ou de centroavante (falso 9 / 2º atacante).
  if (umDosDois(playerPos, slotPos, 'AM', ['LW', 'RW', 'ST'])) return FIT.MEDIUM;

  // Zagueiro que sai jogando vira volante (CDM) — e vice-versa.
  if (umDosDois(playerPos, slotPos, 'CB', ['DM'])) return FIT.MEDIUM;

  // Lateral ↔ ponta do mesmo lado (ala): esquerda com esquerda, direita com direita.
  if (umDosDois(playerPos, slotPos, 'LB', ['LW'])) return FIT.MEDIUM;
  if (umDosDois(playerPos, slotPos, 'RB', ['RW'])) return FIT.MEDIUM;

  // Anything else is not a sensible position — forbidden.
  return null;
}

/** true se {a,b} == {umLado, algum de outroLado} (em qualquer ordem). */
function umDosDois(a: Position, b: Position, umLado: Position, outroLado: Position[]): boolean {
  return (a === umLado && outroLado.includes(b)) || (b === umLado && outroLado.includes(a));
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
