import { describe, expect, it } from 'vitest';
import editionsRaw from '../data/editions.json';
import {
  createRng,
  deriveAttributes,
  evaluateFit,
  loadEditions,
  createDraft,
  roll,
  choosePlayer,
  pickablePlayers,
  isComplete,
  computeTeamStrength,
  simulateCampaign,
  FORMATIONS,
  type PlacedPlayer,
  type Formation,
  type RawEdition,
} from './index';

const EDITIONS = loadEditions((editionsRaw as { editions: RawEdition[] }).editions);

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng('abc');
    const b = createRng('abc');
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('differs across seeds', () => {
    const a = Array.from({ length: 5 }, (_, i) => createRng('x').next() + i);
    const b = Array.from({ length: 5 }, (_, i) => createRng('y').next() + i);
    expect(a).not.toEqual(b);
  });
});

describe('attribute derivation (3b)', () => {
  it('derives from overall and position, no upper cap for bonus', () => {
    const st = deriveAttributes({ id: 'x', name: 'X', positions: ['ST'], overall: 100, desc: '' });
    expect(st.attack).toBe(100); // ST attack multiplier is 1.0
    expect(st.goalkeeper).toBe(0); // outfield can't keep
    const monster = deriveAttributes({ id: 'd', name: 'Daniel', positions: ['ALL'], overall: 120, desc: '' });
    expect(monster.attack).toBeGreaterThan(99); // bonus exceeds 99
  });

  it('respects explicit attribute overrides', () => {
    const p = deriveAttributes({ id: 'x', name: 'X', positions: ['ST'], overall: 90, desc: '', defense: 50 });
    expect(p.defense).toBe(50);
  });
});

describe('compatibility (4)', () => {
  it('forbids outfield players in goal and keepers outfield', () => {
    const [ed] = EDITIONS;
    const outfield = ed.players.find((p) => !p.positions.includes('GK'))!;
    expect(evaluateFit(outfield, 'GK').allowed).toBe(false);
  });

  it('lets ALL play anywhere with no penalty', () => {
    const all = EDITIONS.flatMap((e) => e.players).find((p) => p.positions.includes('ALL'))!;
    expect(evaluateFit(all, 'GK').fitMultiplier).toBe(1);
    expect(evaluateFit(all, 'ST').fitMultiplier).toBe(1);
  });
});

describe('draft + simulation', () => {
  it('can complete a full XI deterministically and simulate a campaign', () => {
    let state = createDraft('seed-123', '4-3-3');
    let guard = 0;
    while (!isComplete(state) && guard < 200) {
      guard++;
      const res = roll(state, EDITIONS);
      state = res.state;
      if (!res.edition) break;
      // pick a player that actually fits an open slot (mirrors the UI options)
      const player = pickablePlayers(state, res.edition)[0];
      if (player) state = choosePlayer(state, player);
    }
    expect(isComplete(state)).toBe(true);
    expect(state.placed).toHaveLength(11);

    const strength = computeTeamStrength(state.placed, '4-3-3');
    expect(strength.overall).toBeGreaterThan(0);

    const campaign = simulateCampaign(
      { name: 'Test', flag: '⭐', style: 'equilibrado', strength, placed: state.placed },
      EDITIONS,
      'seed-123',
    );
    // Same seed → same campaign.
    const campaign2 = simulateCampaign(
      { name: 'Test', flag: '⭐', style: 'equilibrado', strength, placed: state.placed },
      EDITIONS,
      'seed-123',
    );
    expect(campaign.goalsFor).toBe(campaign2.goalsFor);
    expect(campaign.matches.length).toBeGreaterThan(0);
    expect(campaign.matches.length).toBeLessThanOrEqual(7);
  });
});

// Build the strongest legal XI directly (no dice) — used to check that a clearly
// superior side is rewarded the way the spec demands.
function buildBestTeam(formation: Formation): PlacedPlayer[] {
  const all = EDITIONS.flatMap((e) => e.players);
  const used = new Set<string>();
  return FORMATIONS[formation].map((slot) => {
    const pick = all
      .filter((p) => !used.has(p.id) && evaluateFit(p, slot.position).allowed)
      .sort((a, b) => {
        const fa = evaluateFit(a, slot.position);
        const fb = evaluateFit(b, slot.position);
        return Number(!fb.outOfPosition) - Number(!fa.outOfPosition) || b.overall - a.overall;
      })[0];
    used.add(pick.id);
    const fit = evaluateFit(pick, slot.position);
    return { slotId: slot.id, player: pick, fitMultiplier: fit.fitMultiplier, outOfPosition: fit.outOfPosition };
  });
}

describe('balance (regression)', () => {
  it('a near-max team dominates and a 7-0 is reachable', () => {
    const placed = buildBestTeam('4-3-3');
    const strength = computeTeamStrength(placed, '4-3-3');
    let champions = 0;
    let sevenNil = 0;
    const RUNS = 80;
    for (let i = 0; i < RUNS; i++) {
      const camp = simulateCampaign(
        { name: 'Max', flag: '⭐', style: 'ofensivo', strength, placed },
        EDITIONS,
        `reg-${i}`,
      );
      if (camp.champion) champions++;
      if (camp.hadSeteAZero) sevenNil++;
    }
    expect(champions).toBeGreaterThan(RUNS * 0.6); // clearly superior → wins most
    expect(sevenNil).toBeGreaterThan(0); // 7-0 raro mas possível
  });
});
