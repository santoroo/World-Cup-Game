// ============================================================================
// Engine types — pure domain model, no React/DOM dependencies.
// ============================================================================

import type { ChutePenalti } from './penaltis';

/** Posições jogáveis. `ALL` = coringa (qualquer vaga, sem penalidade). */
export type Position =
  | 'GK'
  | 'CB'
  | 'LB'
  | 'RB'
  | 'DM'
  | 'CM'
  | 'AM'
  | 'LW'
  | 'RW'
  | 'ST'
  | 'ALL';

export type Rarity = 'comum' | 'raro' | 'craque' | 'lenda';

/** Os 7 atributos derivados (seção 3b). */
export interface Attributes {
  attack: number;
  midfield: number;
  defense: number;
  goalkeeper: number;
  technique: number;
  physical: number;
  clutch: number;
}

/** Jogador como definido no JSON (atributos opcionais; derivados se ausentes). */
export interface RawPlayer extends Partial<Attributes> {
  id: string;
  name: string;
  positions: Position[];
  overall: number;
  desc: string;
  rarity?: Rarity;
}

/** Jogador já com atributos derivados garantidos + referência da edição. */
export interface Player extends Attributes {
  id: string;
  name: string;
  positions: Position[];
  overall: number;
  desc: string;
  rarity: Rarity;
  /** Edição de origem (preenchido ao carregar a base). */
  editionId: string;
  country: string;
  flag: string;
  year: number;
  isBonus: boolean;
}

/** Edição (seleção + ano) como no JSON. */
export interface RawEdition {
  id: string;
  country: string;
  flag: string;
  year: number;
  strength: number;
  weight: number;
  isBonus: boolean;
  players: RawPlayer[];
}

/** Edição com jogadores resolvidos (atributos derivados). */
export interface Edition {
  id: string;
  country: string;
  flag: string;
  year: number;
  strength: number;
  weight: number;
  isBonus: boolean;
  players: Player[];
}

export type Formation = '4-3-3' | '4-4-2' | '3-5-2' | '4-2-3-1' | '3-4-3';

export type GameMode = 'classico' | 'almanaque' | 'caos';

export type PlayStyle = 'defensivo' | 'equilibrado' | 'ofensivo';

/** Uma vaga da formação a ser preenchida. */
export interface Slot {
  /** Identificador único da vaga dentro da formação, ex. "ST", "CB1". */
  id: string;
  /** Posição que a vaga pede. */
  position: Position;
  /** Coordenadas relativas no campo (0–100), para render. */
  x: number;
  y: number;
  /** Rótulo curto exibido. */
  label: string;
}

/** Jogador escalado numa vaga, com penalidade de encaixe já calculada. */
export interface PlacedPlayer {
  slotId: string;
  player: Player;
  /** Multiplicador de encaixe aplicado (1 = perfeito, <1 = fora de posição). */
  fitMultiplier: number;
  /** true se está totalmente fora de posição (penaliza química). */
  outOfPosition: boolean;
}

/** Força/química consolidada do time (seção 9). */
export interface TeamStrength {
  attack: number;
  midfield: number;
  defense: number;
  goalkeeper: number;
  chemistry: number;
  overall: number;
  /** Listas textuais para a UI. */
  strengths: string[];
  weaknesses: string[];
}

export interface TeamSnapshot {
  formation: Formation;
  style: PlayStyle;
  placed: PlacedPlayer[];
  strength: TeamStrength;
}

/** Adversário gerado para a campanha. */
export interface Opponent {
  id: string;
  name: string;
  flag: string;
  strength: number;
  attack: number;
  midfield: number;
  defense: number;
  goalkeeper: number;
  chemistry: number;
}

export interface Scorer {
  name: string;
  minute: number;
}

/** Expulsão na partida — puramente cosmética (não altera o placar). */
export interface RedCard {
  name: string;
  minute: number;
}

export interface MatchResult {
  stage: string;
  opponent: Opponent;
  homeGoals: number;
  awayGoals: number;
  homeScorers: Scorer[];
  awayScorers: Scorer[];
  /** Expulsões (cosméticas) de cada lado, para a animação ao vivo. */
  homeRedCards: RedCard[];
  awayRedCards: RedCard[];
  /** Jogador destaque da partida (nome). */
  manOfTheMatch: string;
  blurb: string;
  win: boolean;
  draw: boolean;
  /** Disputa de pênaltis (só em empates no mata-mata). 'a' = mandante/usuário. */
  penaltis?: { golsA: number; golsB: number; historico: ChutePenalti[]; vencedorLado: 'a' | 'b' } | null;
}

export interface CampaignResult {
  matches: MatchResult[];
  champion: boolean;
  eliminatedAt: string | null;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  biggestWin: MatchResult | null;
  /** true se houve um 7 a 0 (ou maior diferença com 7+ gols) em algum jogo. */
  hadSeteAZero: boolean;
}

export interface FinalScore {
  points: number;
  rankTitle: string;
  rankBlurb: string;
}
