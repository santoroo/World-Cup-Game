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

// Style multipliers applied to the final expected-goals (lambda), not to the
// raw indices — keeps the effect modest and predictable.
// `atk` scales goals we score; `concede` scales goals we allow.
const STYLE: Record<PlayStyle, { atk: number; concede: number }> = {
  defensivo: { atk: 0.85, concede: 0.82 },
  equilibrado: { atk: 1.0, concede: 1.0 },
  ofensivo: { atk: 1.18, concede: 1.2 },
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

/**
 * Build an opponent from a real edition. Stats are scaled down from the raw
 * `strength` so they sit on the same scale as the user's *aggregated* team
 * ratings (which top out lower than any single overall). Without this, every
 * opponent would be systematically stronger than an equivalent user team.
 */
export function opponentFromEdition(edition: Edition, rng: Rng, stageBoost = 0): Opponent {
  const s = edition.strength + stageBoost;
  return {
    id: edition.id,
    name: `${edition.country} ${edition.year}`,
    flag: edition.flag,
    strength: s,
    attack: Math.round(s * 0.94 + rng.range(-2, 2)),
    midfield: Math.round(s * 0.91 + rng.range(-2, 2)),
    defense: Math.round(s * 0.93 + rng.range(-2, 2)),
    goalkeeper: Math.round(s * 0.9 + rng.range(-2, 2)),
    chemistry: Math.round(75 + rng.range(-4, 8)),
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
  return s.attack * 0.55 + s.midfield * 0.3 + s.chemistry * 0.15;
}
function defensiveIndex(s: { defense: number; goalkeeper: number }): number {
  return s.defense * 0.6 + s.goalkeeper * 0.4;
}

// Exponential model: each XG_SCALE points of attack-minus-defense edge roughly
// multiplies expected goals by e. Lets clearly superior sides run up 5–7 goals
// while keeping even matches around 1–2. No hard cap below blowout territory.
const XG_BASE = 1.3;
const XG_SCALE = 12.5;
function expectedGoals(off: number, def: number): number {
  return Math.max(0.08, Math.min(9, XG_BASE * Math.exp((off - def) / XG_SCALE)));
}

// Per-match "form" (luck): each side draws a swing added to its offence and
// subtracted from its defence — a good day means you both score more and concede
// less, a bad day the opposite. This is what keeps football honest: the better
// team is favoured but never guaranteed, and an underdog on a great day (vs a
// favourite on an off day) can pull the upset. Drawn from the seeded RNG, so a
// given seed always replays identically (share links stay reproducible).
const FORM_SWING = 7;
function drawForm(rng: Rng): number {
  return rng.range(-FORM_SWING, FORM_SWING);
}

/** Pull chemistry toward consistency: high chem teams swing a touch less. */
function applyConsistency(goals: number, lambda: number, chemistry: number): number {
  const pull = 0.14 * (chemistry / 100);
  return Math.round(goals * (1 - pull) + lambda * pull);
}

/** A side as seen by the scoreline resolver. */
export interface SideRatings {
  off: number;
  def: number;
  chemistry: number;
  /** Style knobs: own attacking output and own defensive leakiness. */
  attackStyle: number;
  concedeStyle: number;
}

/** Map an offensive/defensive team into resolver indices. */
export function sideFromRatings(
  s: { attack: number; midfield: number; defense: number; goalkeeper: number; chemistry: number },
  style: PlayStyle = 'equilibrado',
): SideRatings {
  return {
    off: offensiveIndex(s),
    def: defensiveIndex(s),
    chemistry: s.chemistry,
    attackStyle: STYLE[style].atk,
    concedeStyle: STYLE[style].concede,
  };
}

/**
 * Resolve one scoreline. Goals a side scores depend on its own attack vs the
 * other's defence, its own attacking style and the *opponent's* defensive
 * leakiness. Each side also draws a per-match "form": a good day lifts its
 * attack and tightens its defence (and vice-versa), so luck swings the whole
 * match — the better team is favoured but never guaranteed. Shared by the
 * campaign (PvE) and the multiplayer bracket (PvP).
 */
export function resolveScoreline(a: SideRatings, b: SideRatings, rng: Rng): { goalsA: number; goalsB: number } {
  const formA = drawForm(rng);
  const formB = drawForm(rng);

  const lambdaA = expectedGoals(a.off + formA, b.def + formB) * a.attackStyle * b.concedeStyle;
  const lambdaB = expectedGoals(b.off + formB, a.def + formA) * b.attackStyle * a.concedeStyle;

  let goalsA = applyConsistency(poisson(lambdaA, rng), lambdaA, a.chemistry);
  let goalsB = applyConsistency(poisson(lambdaB, rng), lambdaB, b.chemistry);
  goalsA = Math.max(0, Math.min(9, goalsA));
  goalsB = Math.max(0, Math.min(9, goalsB));
  return { goalsA, goalsB };
}

/**
 * Goal-scoring weight for a placed player. Steeply favours attackers and
 * attacking midfielders; defenders chip in rarely and keepers essentially never
 * (no more goalkeepers topping the scoresheet). A small clutch term lets the big
 * names show up in the big moments.
 */
function scorerWeight(p: PlacedPlayer): number {
  // attack ~40 (defenders) → ~0; ~85 (strikers) → large. GKs (~12) → 0.
  const base = Math.pow(Math.max(0, p.player.attack - 42), 1.7);
  const clutch = Math.max(0, p.player.clutch - 60) * 0.4;
  return base + clutch;
}

function assignScorers(placed: PlacedPlayer[], count: number, rng: Rng): Scorer[] {
  if (count <= 0) return [];
  let pool = placed.map((p) => ({ name: p.player.name, weight: scorerWeight(p) }));
  // Safety net: if nobody has meaningful attacking output, fall back to uniform
  // so a goal is never silently miscredited to the last player in the list.
  if (pool.every((p) => p.weight <= 0)) pool = pool.map((p) => ({ ...p, weight: 1 }));
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

  // The user carries their chosen style; generated opponents play it straight.
  const { goalsA: homeGoals, goalsB: awayGoals } = resolveScoreline(
    sideFromRatings(user.strength, user.style),
    sideFromRatings(opp, 'equilibrado'),
    rng,
  );

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

  // Band index (0..n-1) per stage — group games face the weakest sides, then
  // difficulty ramps toward an elite final. Gives good teams a warm-up (and a
  // shot at a group-stage goleada) while keeping the latter rounds tough.
  const stageFrac = [0.04, 0.16, 0.3, 0.46, 0.62, 0.78, 0.9];
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
    const stageBoost = i >= 3 ? (i - 2) * 0.4 : 0;
    opponents.push(opponentFromEdition(pick, rng, stageBoost));
  }
  return opponents;
}

// ----------------------------------------------------------------------------
// Player-vs-player (multiplayer bracket). Two real user teams face off using the
// exact same xG + form model as the campaign, so the matchmaking philosophy is
// identical: the better side is favoured, never guaranteed. Knockouts can't end
// level — they go to penalties weighted (gently) by overall.
// ----------------------------------------------------------------------------

export interface PvpTeam {
  id: string;
  name: string;
  style: PlayStyle;
  strength: TeamStrength;
  placed: PlacedPlayer[];
}

export interface PvpResult {
  goalsA: number;
  goalsB: number;
  scorersA: Scorer[];
  scorersB: Scorer[];
  winnerId: string;
  penalties: boolean;
  blurb: string;
}

function pvpBlurb(goalsA: number, goalsB: number, penalties: boolean): string {
  if (penalties) return `Empate em ${goalsA} a ${goalsB}. Decisão nos pênaltis!`;
  const hi = Math.max(goalsA, goalsB);
  const lo = Math.min(goalsA, goalsB);
  const diff = hi - lo;
  if (hi >= 7 && lo === 0) return 'Humilhação pra história. 7 a 0 é lenda!';
  if (diff >= 5) return 'Goleada sem dó nenhuma.';
  if (diff >= 3) return 'Passeio dentro de campo.';
  if (diff === 2) return 'Vitória segura e merecida.';
  return 'Decidido no detalhe, jogão equilibrado.';
}

/**
 * Simulate a single knockout tie between two user teams. Deterministic by seed.
 * Always returns a winner (penalties break a draw).
 */
export function simulatePvpMatch(a: PvpTeam, b: PvpTeam, seed: string): PvpResult {
  const rng = createRng(seed);
  const { goalsA, goalsB } = resolveScoreline(
    sideFromRatings(a.strength, a.style),
    sideFromRatings(b.strength, b.style),
    rng,
  );

  let winnerId: string;
  let penalties = false;
  if (goalsA > goalsB) winnerId = a.id;
  else if (goalsB > goalsA) winnerId = b.id;
  else {
    const prob = Math.max(0.15, Math.min(0.85, 0.5 + (teamOverall(a.strength) - teamOverall(b.strength)) / 120));
    winnerId = rng.chance(prob) ? a.id : b.id;
    penalties = true;
  }

  return {
    goalsA,
    goalsB,
    scorersA: assignScorers(a.placed, goalsA, rng),
    scorersB: assignScorers(b.placed, goalsB, rng),
    winnerId,
    penalties,
    blurb: pvpBlurb(goalsA, goalsB, penalties),
  };
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
