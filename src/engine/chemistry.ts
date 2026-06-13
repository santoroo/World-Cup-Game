// ============================================================================
// Team strength & chemistry — Section 9.
// Consumes the placed XI and produces the consolidated ratings + chemistry,
// plus textual strengths/weaknesses for the UI. No upper cap on ratings
// (bonus teams may exceed 99).
// ============================================================================

import { FORMATIONS } from './formations';
import type { Formation, PlacedPlayer, Position, Slot, TeamStrength } from './types';

const ATTACK_SLOTS: Position[] = ['ST', 'LW', 'RW'];
const MID_SLOTS: Position[] = ['DM', 'CM', 'AM'];
const DEF_SLOTS: Position[] = ['CB', 'LB', 'RB'];

interface Grouped {
  gk: PlacedPlayer | null;
  defenders: PlacedPlayer[];
  mids: PlacedPlayer[];
  attackers: PlacedPlayer[];
}

function slotMap(formation: Formation): Map<string, Slot> {
  return new Map(FORMATIONS[formation].map((s) => [s.id, s]));
}

function group(placed: PlacedPlayer[], formation: Formation): Grouped {
  const slots = slotMap(formation);
  const g: Grouped = { gk: null, defenders: [], mids: [], attackers: [] };
  for (const p of placed) {
    const slot = slots.get(p.slotId);
    if (!slot) continue;
    if (slot.position === 'GK') g.gk = p;
    else if (DEF_SLOTS.includes(slot.position)) g.defenders.push(p);
    else if (MID_SLOTS.includes(slot.position)) g.mids.push(p);
    else if (ATTACK_SLOTS.includes(slot.position)) g.attackers.push(p);
  }
  return g;
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Effective stat = raw attribute * fit multiplier (out-of-position drag). */
function eff(p: PlacedPlayer, attr: keyof PlacedPlayer['player']): number {
  return (p.player[attr] as number) * p.fitMultiplier;
}

function isAttackingMid(p: PlacedPlayer, formation: Formation): boolean {
  const slot = slotMap(formation).get(p.slotId);
  return slot?.position === 'AM';
}

export function computeChemistry(placed: PlacedPlayer[], formation: Formation): number {
  if (placed.length === 0) return 0;
  let chem = 48; // base

  // Same country clustering.
  const byCountry = new Map<string, number>();
  for (const p of placed) byCountry.set(p.player.country, (byCountry.get(p.player.country) ?? 0) + 1);
  let countryBonus = 0;
  for (const count of byCountry.values()) if (count > 1) countryBonus += (count - 1) * 3.2;
  chem += Math.min(26, countryBonus);

  // Same era / decade clustering.
  const byDecade = new Map<number, number>();
  for (const p of placed) {
    const decade = Math.floor(p.player.year / 10) * 10;
    byDecade.set(decade, (byDecade.get(decade) ?? 0) + 1);
  }
  let decadeBonus = 0;
  for (const count of byDecade.values()) if (count > 1) decadeBonus += (count - 1) * 1.8;
  chem += Math.min(16, decadeBonus);

  // Everyone in position vs. out-of-position penalty.
  const outOfPos = placed.filter((p) => p.outOfPosition).length;
  if (outOfPos === 0 && placed.length === FORMATIONS[formation].length) chem += 12;
  chem -= outOfPos * 4;

  // Coherent formation (a fully-filled valid formation).
  if (placed.length === FORMATIONS[formation].length) chem += 5;

  // Captain / leader: highest clutch on the team.
  const maxClutch = Math.max(...placed.map((p) => p.player.clutch));
  chem += maxClutch >= 92 ? 6 : maxClutch >= 85 ? 3 : 1;

  return Math.max(0, Math.min(100, Math.round(chem)));
}

export function computeTeamStrength(placed: PlacedPlayer[], formation: Formation): TeamStrength {
  const g = group(placed, formation);

  // Attack: mean of attackers' attack + bonus from attacking midfielders.
  const attackBase = mean(g.attackers.map((p) => eff(p, 'attack')));
  const amBonus = mean(g.mids.filter((p) => isAttackingMid(p, formation)).map((p) => eff(p, 'attack'))) * 0.12;
  const attack = Math.round(attackBase + (Number.isFinite(amBonus) ? amBonus : 0));

  // Midfield: mean of midfielders' midfield.
  const midfield = Math.round(mean(g.mids.map((p) => eff(p, 'midfield'))));

  // Defense: mean of defenders' defense blended with the keeper's weight.
  const defBase = mean(g.defenders.map((p) => eff(p, 'defense')));
  const gkVal = g.gk ? eff(g.gk, 'goalkeeper') : 0;
  const defense = Math.round(defBase * 0.85 + gkVal * 0.15);

  const goalkeeper = Math.round(gkVal);
  const chemistry = computeChemistry(placed, formation);

  // Weighted team overall (no cap).
  const overall = Math.round(
    attack * 0.25 + midfield * 0.22 + defense * 0.25 + goalkeeper * 0.12 + chemistry * 0.16,
  );

  const { strengths, weaknesses } = describe({ attack, midfield, defense, goalkeeper, chemistry });

  return { attack, midfield, defense, goalkeeper, chemistry, overall, strengths, weaknesses };
}

function describe(s: {
  attack: number;
  midfield: number;
  defense: number;
  goalkeeper: number;
  chemistry: number;
}): { strengths: string[]; weaknesses: string[] } {
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (s.attack >= 88) strengths.push('Esse ataque mete medo.');
  else if (s.attack < 70) weaknesses.push('O ataque promete pouco gol.');

  if (s.midfield >= 86) strengths.push('Meio-campo dono da bola.');
  else if (s.midfield < 68) weaknesses.push('Meio-campo apagado.');

  if (s.defense >= 86) strengths.push('Defesa de ferro.');
  else if (s.defense < 70) weaknesses.push('A defesa tá pedindo arrego.');

  if (s.goalkeeper >= 88) strengths.push('Paredão no gol.');
  else if (s.goalkeeper < 72) weaknesses.push('Goleiro inseguro.');

  if (s.chemistry >= 82) strengths.push('Time entrosado de verdade.');
  else if (s.chemistry < 60) weaknesses.push('Falta entrosamento.');

  if (strengths.length === 0) strengths.push('Time equilibrado, sem grandes furos.');
  if (weaknesses.length === 0) weaknesses.push('Difícil achar um ponto fraco.');

  return { strengths, weaknesses };
}
