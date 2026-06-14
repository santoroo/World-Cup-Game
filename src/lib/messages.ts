// Tone / copy helpers — Section 14. All original messages.

import type { Rng } from '../engine';

export const ROLL_PROMPTS = [
  'Role o dado e torça por um elencão.',
  'Bola rolando — quem vem dessa vez?',
  'Sorte é parte do jogo. Manda ver!',
  'Cruza os dedos e rola o dado.',
];

export const PICK_PROMPTS = [
  'Escolha sua carta com sabedoria.',
  'Quem entra pro time dos sonhos?',
  'Monte seu time, peça por peça.',
];

export function pick<T>(arr: readonly T[], rng?: Rng): T {
  if (rng) return rng.pick(arr);
  return arr[Math.floor(Math.random() * arr.length)];
}

export function rarityLabel(rarity: string): string {
  switch (rarity) {
    case 'lenda':
      return 'Lenda';
    case 'craque':
      return 'Craque';
    case 'raro':
      return 'Raro';
    default:
      return 'Comum';
  }
}

/** Sigla curta exibida da posição (CDM/CAM em vez de DM/AM; CORINGA p/ ALL). */
export function siglaPosicao(pos: string): string {
  if (pos === 'DM') return 'CDM';
  if (pos === 'AM') return 'CAM';
  if (pos === 'ALL') return 'CORINGA';
  return pos;
}

export function positionLabel(pos: string): string {
  const map: Record<string, string> = {
    GK: 'Goleiro',
    CB: 'Zagueiro',
    LB: 'Lateral-E',
    RB: 'Lateral-D',
    DM: 'Volante',
    CM: 'Meio',
    AM: 'Meia of.',
    LW: 'Ponta-E',
    RW: 'Ponta-D',
    ST: 'Centroavante',
    ALL: 'Coringa',
  };
  return map[pos] ?? pos;
}
