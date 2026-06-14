// Rótulo (nome + ícone) de um competidor do torneio online: humano (avatar/nome)
// ou seleção da CPU (`cpu:<editionId>` → bandeira/nome da edição).

import type { MpPlayer } from '../engine';
import { EDITIONS } from './editions';

const PREFIXO_CPU = 'cpu:';

export function ehHumanoId(id: string): boolean {
  return !id.startsWith(PREFIXO_CPU);
}

export function rotuloCompetidor(id: string, jogadores: MpPlayer[]): { nome: string; icon: string } {
  if (id.startsWith(PREFIXO_CPU)) {
    const ed = EDITIONS.find((e) => e.id === id.slice(PREFIXO_CPU.length));
    return ed ? { nome: `${ed.country} ${ed.year}`, icon: ed.flag } : { nome: '?', icon: '🏳️' };
  }
  const p = jogadores.find((x) => x.id === id);
  return { nome: p?.name ?? '?', icon: p?.avatar ?? '⚽' };
}
