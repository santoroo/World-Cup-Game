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
