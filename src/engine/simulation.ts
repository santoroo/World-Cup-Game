// ============================================================================
// Match & campaign simulation — Section 10.
// xG-driven, Poisson-sampled scorelines with seed-controlled luck.
// Opponents are drawn from the real historical editions for flavour.
// Ratings are never capped at 99 (bonus teams can run up the score).
// ============================================================================

import { createRng, type Rng } from './rng';
import type {
  CampaignResult,
  Edition,
  MatchResult,
  Opponent,
  PlacedPlayer,
  PlayStyle,
  Scorer,
  TeamStrength,
} from './types';

const STYLE: Record<PlayStyle, { atk: number; def: number }> = {
  defensivo: { atk: 0.9, def: 1.12 },
  equilibrado: { atk: 1.0, def: 1.0 },
  ofensivo: { atk: 1.13, def: 0.9 },
};

export const CAMPAIGN_STAGES = [
  'Grupos · Jogo 1',
  'Grupos · Jogo 2',
  'Grupos · Jogo 3',
  'Oitavas de final',
  'Quartas de final',
  'Semifinal',
  'Final',
] as const;

export interface UserTeamInput {
  name: string;
  flag: string;
  style: PlayStyle;
  strength: TeamStrength;
  placed: PlacedPlayer[];
}

function teamOverall(s: {
  attack: number;
  midfield: number;
  defense: number;
  goalkeeper: number;
  chemistry: number;
}): number {
  return s.attack * 0.25 + s.midfield * 0.22 + s.defense * 0.25 + s.goalkeeper * 0.12 + s.chemistry * 0.16;
}

/** Build an opponent from a real edition, scaled a touch by stage difficulty. */
export function opponentFromEdition(edition: Edition, rng: Rng, stageBoost = 0): Opponent {
  const s = edition.strength + stageBoost;
  return {
    id: edition.id,
    name: `${edition.country} ${edition.year}`,
    flag: edition.flag,
    strength: s,
    attack: Math.round(s + rng.range(-3, 3)),
    midfield: Math.round(s - 1 + rng.range(-3, 3)),
    defense: Math.round(s - 1 + rng.range(-3, 3)),
    goalkeeper: Math.round(s - 2 + rng.range(-3, 3)),
    chemistry: Math.round(80 + rng.range(-6, 12)),
  };
}

/** Knuth's Poisson sampler driven by the seeded RNG. */
function poisson(lambda: number, rng: Rng): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > L);
  return k - 1;
}

function offensiveIndex(s: { attack: number; midfield: number; chemistry: number }): number {
  return s.attack * 0.45 + s.midfield * 0.3 + s.chemistry * 0.25;
}
function defensiveIndex(s: { defense: number; goalkeeper: number }): number {
  return s.defense * 0.55 + s.goalkeeper * 0.45;
}

function expectedGoals(offIndex: number, defIndex: number, styleAtk: number, styleDef: number): number {
  const diff = offIndex * styleAtk - defIndex * styleDef;
  return Math.max(0.12, Math.min(7.2, 1.3 + diff * 0.075));
}

/** Pull chemistry toward consistency: high chem teams swing less. */
function applyConsistency(goals: number, lambda: number, chemistry: number): number {
  const pull = 0.28 * (chemistry / 100);
  return Math.round(goals * (1 - pull) + lambda * pull);
}

function assignScorers(placed: PlacedPlayer[], count: number, rng: Rng): Scorer[] {
  if (count <= 0) return [];
  // Weight by attacking output + clutch; attackers score most.
  const pool = placed.map((p) => ({
    name: p.player.name,
    weight: Math.max(1, p.player.attack * 0.7 + p.player.clutch * 0.3),
  }));
  const scorers: Scorer[] = [];
  const minutes = new Set<number>();
  for (let i = 0; i < count; i++) {
    const name = rng.weighted(
      pool.map((p) => p.name),
      pool.map((p) => p.weight),
    );
    let minute = rng.int(1, 90);
    while (minutes.has(minute)) minute = rng.int(1, 90);
    minutes.add(minute);
    scorers.push({ name, minute });
  }
  return scorers.sort((a, b) => a.minute - b.minute);
}

function opponentScorers(opp: Opponent, count: number, rng: Rng): Scorer[] {
  const scorers: Scorer[] = [];
  const minutes = new Set<number>();
  for (let i = 0; i < count; i++) {
    let minute = rng.int(1, 90);
    while (minutes.has(minute)) minute = rng.int(1, 90);
    minutes.add(minute);
    scorers.push({ name: `${opp.flag} nº ${rng.int(7, 11)}`, minute });
  }
  return scorers.sort((a, b) => a.minute - b.minute);
}

function matchBlurb(home: number, away: number, win: boolean, draw: boolean): string {
  const diff = home - away;
  if (home >= 7 && away === 0) return 'Humilhação pra história. 7 a 0 é lenda!';
  if (diff >= 5) return 'Goleada histórica, sem dó.';
  if (diff >= 3) return 'Passeio dentro de campo.';
  if (win && away === 0) return 'Vitória segura, defesa intransponível.';
  if (win) return 'Suado, mas três pontos no bolso.';
  if (draw) return 'Ficou no empate, dá pra melhorar.';
  if (diff <= -4) return 'Tomou um caldo. Dia pra esquecer.';
  return 'Derrota amarga, faltou capricho.';
}

export function simulateMatch(
  user: UserTeamInput,
  opp: Opponent,
  stage: string,
  seed: string,
  opts: { knockout?: boolean } = {},
): MatchResult {
  const rng = createRng(seed);
  const style = STYLE[user.style];

  const offA = offensiveIndex(user.strength);
  const defA = defensiveIndex(user.strength);
  const offB = offensiveIndex(opp);
  const defB = defensiveIndex(opp);

  const lambdaA = expectedGoals(offA, defB, style.atk, style.def);
  const lambdaB = expectedGoals(offB, defA, 1.0, 1.0);

  let homeGoals = applyConsistency(poisson(lambdaA, rng), lambdaA, user.strength.chemistry);
  let awayGoals = applyConsistency(poisson(lambdaB, rng), lambdaB, opp.chemistry);
  homeGoals = Math.max(0, Math.min(9, homeGoals));
  awayGoals = Math.max(0, Math.min(9, awayGoals));

  let win = homeGoals > awayGoals;
  let draw = homeGoals === awayGoals;
  let penalties: string | null = null;

  // Knockouts can't end level: resolve on penalties weighted by overall.
  if (draw && opts.knockout) {
    const ovA = teamOverall(user.strength);
    const ovB = teamOverall(opp);
    const prob = Math.max(0.15, Math.min(0.85, 0.5 + (ovA - ovB) / 120));
    const userWon = rng.chance(prob);
    win = userWon;
    draw = false;
    penalties = userWon ? 'Vitória nos pênaltis!' : 'Eliminado nos pênaltis.';
  }

  const homeScorers = assignScorers(user.placed, homeGoals, rng);
  const awayScorers = opponentScorers(opp, awayGoals, rng);

  // Man of the match.
  let motm: string;
  if (homeGoals > 0 && win) {
    const tally = new Map<string, number>();
    for (const s of homeScorers) tally.set(s.name, (tally.get(s.name) ?? 0) + 1);
    motm = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
  } else {
    const best = [...user.placed].sort((a, b) => b.player.overall - a.player.overall)[0];
    motm = best ? best.player.name : user.name;
  }

  const blurb = penalties ? `${matchBlurb(homeGoals, awayGoals, win, false)} ${penalties}` : matchBlurb(homeGoals, awayGoals, win, draw);

  return { stage, opponent: opp, homeGoals, awayGoals, homeScorers, awayScorers, manOfTheMatch: motm, blurb, win, draw };
}

/** Pick 7 opponents from real editions with rising difficulty per stage. */
export function pickOpponents(editions: Edition[], seed: string): Opponent[] {
  const rng = createRng(`${seed}#opps`);
  const reals = editions.filter((e) => !e.isBonus);
  const sorted = [...reals].sort((a, b) => a.strength - b.strength);
  const n = sorted.length;

  // Band index (0..n-1) per stage — rises toward the final.
  const stageFrac = [0.2, 0.35, 0.5, 0.6, 0.72, 0.85, 0.97];
  const used = new Set<string>();
  const opponents: Opponent[] = [];

  for (let i = 0; i < CAMPAIGN_STAGES.length; i++) {
    const target = Math.floor(stageFrac[i] * (n - 1));
    // Search outward from target for an unused edition.
    let pick: Edition | null = null;
    for (let off = 0; off < n && !pick; off++) {
      for (const idx of [target + off, target - off]) {
        if (idx >= 0 && idx < n && !used.has(sorted[idx].id)) {
          pick = sorted[idx];
          break;
        }
      }
    }
    if (!pick) pick = sorted[target];
    used.add(pick.id);
    const stageBoost = i >= 3 ? (i - 2) * 1.2 : 0;
    opponents.push(opponentFromEdition(pick, rng, stageBoost));
  }
  return opponents;
}

export function simulateCampaign(user: UserTeamInput, editions: Edition[], seed: string): CampaignResult {
  const opponents = pickOpponents(editions, seed);
  const matches: MatchResult[] = [];

  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let champion = false;
  let eliminatedAt: string | null = null;
  let hadSeteAZero = false;

  for (let i = 0; i < CAMPAIGN_STAGES.length; i++) {
    const stage = CAMPAIGN_STAGES[i];
    const knockout = i >= 3;
    const m = simulateMatch(user, opponents[i], stage, `${seed}#match#${i}`, { knockout });
    matches.push(m);

    goalsFor += m.homeGoals;
    goalsAgainst += m.awayGoals;
    if (m.win) wins++;
    else if (m.draw) draws++;
    else losses++;
    if (m.homeGoals >= 7 && m.awayGoals === 0) hadSeteAZero = true;

    if (i === 2) {
      // End of group stage: need >= 4 points to advance.
      const points = wins * 3 + draws;
      if (points < 4) {
        eliminatedAt = 'Fase de grupos';
        break;
      }
    } else if (knockout && !m.win) {
      eliminatedAt = stage;
      break;
    } else if (stage === 'Final' && m.win) {
      champion = true;
    }
  }

  const decisive = matches.filter((m) => m.win);
  const biggestWin =
    decisive.length > 0
      ? decisive.reduce((best, m) =>
          m.homeGoals - m.awayGoals > best.homeGoals - best.awayGoals ? m : best,
        )
      : null;

  return {
    matches,
    champion,
    eliminatedAt,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    biggestWin,
    hadSeteAZero,
  };
}
