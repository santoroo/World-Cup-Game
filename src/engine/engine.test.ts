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
  placeInSlot,
  movePlayer,
  swapPlayers,
  registerSkip,
  freeSkipsLeft,
  MAX_FREE_SKIPS,
  pickablePlayers,
  isComplete,
  computeTeamStrength,
  simulateCampaign,
  simulateCampaignInterativa,
  simulateMatch,
  FORMATIONS,
  type DirecaoPenalti,
  type PlacedPlayer,
  type Formation,
  type RawEdition,
  type Opponent,
  type TeamStrength,
  type UserTeamInput,
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

  it('only allows sensible cross-position moves; forbids the rest', () => {
    const single = (pos: string) =>
      EDITIONS.flatMap((e) => e.players).find((p) => p.positions.length === 1 && p.positions[0] === pos)!;

    const rb = single('RB');
    expect(evaluateFit(rb, 'RB').allowed).toBe(true); // exact
    expect(evaluateFit(rb, 'LB').allowed).toBe(true); // fullback interchange
    expect(evaluateFit(rb, 'CB').allowed).toBe(true); // CB ↔ fullback
    for (const bad of ['DM', 'CM', 'AM', 'LW', 'RW', 'ST', 'GK'] as const) {
      expect(evaluateFit(rb, bad).allowed).toBe(false);
    }

    const st = single('ST');
    expect(evaluateFit(st, 'LW').allowed).toBe(true); // front three
    expect(evaluateFit(st, 'RW').allowed).toBe(true);
    for (const bad of ['CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'GK'] as const) {
      expect(evaluateFit(st, bad).allowed).toBe(false); // no striker-at-centreback
    }
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

describe('skip limit', () => {
  it('caps skips at MAX_FREE_SKIPS and never goes past it', () => {
    let s = createDraft('skip', '4-3-3');
    for (let i = 0; i < 10; i++) s = registerSkip(s);
    expect(s.skipsUsed).toBe(MAX_FREE_SKIPS);
    expect(freeSkipsLeft(s)).toBe(0);
  });
});

describe('reposition (move / swap)', () => {
  const slot = (id: string) => FORMATIONS['4-3-3'].find((x) => x.id === id)!;
  const player = (pred: (p: PlacedPlayer['player']) => boolean) =>
    EDITIONS.flatMap((e) => e.players).find(pred)!;

  it('moves a placed player to an empty eligible slot, but blocks illegal moves', () => {
    const st = player((p) => p.positions.includes('ST') && !p.positions.includes('GK'));
    let s = createDraft('mv', '4-3-3');
    s = placeInSlot(s, st, slot('ST'));

    const moved = movePlayer(s, 'ST', 'LW'); // ST -> LW is allowed (small penalty)
    expect(moved.placed.find((p) => p.slotId === 'LW')?.player.id).toBe(st.id);
    expect(moved.placed.find((p) => p.slotId === 'ST')).toBeUndefined();

    const blocked = movePlayer(s, 'ST', 'GK'); // outfield -> goal is forbidden
    expect(blocked).toBe(s);
  });

  it('swaps two compatible placed players', () => {
    const cbs = EDITIONS.flatMap((e) => e.players).filter((p) => p.positions.includes('CB')).slice(0, 2);
    let s = createDraft('sw', '4-3-3');
    s = placeInSlot(s, cbs[0], slot('CB1'));
    s = placeInSlot(s, cbs[1], slot('CB2'));
    const swapped = swapPlayers(s, 'CB1', 'CB2');
    expect(swapped.placed.find((p) => p.slotId === 'CB1')?.player.id).toBe(cbs[1].id);
    expect(swapped.placed.find((p) => p.slotId === 'CB2')?.player.id).toBe(cbs[0].id);
  });
});

describe('matchmaking variance (upsets)', () => {
  const team = (ovr: number, chem = 78): TeamStrength => ({
    attack: ovr, midfield: ovr, defense: ovr, goalkeeper: ovr, chemistry: chem,
    overall: ovr, strengths: [], weaknesses: [],
  });
  const oppOf = (ovr: number, chem = 78): Opponent => ({
    id: 'o', name: 'Rival', flag: '⚽', strength: ovr,
    attack: ovr, midfield: ovr, defense: ovr, goalkeeper: ovr, chemistry: chem,
  });
  const userOf = (ovr: number): UserTeamInput => ({
    name: 'U', flag: '⭐', style: 'equilibrado', strength: team(ovr), placed: [],
  });

  function tally(a: number, b: number, runs: number) {
    let win = 0, draw = 0, loss = 0;
    for (let i = 0; i < runs; i++) {
      const m = simulateMatch(userOf(a), oppOf(b), 'Amistoso', `var-${a}-${b}-${i}`);
      if (m.win) win++; else if (m.draw) draw++; else loss++;
    }
    return { win: win / runs, draw: draw / runs, loss: loss / runs };
  }

  it('keeps evenly matched sides a true coin flip', () => {
    const r = tally(85, 85, 2500);
    // Neither side should dominate; both win a healthy share.
    expect(r.win).toBeGreaterThan(0.28);
    expect(r.loss).toBeGreaterThan(0.28);
    expect(Math.abs(r.win - r.loss)).toBeLessThan(0.08);
  });

  it('favours the better team without guaranteeing it (upsets stay possible)', () => {
    const r = tally(95, 85, 2500); // a clear 10-point edge
    expect(r.win).toBeGreaterThan(0.6); // clearly favoured…
    expect(r.win).toBeLessThan(0.85); // …but far from certain
    expect(r.loss).toBeGreaterThan(0.04); // the underdog still wins sometimes
  });

  it('lets a big favourite still drop a match now and then', () => {
    const r = tally(95, 80, 3000); // a heavy 15-point favourite
    expect(r.win).toBeLessThan(0.95); // not a sure thing
    expect(r.win + r.draw).toBeLessThan(0.985); // genuine losses happen
  });
});

describe('red cards (cosmetic)', () => {
  const oppLit = (ovr: number): Opponent => ({
    id: 'o', name: 'Rival', flag: '🏴', strength: ovr,
    attack: ovr, midfield: ovr, defense: ovr, goalkeeper: ovr, chemistry: 75,
  });

  it('are deterministic by seed (same seed → same cards and scoreline)', () => {
    const placed = buildBestTeam('4-3-3');
    const strength = computeTeamStrength(placed, '4-3-3');
    const user: UserTeamInput = { name: 'T', flag: '⭐', style: 'equilibrado', strength, placed };
    const a = simulateMatch(user, oppLit(82), 'X', 'rc-seed');
    const b = simulateMatch(user, oppLit(82), 'X', 'rc-seed');
    expect(a.homeRedCards).toEqual(b.homeRedCards);
    expect(a.awayRedCards).toEqual(b.awayRedCards);
    expect(a.homeGoals).toBe(b.homeGoals);
    expect(a.awayGoals).toBe(b.awayGoals);
  });

  it('do happen sometimes, land in 25–90, and name a real squad member', () => {
    const placed = buildBestTeam('4-3-3');
    const strength = computeTeamStrength(placed, '4-3-3');
    const names = new Set(placed.map((p) => p.player.name));
    let totalHomeReds = 0;
    for (let i = 0; i < 300; i++) {
      const m = simulateMatch(
        { name: 'T', flag: '⭐', style: 'equilibrado', strength, placed },
        oppLit(80),
        'Amistoso',
        `rc-${i}`,
      );
      for (const c of [...m.homeRedCards, ...m.awayRedCards]) {
        expect(c.minute).toBeGreaterThanOrEqual(25);
        expect(c.minute).toBeLessThanOrEqual(90);
      }
      for (const c of m.homeRedCards) {
        expect(names.has(c.name)).toBe(true);
        totalHomeReds++;
      }
    }
    expect(totalHomeReds).toBeGreaterThan(0); // rare, but they occur
  });
});

describe('pênaltis no solo (mata-mata)', () => {
  it('empate no mata-mata vira disputa com sequência e vencedor coerente', () => {
    const placed = buildBestTeam('4-3-3');
    const strength = computeTeamStrength(placed, '4-3-3');
    const user: UserTeamInput = { name: 'U', flag: '⭐', style: 'equilibrado', strength, placed };
    const opp: Opponent = {
      id: 'o', name: 'Rival', flag: '⚽', strength: strength.overall,
      attack: strength.attack, midfield: strength.midfield, defense: strength.defense,
      goalkeeper: strength.goalkeeper, chemistry: strength.chemistry,
    };

    let comPen: ReturnType<typeof simulateMatch> | null = null;
    for (let i = 0; i < 300 && !comPen; i++) {
      const m = simulateMatch(user, opp, 'Final', `solo-pen-${i}`, { knockout: true });
      if (m.penaltis) comPen = m;
    }
    expect(comPen, 'esperava um empate no mata-mata em 300 seeds').not.toBeNull();
    const p = comPen!.penaltis!;
    expect(comPen!.draw).toBe(false); // pênaltis sempre dão um vencedor
    expect(p.historico.length).toBeGreaterThanOrEqual(2);
    expect(p.golsA).not.toBe(p.golsB);
    expect(p.vencedorLado).toBe(comPen!.win ? 'a' : 'b'); // animação bate com o resultado
  });
});

describe('campanha interativa (pênaltis jogáveis no solo)', () => {
  const placed = buildBestTeam('4-3-3');
  const strength = computeTeamStrength(placed, '4-3-3');
  const user: UserTeamInput = { name: 'U', flag: '⭐', style: 'equilibrado', strength, placed };

  /** Acha um seed cuja campanha pause numa disputa de pênaltis (sem escolhas). */
  function seedComDisputa(prefixo: string): string | null {
    for (let i = 0; i < 400; i++) {
      const s = `${prefixo}-${i}`;
      if (simulateCampaignInterativa(user, EDITIONS, s, []).disputa) return s;
    }
    return null;
  }

  it('pausa numa disputa quando faltam escolhas e é determinística', () => {
    const seed = seedComDisputa('int');
    expect(seed, 'esperava um empate no mata-mata em 400 seeds').not.toBeNull();
    const a = simulateCampaignInterativa(user, EDITIONS, seed!, []);
    const b = simulateCampaignInterativa(user, EDITIONS, seed!, []);
    expect(a.disputa).not.toBeNull();
    expect(a.disputa!.partidaId).toBe(b.disputa!.partidaId);
    expect(a.campaign.matches.length).toBe(b.campaign.matches.length);
  });

  it('as escolhas resolvem a disputa, fecham a campanha e são reproduzíveis', () => {
    const seed = seedComDisputa('int2');
    expect(seed).not.toBeNull();
    const escolhas: DirecaoPenalti[] = [];
    let r = simulateCampaignInterativa(user, EDITIONS, seed!, escolhas);
    let guard = 0;
    while (r.disputa && guard++ < 300) {
      escolhas.push('meio'); // o jogador sempre escolhe o meio
      r = simulateCampaignInterativa(user, EDITIONS, seed!, escolhas);
    }
    expect(r.disputa).toBeNull(); // tudo resolvido
    // Determinística por (seed + escolhas) → replay/share reproduz idêntico.
    const r2 = simulateCampaignInterativa(user, EDITIONS, seed!, escolhas);
    expect(JSON.stringify(r2.campaign)).toBe(JSON.stringify(r.campaign));
    // A partida que foi à disputa terminou decidida (sem empate).
    const comPen = r.campaign.matches.find((m) => m.penaltis);
    expect(comPen).toBeTruthy();
    expect(comPen!.draw).toBe(false);
  });
});

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
