// ============================================================================
// Draft / sorteio — Section 8.
// Weighted edition roll (respecting `weight`), pick 1 available player per
// round, auto-assigned to its best-fitting open slot. Deterministic by seed.
// ============================================================================

import { evaluateFit } from './compatibility';
import { FORMATIONS } from './formations';
import { createRng } from './rng';
import type { Edition, Formation, PlacedPlayer, Player, Slot } from './types';

export const MAX_FREE_SKIPS = 3;

export interface DraftState {
  seed: string;
  formation: Formation;
  placed: PlacedPlayer[];
  usedPlayerIds: string[];
  skipsUsed: number;
  rollCount: number;
}

export function createDraft(seed: string, formation: Formation): DraftState {
  return {
    seed,
    formation,
    placed: [],
    usedPlayerIds: [],
    skipsUsed: 0,
    rollCount: 0,
  };
}

export function allSlots(state: DraftState): Slot[] {
  return FORMATIONS[state.formation];
}

export function openSlots(state: DraftState): Slot[] {
  const filled = new Set(state.placed.map((p) => p.slotId));
  return allSlots(state).filter((s) => !filled.has(s.id));
}

export function isComplete(state: DraftState): boolean {
  return state.placed.length === allSlots(state).length;
}

export function progress(state: DraftState): { filled: number; total: number } {
  return { filled: state.placed.length, total: allSlots(state).length };
}

function isUsed(state: DraftState, player: Player): boolean {
  return state.usedPlayerIds.includes(player.id);
}

/** Players of an edition still available AND able to fill at least one open slot. */
export function pickablePlayers(state: DraftState, edition: Edition): Player[] {
  const slots = openSlots(state);
  return edition.players.filter(
    (p) => !isUsed(state, p) && slots.some((s) => evaluateFit(p, s.position).allowed),
  );
}

/** Editions that can still contribute at least one player to an open slot. */
export function availableEditions(state: DraftState, editions: Edition[]): Edition[] {
  return editions.filter((e) => pickablePlayers(state, e).length > 0);
}

/**
 * Roll the die: weighted pick among editions that can still contribute.
 * Returns the chosen edition and the advanced state (rollCount bumped).
 * In Caos mode bonus editions get a heavier weight.
 */
export function roll(
  state: DraftState,
  editions: Edition[],
  opts: { chaos?: boolean } = {},
): { state: DraftState; edition: Edition | null } {
  const pool = availableEditions(state, editions);
  const nextState = { ...state, rollCount: state.rollCount + 1 };
  if (pool.length === 0) return { state: nextState, edition: null };

  const rng = createRng(`${state.seed}#roll#${nextState.rollCount}`);
  const weights = pool.map((e) => {
    if (e.isBonus) return opts.chaos ? e.weight * 3 : e.weight;
    return e.weight;
  });
  const edition = rng.weighted(pool, weights);
  return { state: nextState, edition };
}

/**
 * Best open slot for a player: highest fit, tie-broken by exact primary-position
 * match and then by declared slot order (keeps placement stable/deterministic).
 */
export function bestSlotFor(state: DraftState, player: Player): Slot | null {
  const slots = openSlots(state);
  let best: { slot: Slot; fit: number; exact: boolean } | null = null;
  for (const s of slots) {
    const f = evaluateFit(player, s.position);
    if (!f.allowed) continue;
    const exact = player.positions.includes(s.position) || player.positions.includes('ALL');
    if (
      !best ||
      f.fitMultiplier > best.fit ||
      (f.fitMultiplier === best.fit && exact && !best.exact)
    ) {
      best = { slot: s, fit: f.fitMultiplier, exact };
    }
  }
  return best ? best.slot : null;
}

/** Place a player into a specific slot (must be open and legal). */
export function placeInSlot(state: DraftState, player: Player, slot: Slot): DraftState {
  const fit = evaluateFit(player, slot.position);
  if (!fit.allowed) return state;
  const placed: PlacedPlayer = {
    slotId: slot.id,
    player,
    fitMultiplier: fit.fitMultiplier,
    outOfPosition: fit.outOfPosition,
  };
  return {
    ...state,
    placed: [...state.placed, placed],
    usedPlayerIds: [...state.usedPlayerIds, player.id],
  };
}

/** Choose a player; auto-assigns to their best open slot. */
export function choosePlayer(state: DraftState, player: Player): DraftState {
  const slot = bestSlotFor(state, player);
  if (!slot) return state;
  return placeInSlot(state, player, slot);
}

export function freeSkipsLeft(state: DraftState): number {
  return Math.max(0, MAX_FREE_SKIPS - state.skipsUsed);
}

/** Register a skip (used when the player re-rolls without choosing). */
export function registerSkip(state: DraftState): DraftState {
  return { ...state, skipsUsed: state.skipsUsed + 1 };
}
