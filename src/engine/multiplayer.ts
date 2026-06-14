// ============================================================================
// Multiplayer room engine — pure & deterministic by room seed (no I/O, no React,
// no sockets). The WebSocket server is a thin adapter over these reducers, so the
// whole online flow (snake draft with global uniqueness → knockout bracket → a
// champion) is unit-testable without a network.
//
// Flow:
//   lobby  → players join, pick formation/style, ready up
//   draft  → snake order; on your turn you roll the die and pick 1 of the still
//            available players from the rolled edition (auto-assigned to your best
//            open slot). A player taken by anyone is unavailable to everyone.
//   bracket→ all XIs done → single-elimination tournament (byes for top seeds)
//   finished → a champion is crowned
// ============================================================================

import { computeTeamStrength } from './chemistry';
import { evaluateFit } from './compatibility';
import {
  bestSlotFor,
  MAX_FREE_SKIPS,
  movePlayer,
  openSlots,
  pickablePlayers,
  placeInSlot,
  roll as engineRoll,
  swapPlayers,
  type DraftState,
} from './draft';
import { FORMATION_LIST } from './formations';
import {
  ambasDirecoesDefinidas,
  armarPrazo,
  autoCompletarDirecoes,
  criarDisputa,
  definirDirecao,
  gerarDisputaAutomatica,
  marcarPronto,
  MS_PRAZO_PENALTI,
  prontosParaComecar,
  resolverChutePendente,
  type ChutePenalti,
  type DirecaoPenalti,
  type DisputaPenaltis,
} from './penaltis';
import { createRng } from './rng';
import { pvpBlurb, simularPvpTempoNormal, type PvpTeam } from './simulation';
import type {
  Edition,
  Formation,
  GameMode,
  PlacedPlayer,
  Player,
  PlayStyle,
  RedCard,
  Scorer,
  Slot,
  TeamStrength,
} from './types';

export const MP_MIN_PLAYERS = 2;
export const MP_MAX_PLAYERS = 5;
export const MP_SQUAD_SIZE = 11;

/** Distinct avatars handed out in join order (kept in sync with MP_MAX_PLAYERS). */
export const MP_AVATARS = ['🦊', '🐯', '🦁', '🐺', '🦅'] as const;

/** lobby → draft → bracket (knockout results ready, champion crowned). */
export type RoomPhase = 'lobby' | 'draft' | 'bracket';

export interface MpPlayer {
  id: string;
  name: string;
  avatar: string;
  formation: Formation;
  style: PlayStyle;
  ready: boolean;
  connected: boolean;
  placed: PlacedPlayer[];
  skipsUsed: number;
  /** Computed once the draft completes. */
  strength: TeamStrength | null;
}

export interface BracketSide {
  playerId: string;
  goals: number;
  scorers: Scorer[];
  redCards: RedCard[];
}

export interface BracketMatch {
  id: string;
  round: number;
  /** Position of the match within its round. */
  slot: number;
  stageLabel: string;
  aId: string | null;
  bId: string | null;
  /** Set when one side gets a walkover (auto-advances). */
  byeId: string | null;
  result: {
    a: BracketSide;
    b: BracketSide;
    /** null enquanto um empate aguarda a decisão nos pênaltis. */
    winnerId: string | null;
    penalties: boolean;
    /** Placar + sequência da disputa, quando decidido nos pênaltis. */
    penaltis: { golsA: number; golsB: number; historico: ChutePenalti[] } | null;
    blurb: string;
  } | null;
}

export interface Bracket {
  rounds: BracketMatch[][];
  championId: string | null;
}

export interface RoomState {
  id: string;
  seed: string;
  phase: RoomPhase;
  hostId: string;
  mode: GameMode;
  players: MpPlayer[];
  /** Globally drafted player ids — nobody can pick a taken player. */
  usedPlayerIds: string[];
  /** Draft order (player ids), fixed when the draft starts. */
  order: string[];
  /** 0-based draft round (0 .. MP_SQUAD_SIZE-1). */
  round: number;
  /** Index within the current snake round. */
  turnInRound: number;
  /** Whose turn it is (player id) during the draft. */
  currentId: string | null;
  /** Edition the current player rolled and must pick from. */
  rolledEditionId: string | null;
  /** Monotonic roll counter — feeds deterministic roll seeds. */
  rollNonce: number;
  /** Fase de grupos (computada ao fim do draft). null = ainda não. */
  grupos: FaseGrupos | null;
  bracket: Bracket | null;
  /** Disputa de pênaltis em andamento (pausa o chaveamento). null = nenhuma. */
  disputaPenaltis: DisputaPenaltis | null;
}

// ---------------------------------------------------------------------------
// Construction & lobby
// ---------------------------------------------------------------------------

export function createRoom(id: string, seed: string, hostId: string, mode: GameMode = 'classico'): RoomState {
  return {
    id,
    seed,
    phase: 'lobby',
    hostId,
    mode,
    players: [],
    usedPlayerIds: [],
    order: [],
    round: 0,
    turnInRound: 0,
    currentId: null,
    rolledEditionId: null,
    rollNonce: 0,
    grupos: null,
    bracket: null,
    disputaPenaltis: null,
  };
}

function clonePlayers(room: RoomState): MpPlayer[] {
  return room.players.map((p) => ({ ...p }));
}

export function getPlayer(room: RoomState, playerId: string): MpPlayer | undefined {
  return room.players.find((p) => p.id === playerId);
}

/** Add a player to a lobby. No-op if the room is full, started, or id exists. */
export function addPlayer(room: RoomState, player: { id: string; name: string }): RoomState {
  if (room.phase !== 'lobby') return room;
  if (room.players.length >= MP_MAX_PLAYERS) return room;
  if (getPlayer(room, player.id)) return room;
  const avatar = MP_AVATARS[room.players.length % MP_AVATARS.length];
  const next: MpPlayer = {
    id: player.id,
    name: sanitizeName(player.name, room.players.length),
    avatar,
    formation: FORMATION_LIST[0],
    style: 'equilibrado',
    ready: false,
    connected: true,
    placed: [],
    skipsUsed: 0,
    strength: null,
  };
  const hostId = room.players.length === 0 ? player.id : room.hostId;
  return { ...room, players: [...room.players, next], hostId };
}

function sanitizeName(name: string, index: number): string {
  const trimmed = (name ?? '').trim().slice(0, 16);
  return trimmed || `Jogador ${index + 1}`;
}

/** Lobby-only edits to a player's name / formation / style. */
export function configurePlayer(
  room: RoomState,
  playerId: string,
  patch: { name?: string; formation?: Formation; style?: PlayStyle },
): RoomState {
  if (room.phase !== 'lobby') return room;
  const players = clonePlayers(room);
  const p = players.find((x) => x.id === playerId);
  if (!p) return room;
  if (patch.name !== undefined) p.name = sanitizeName(patch.name, room.players.indexOf(p));
  if (patch.formation && FORMATION_LIST.includes(patch.formation)) p.formation = patch.formation;
  if (patch.style) p.style = patch.style;
  // Changing your setup drops your ready flag so others see you re-confirm.
  p.ready = false;
  return { ...room, players };
}

export function setReady(room: RoomState, playerId: string, ready: boolean): RoomState {
  if (room.phase !== 'lobby') return room;
  const players = clonePlayers(room);
  const p = players.find((x) => x.id === playerId);
  if (!p) return room;
  p.ready = ready;
  return { ...room, players };
}

export function setConnected(room: RoomState, playerId: string, connected: boolean): RoomState {
  const players = clonePlayers(room);
  const p = players.find((x) => x.id === playerId);
  if (!p) return room;
  p.connected = connected;
  return { ...room, players };
}

/**
 * Remove a player. In the lobby they're dropped entirely; mid-game we keep their
 * slot (so the draft/bracket stays intact) and just mark them disconnected.
 * Host migrates to the next connected player if needed.
 */
export function removePlayer(room: RoomState, playerId: string): RoomState {
  if (room.phase === 'lobby') {
    const players = room.players.filter((p) => p.id !== playerId);
    if (players.length === room.players.length) return room;
    const hostId = room.hostId === playerId ? players[0]?.id ?? '' : room.hostId;
    return { ...room, players, hostId };
  }
  return migrateHost(setConnected(room, playerId, false));
}

function migrateHost(room: RoomState): RoomState {
  if (getPlayer(room, room.hostId)?.connected) return room;
  const next = room.players.find((p) => p.connected);
  return next ? { ...room, hostId: next.id } : room;
}

export function canStart(room: RoomState): boolean {
  return (
    room.phase === 'lobby' &&
    room.players.length >= MP_MIN_PLAYERS &&
    room.players.length <= MP_MAX_PLAYERS &&
    room.players.every((p) => p.ready && p.connected)
  );
}

// ---------------------------------------------------------------------------
// Draft (snake order, global uniqueness)
// ---------------------------------------------------------------------------

/** Index into `order` for the player acting now (snake: reverse on odd rounds). */
function snakeIndex(round: number, turnInRound: number, n: number): number {
  return round % 2 === 0 ? turnInRound : n - 1 - turnInRound;
}

function currentIdFor(order: string[], round: number, turnInRound: number): string | null {
  if (order.length === 0 || round >= MP_SQUAD_SIZE) return null;
  return order[snakeIndex(round, turnInRound, order.length)] ?? null;
}

/** Begin the draft: lock a fair (seed-shuffled) order and hand the first turn. */
export function startDraft(room: RoomState): RoomState {
  if (!canStart(room)) return room;
  const rng = createRng(`${room.seed}#order`);
  const order = rng.shuffle(room.players.map((p) => p.id));
  return {
    ...room,
    phase: 'draft',
    order,
    round: 0,
    turnInRound: 0,
    currentId: currentIdFor(order, 0, 0),
    rolledEditionId: null,
    rollNonce: 0,
  };
}

/** A throwaway DraftState that reuses the single-player engine for one player. */
function synthDraft(room: RoomState, player: MpPlayer): DraftState {
  return {
    seed: `${room.seed}#${player.id}`,
    formation: player.formation,
    placed: player.placed,
    usedPlayerIds: room.usedPlayerIds, // global pool → enforces uniqueness
    skipsUsed: player.skipsUsed,
    rollCount: room.rollNonce,
  };
}

export function isDraftComplete(room: RoomState): boolean {
  return room.players.length > 0 && room.players.every((p) => p.placed.length >= MP_SQUAD_SIZE);
}

/** Players from the rolled edition the current player may still pick. */
export function pickOptions(room: RoomState, editions: Edition[], playerId: string): Player[] {
  if (room.phase !== 'draft' || room.currentId !== playerId || !room.rolledEditionId) return [];
  const player = getPlayer(room, playerId);
  const edition = editions.find((e) => e.id === room.rolledEditionId);
  if (!player || !edition) return [];
  return pickablePlayers(synthDraft(room, player), edition);
}

/** Roll the die for the current player (deterministic). Sets the rolled edition. */
export function rollFor(room: RoomState, editions: Edition[], playerId: string): RoomState {
  if (room.phase !== 'draft' || room.currentId !== playerId || room.rolledEditionId) return room;
  const player = getPlayer(room, playerId);
  if (!player) return room;
  const { edition } = engineRoll(synthDraft(room, player), editions, { chaos: room.mode === 'caos' });
  return {
    ...room,
    rolledEditionId: edition ? edition.id : null,
    rollNonce: room.rollNonce + 1,
  };
}

/**
 * Pick a player by id from the rolled edition. Se `slotId` vier (escolha manual,
 * igual ao solo), coloca naquela vaga aberta e compatível; senão cai na melhor
 * vaga aberta (`bestSlotFor`, usado pelo auto-pick). Avança a vez no snake e, com
 * todos os 11 montados, dispara o chaveamento.
 */
export function pickFor(
  room: RoomState,
  editions: Edition[],
  playerId: string,
  pickedPlayerId: string,
  slotId?: string,
): RoomState {
  if (room.phase !== 'draft' || room.currentId !== playerId || !room.rolledEditionId) return room;
  const idx = room.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return room;
  const player = room.players[idx];
  const edition = editions.find((e) => e.id === room.rolledEditionId);
  if (!edition) return room;

  const synth = synthDraft(room, player);
  const chosen = pickablePlayers(synth, edition).find((p) => p.id === pickedPlayerId);
  if (!chosen) return room; // already taken or doesn't fit an open slot

  // Vaga escolhida pelo jogador, se válida (aberta + encaixe permitido). Caso
  // contrário, melhor vaga automática — preserva o comportamento do auto-pick.
  let slot: Slot | null = null;
  if (slotId) {
    const aberta = openSlots(synth).find((s) => s.id === slotId);
    if (aberta && evaluateFit(chosen, aberta.position).allowed) slot = aberta;
  }
  if (!slot) slot = bestSlotFor(synth, chosen);
  if (!slot) return room;
  const updatedPlaced = placeInSlot(synth, chosen, slot).placed;

  const players = clonePlayers(room);
  players[idx] = { ...player, placed: updatedPlaced };

  const advanced = advanceTurn(
    {
      ...room,
      players,
      usedPlayerIds: [...room.usedPlayerIds, chosen.id],
      rolledEditionId: null,
    },
    editions,
  );
  return advanced;
}

/** Discard the current roll and roll again, spending one of the limited skips. */
export function skipFor(room: RoomState, playerId: string): RoomState {
  if (room.phase !== 'draft' || room.currentId !== playerId || !room.rolledEditionId) return room;
  const players = clonePlayers(room);
  const p = players.find((x) => x.id === playerId);
  if (!p || p.skipsUsed >= MAX_FREE_SKIPS) return room;
  p.skipsUsed += 1;
  return { ...room, players, rolledEditionId: null };
}

/**
 * Reposiciona um jogador já escalado do próprio time para uma vaga vazia (igual
 * ao solo). Permitido durante o draft, independentemente da vez — só mexe na
 * escalação do próprio jogador, não no sorteio nem na unicidade global.
 */
export function moverFor(room: RoomState, playerId: string, fromSlotId: string, toSlotId: string): RoomState {
  if (room.phase !== 'draft') return room;
  const idx = room.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return room;
  const player = room.players[idx];
  const next = movePlayer(synthDraft(room, player), fromSlotId, toSlotId);
  if (next.placed === player.placed) return room; // no-op (vaga ocupada/ilegal)
  const players = clonePlayers(room);
  players[idx] = { ...player, placed: next.placed };
  return { ...room, players };
}

/** Troca dois jogadores escalados do próprio time, recalculando o encaixe. */
export function trocarFor(room: RoomState, playerId: string, slotIdA: string, slotIdB: string): RoomState {
  if (room.phase !== 'draft') return room;
  const idx = room.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return room;
  const player = room.players[idx];
  const next = swapPlayers(synthDraft(room, player), slotIdA, slotIdB);
  if (next.placed === player.placed) return room; // no-op (encaixe ilegal)
  const players = clonePlayers(room);
  players[idx] = { ...player, placed: next.placed };
  return { ...room, players };
}

function advanceTurn(room: RoomState, editions: Edition[]): RoomState {
  let turnInRound = room.turnInRound + 1;
  let round = room.round;
  if (turnInRound >= room.order.length) {
    turnInRound = 0;
    round += 1;
  }
  if (round >= MP_SQUAD_SIZE || isDraftComplete(room)) {
    return enterTorneio(room, editions);
  }
  return { ...room, round, turnInRound, currentId: currentIdFor(room.order, round, turnInRound) };
}

/**
 * Auto-draft for a disconnected (or stalled) current player so the game never
 * blocks: roll if needed, then take the highest-overall available player.
 */
export function autoPickCurrent(room: RoomState, editions: Edition[]): RoomState {
  if (room.phase !== 'draft' || !room.currentId) return room;
  const cur = room.currentId;
  let r = room;
  if (!r.rolledEditionId) r = rollFor(r, editions, cur);
  if (!r.rolledEditionId) return r;
  const options = pickOptions(r, editions, cur).sort((a, b) => b.overall - a.overall);
  if (options.length === 0) return { ...r, rolledEditionId: null };
  return pickFor(r, editions, cur, options[0].id);
}

// ---------------------------------------------------------------------------
// Bracket
// ---------------------------------------------------------------------------

function nextPow2(n: number): number {
  let s = 1;
  while (s < n) s *= 2;
  return s;
}

/** Standard tournament seed order for a bracket of `size` (1-based seeds). */
function seedOrder(size: number): number[] {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return seeds;
}

function stageLabel(roundIndex: number, totalRounds: number): string {
  const fromEnd = totalRounds - 1 - roundIndex;
  switch (fromEnd) {
    case 0:
      return 'Final';
    case 1:
      return 'Semifinal';
    case 2:
      return 'Quartas de final';
    case 3:
      return 'Oitavas de final';
    default:
      return `Rodada ${roundIndex + 1}`;
  }
}

// ---------------------------------------------------------------------------
// Competidores: humanos (MpPlayer) e seleções da CPU (edições reais).
// Ids: humano = player.id; CPU = `cpu:<editionId>`.
// ---------------------------------------------------------------------------

const PREFIXO_CPU = 'cpu:';

export function ehCompetidorHumano(room: RoomState, id: string): boolean {
  return !id.startsWith(PREFIXO_CPU) && !!getPlayer(room, id);
}

/** PvpTeam de uma seleção da CPU a partir da edição (determinístico, sem RNG). */
function cpuPvpTeam(ed: Edition): PvpTeam {
  const s = ed.strength;
  const strength: TeamStrength = {
    attack: Math.round(s * 0.94),
    midfield: Math.round(s * 0.91),
    defense: Math.round(s * 0.93),
    goalkeeper: Math.round(s * 0.9),
    chemistry: 80,
    overall: s,
    strengths: [],
    weaknesses: [],
  };
  // Elenco da edição só pros nomes dos artilheiros (assignScorers pesa por ataque).
  const placed: PlacedPlayer[] = ed.players.map((player) => ({ slotId: player.id, player, fitMultiplier: 1, outOfPosition: false }));
  return { id: `${PREFIXO_CPU}${ed.id}`, name: `${ed.country} ${ed.year}`, style: 'equilibrado', strength, placed };
}

/** Resolve um competidor (humano ou CPU) num PvpTeam pra simular. */
function competidorPvp(id: string, room: RoomState, editions: Edition[]): PvpTeam | null {
  if (id.startsWith(PREFIXO_CPU)) {
    const ed = editions.find((e) => e.id === id.slice(PREFIXO_CPU.length));
    return ed ? cpuPvpTeam(ed) : null;
  }
  const p = getPlayer(room, id);
  return p && p.strength ? { id: p.id, name: p.name, style: p.style, strength: p.strength, placed: p.placed } : null;
}

function competidorOverall(id: string, room: RoomState, editions: Edition[]): number {
  return competidorPvp(id, room, editions)?.strength.overall ?? 0;
}

// ---------------------------------------------------------------------------
// Fase de grupos (estilo Copa do Mundo): cada humano num grupo de 4 com 3
// seleções da CPU; round-robin; top 2 de cada grupo avançam. Determinística por
// seed; sem pênaltis (empate vale ponto). CPU×CPU é instantâneo (só na tabela).
// ---------------------------------------------------------------------------

export interface JogoGrupo {
  aId: string;
  bId: string;
  golsA: number;
  golsB: number;
  scorersA: Scorer[];
  scorersB: Scorer[];
  redCardsA: RedCard[];
  redCardsB: RedCard[];
  /** true se um dos lados é humano (jogo tocado ao vivo). */
  comHumano: boolean;
}

export interface LinhaTabela {
  competidorId: string;
  pts: number;
  v: number;
  e: number;
  d: number;
  gp: number;
  gc: number;
  sg: number;
}

export interface Grupo {
  nome: string;
  competidores: string[];
  jogos: JogoGrupo[];
  /** Classificação ordenada (1º no topo). */
  tabela: LinhaTabela[];
}

export interface FaseGrupos {
  grupos: Grupo[];
  /** Top 2 de cada grupo (1º colocados primeiro), pra semear o mata-mata. */
  classificados: string[];
}

const TAM_GRUPO = 4;
const NOMES_GRUPO = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** Classificação de um grupo a partir dos jogos (parcial ou completa). */
export function calcularTabela(competidores: string[], jogos: JogoGrupo[]): LinhaTabela[] {
  const tab = new Map<string, LinhaTabela>(
    competidores.map((id) => [id, { competidorId: id, pts: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0 }]),
  );
  for (const j of jogos) {
    const a = tab.get(j.aId)!;
    const b = tab.get(j.bId)!;
    a.gp += j.golsA;
    a.gc += j.golsB;
    b.gp += j.golsB;
    b.gc += j.golsA;
    if (j.golsA > j.golsB) {
      a.v++;
      a.pts += 3;
      b.d++;
    } else if (j.golsB > j.golsA) {
      b.v++;
      b.pts += 3;
      a.d++;
    } else {
      a.e++;
      b.e++;
      a.pts++;
      b.pts++;
    }
  }
  for (const l of tab.values()) l.sg = l.gp - l.gc;
  return [...tab.values()].sort(
    (x, y) => y.pts - x.pts || y.sg - x.sg || y.gp - x.gp || x.competidorId.localeCompare(y.competidorId),
  );
}

/** Sorteia os grupos e simula a fase inteira. Determinística por seed. */
export function gerarGrupos(room: RoomState, editions: Edition[]): FaseGrupos {
  const humanos = room.order.length ? room.order : room.players.map((p) => p.id);
  const nGrupos = humanos.length;
  const precisa = nGrupos * (TAM_GRUPO - 1);
  // Seleções da CPU vêm das edições mais fracas (como a fase de grupos do solo),
  // pra os humanos costumarem se classificar e se cruzarem no mata-mata — com um
  // pouco de variedade dentro do grupo das fracas.
  const reais = editions.filter((e) => !e.isBonus).sort((a, b) => a.strength - b.strength);
  const pool = reais.slice(0, Math.min(reais.length, precisa + 6));
  const cpus = createRng(`${room.seed}#grupos`).shuffle(pool).slice(0, precisa);

  const grupos: Grupo[] = [];
  for (let g = 0; g < nGrupos; g++) {
    const competidores = [humanos[g], ...cpus.slice(g * 3, g * 3 + 3).map((e) => `${PREFIXO_CPU}${e.id}`)];
    const jogos: JogoGrupo[] = [];
    for (let i = 0; i < competidores.length; i++) {
      for (let j = i + 1; j < competidores.length; j++) {
        const aId = competidores[i];
        const bId = competidores[j];
        const tn = simularPvpTempoNormal(
          competidorPvp(aId, room, editions)!,
          competidorPvp(bId, room, editions)!,
          `${room.seed}#grupo#${g}#${i}-${j}`,
        );
        jogos.push({
          aId,
          bId,
          golsA: tn.golsA,
          golsB: tn.golsB,
          scorersA: tn.scorersA,
          scorersB: tn.scorersB,
          redCardsA: tn.redCardsA,
          redCardsB: tn.redCardsB,
          comHumano: ehCompetidorHumano(room, aId) || ehCompetidorHumano(room, bId),
        });
      }
    }
    grupos.push({ nome: NOMES_GRUPO[g] ?? `${g + 1}`, competidores, jogos, tabela: calcularTabela(competidores, jogos) });
  }

  const primeiros = grupos.map((gr) => gr.tabela[0].competidorId);
  const segundos = grupos.map((gr) => gr.tabela[1].competidorId);
  return { grupos, classificados: [...primeiros, ...segundos] };
}

/**
 * Monta o esqueleto do chaveamento a partir dos competidores já semeados (os
 * primeiros da lista pegam os byes). Resultados começam nulos.
 */
function montarBracket(seededIds: string[]): Bracket {
  const n = seededIds.length;
  const size = nextPow2(n);
  const totalRounds = Math.max(1, Math.log2(size));
  const order = seedOrder(size);
  const participantesR0 = order.map((s) => (s - 1 < n ? seededIds[s - 1] : null));

  const rounds: BracketMatch[][] = [];
  for (let ri = 0; ri < totalRounds; ri++) {
    const matches: BracketMatch[] = [];
    const qtd = size / Math.pow(2, ri + 1);
    for (let slot = 0; slot < qtd; slot++) {
      let aId: string | null = null;
      let bId: string | null = null;
      let byeId: string | null = null;
      if (ri === 0) {
        aId = participantesR0[slot * 2] ?? null;
        bId = participantesR0[slot * 2 + 1] ?? null;
        if ((aId && !bId) || (!aId && bId)) byeId = aId ?? bId;
      }
      matches.push({ id: `r${ri}m${slot}`, round: ri, slot, stageLabel: stageLabel(ri, totalRounds), aId, bId, byeId, result: null });
    }
    rounds.push(matches);
  }
  return { rounds, championId: null };
}

function clonarBracket(b: Bracket): Bracket {
  return { rounds: b.rounds.map((r) => r.map((m) => ({ ...m }))), championId: b.championId };
}

function acharPartida(b: Bracket, id: string): BracketMatch | undefined {
  for (const r of b.rounds) for (const m of r) if (m.id === id) return m;
  return undefined;
}

/** Leva o vencedor (ou walkover) de um confronto para o confronto seguinte. */
function propagar(b: Bracket, ri: number, slot: number, vencedorId: string): void {
  const prox = ri + 1;
  if (prox >= b.rounds.length) return;
  const m = b.rounds[prox][Math.floor(slot / 2)];
  if (!m) return;
  if (slot % 2 === 0) m.aId = vencedorId;
  else m.bId = vencedorId;
}

function montarResultado(
  m: BracketMatch,
  tn: ReturnType<typeof simularPvpTempoNormal>,
  vencedorId: string | null,
  disputa: DisputaPenaltis | null,
): NonNullable<BracketMatch['result']> {
  const decididoNosPenaltis = disputa != null;
  let blurb: string;
  if (vencedorId == null) blurb = pvpBlurb(tn.golsA, tn.golsB, true); // empate aguardando
  else if (decididoNosPenaltis) {
    const maior = Math.max(disputa!.golsA, disputa!.golsB);
    const menor = Math.min(disputa!.golsA, disputa!.golsB);
    blurb = `Empate em ${tn.golsA} a ${tn.golsB}. Decisão nos pênaltis: ${maior} a ${menor}!`;
  } else blurb = pvpBlurb(tn.golsA, tn.golsB, false);

  return {
    a: { playerId: m.aId!, goals: tn.golsA, scorers: tn.scorersA, redCards: tn.redCardsA },
    b: { playerId: m.bId!, goals: tn.golsB, scorers: tn.scorersB, redCards: tn.redCardsB },
    winnerId: vencedorId,
    penalties: decididoNosPenaltis || vencedorId == null,
    penaltis: disputa ? { golsA: disputa.golsA, golsB: disputa.golsB, historico: disputa.historico } : null,
    blurb,
  };
}

/**
 * Resolve o chaveamento em ordem (round-major) até o fim ou até o primeiro
 * empate. Com `auto`, resolve empates por pênaltis automáticos (determinístico).
 * Sem `auto` (online), grava o tempo normal e cria a disputa interativa, pausando.
 */
function avancarBracket(room: RoomState, editions: Edition[], opts: { auto?: boolean } = {}): RoomState {
  const bracket = clonarBracket(room.bracket!);

  for (let ri = 0; ri < bracket.rounds.length; ri++) {
    for (const m of bracket.rounds[ri]) {
      if (m.byeId) {
        propagar(bracket, ri, m.slot, m.byeId);
        continue;
      }
      // Empate aguardando pênaltis (winnerId null) → pausa aqui.
      if (m.result && m.result.winnerId == null) return { ...room, bracket };
      // Já decidido → reforça a propagação (idempotente) e segue.
      if (m.result && m.result.winnerId) {
        propagar(bracket, ri, m.slot, m.result.winnerId);
        continue;
      }
      // Lados ainda indefinidos (dependem de rounds anteriores) → espera.
      if (m.aId == null || m.bId == null) continue;

      const a = competidorPvp(m.aId, room, editions);
      const b = competidorPvp(m.bId, room, editions);
      if (!a || !b) continue; // segurança: competidor não resolvido
      const tn = simularPvpTempoNormal(a, b, `${room.seed}#bracket#${m.id}`);
      const seedPen = `${room.seed}#bracket#${m.id}#pen`;

      if (!tn.empate) {
        const vencedorId = tn.golsA > tn.golsB ? m.aId : m.bId;
        m.result = montarResultado(m, tn, vencedorId, null);
        propagar(bracket, ri, m.slot, vencedorId);
        continue;
      }
      // Empate: pênaltis. Interativo só quando os DOIS lados são humanos.
      const ambosHumanos = ehCompetidorHumano(room, m.aId) && ehCompetidorHumano(room, m.bId);
      if (opts.auto || !ambosHumanos) {
        const disputa = gerarDisputaAutomatica(m.id, m.aId, m.bId, seedPen);
        m.result = montarResultado(m, tn, disputa.vencedorId!, disputa);
        propagar(bracket, ri, m.slot, disputa.vencedorId!);
        continue;
      }
      // Humano × humano → disputa interativa (pausa o chaveamento).
      m.result = montarResultado(m, tn, null, null);
      return { ...room, bracket, disputaPenaltis: criarDisputa(m.id, m.aId, m.bId, seedPen) };
    }
  }

  const ultima = bracket.rounds[bracket.rounds.length - 1][0];
  const championId = ultima?.result?.winnerId ?? ultima?.byeId ?? null;
  return { ...room, bracket: { ...bracket, championId }, disputaPenaltis: null };
}

/** Monta e resolve TODO um chaveamento só de humanos, automaticamente (determinístico). */
export function buildBracket(room: RoomState, editions: Edition[]): Bracket {
  const seeded = [...room.players]
    .sort((a, b) => (b.strength?.overall ?? 0) - (a.strength?.overall ?? 0) || a.id.localeCompare(b.id))
    .map((p) => p.id);
  const base: RoomState = { ...room, bracket: montarBracket(seeded), disputaPenaltis: null };
  return avancarBracket(base, editions, { auto: true }).bracket!;
}

/**
 * Fim do draft → torneio: fase de grupos (determinística) + mata-mata com os
 * classificados (humanos + CPU). Pausa no 1º empate humano×humano.
 */
function enterTorneio(room: RoomState, editions: Edition[]): RoomState {
  const players = room.players.map((p) => ({
    ...p,
    strength: p.strength ?? computeTeamStrength(p.placed, p.formation),
  }));
  const comStrength: RoomState = {
    ...room,
    players,
    phase: 'bracket',
    currentId: null,
    rolledEditionId: null,
    disputaPenaltis: null,
  };

  const grupos = gerarGrupos(comStrength, editions);
  // Semeia: 1º colocados (pegam os byes) antes dos 2º; cada bloco por overall desc.
  const nGrupos = grupos.grupos.length;
  const porForca = (ids: string[]) =>
    [...ids].sort(
      (x, y) => competidorOverall(y, comStrength, editions) - competidorOverall(x, comStrength, editions) || x.localeCompare(y),
    );
  const seeded = [
    ...porForca(grupos.classificados.slice(0, nGrupos)),
    ...porForca(grupos.classificados.slice(nGrupos)),
  ];

  const staged: RoomState = { ...comStrength, grupos, bracket: montarBracket(seeded) };
  return avancarBracket(staged, editions);
}

// ---------------------------------------------------------------------------
// Disputa de pênaltis (online, interativa)
// ---------------------------------------------------------------------------

/** Lado do jogador na disputa ('a'/'b'), ou null se for espectador. */
function ladoDoJogador(d: DisputaPenaltis, playerId: string): 'a' | 'b' | null {
  if (playerId === d.aId) return 'a';
  if (playerId === d.bId) return 'b';
  return null;
}

/**
 * Um jogador escolheu uma direção: canto do chute (se é a vez dele) ou da defesa
 * (se é o goleiro). Resolve a cobrança quando os dois escolheram.
 */
export function definirDirecaoPenalti(room: RoomState, editions: Edition[], playerId: string, dir: DirecaoPenalti, agora: number): RoomState {
  const d = room.disputaPenaltis;
  if (!d || d.encerrada || d.prazo == null) return room; // só depois que a disputa começa
  const lado = ladoDoJogador(d, playerId);
  if (!lado) return room; // espectador não interfere
  const papel = lado === d.vez ? 'chute' : 'defesa';
  let nova = definirDirecao(d, papel, dir);
  if (ambasDirecoesDefinidas(nova)) nova = resolverChutePendente(nova, agora, MS_PRAZO_PENALTI);
  const r: RoomState = { ...room, disputaPenaltis: nova };
  return nova.encerrada ? resolverDisputaConcluida(r, editions) : r;
}

/** Jogador terminou o replay 0'→90'. Quando os dois envolvidos terminam, arma a 1ª cobrança. */
export function marcarProntoPenalti(room: RoomState, playerId: string, agora: number): RoomState {
  const d = room.disputaPenaltis;
  if (!d || d.encerrada) return room;
  let nova = marcarPronto(d, playerId);
  if (prontosParaComecar(nova)) nova = armarPrazo(nova, agora, MS_PRAZO_PENALTI);
  return { ...room, disputaPenaltis: nova };
}

/** O prazo da cobrança estourou: completa as direções que faltam e resolve. */
export function timeoutPenalti(room: RoomState, editions: Edition[], agora: number): RoomState {
  const d = room.disputaPenaltis;
  if (!d || d.encerrada || d.prazo == null) return room;
  let nova = autoCompletarDirecoes(d);
  nova = resolverChutePendente(nova, agora, MS_PRAZO_PENALTI);
  const r: RoomState = { ...room, disputaPenaltis: nova };
  return nova.encerrada ? resolverDisputaConcluida(r, editions) : r;
}

/** Grava o resultado da disputa encerrada no confronto e segue o chaveamento. */
function resolverDisputaConcluida(room: RoomState, editions: Edition[]): RoomState {
  const d = room.disputaPenaltis;
  if (!d || !d.encerrada || !room.bracket) return room;
  const bracket = clonarBracket(room.bracket);
  const m = acharPartida(bracket, d.partidaId);
  if (m && m.result) {
    const maior = Math.max(d.golsA, d.golsB);
    const menor = Math.min(d.golsA, d.golsB);
    m.result = {
      ...m.result,
      winnerId: d.vencedorId,
      penalties: true,
      penaltis: { golsA: d.golsA, golsB: d.golsB, historico: d.historico },
      blurb: `Empate em ${m.result.a.goals} a ${m.result.b.goals}. Decisão nos pênaltis: ${maior} a ${menor}!`,
    };
  }
  return avancarBracket({ ...room, bracket, disputaPenaltis: null }, editions);
}

// ---------------------------------------------------------------------------
// Rematch
// ---------------------------------------------------------------------------

/** Reset to a fresh lobby with the same players (new seed supplied by caller). */
export function rematch(room: RoomState, newSeed: string): RoomState {
  const players = room.players.map((p) => ({
    ...p,
    ready: false,
    placed: [],
    skipsUsed: 0,
    strength: null,
  }));
  return {
    ...room,
    seed: newSeed,
    phase: 'lobby',
    players,
    usedPlayerIds: [],
    order: [],
    round: 0,
    turnInRound: 0,
    currentId: null,
    rolledEditionId: null,
    rollNonce: 0,
    grupos: null,
    bracket: null,
    disputaPenaltis: null,
  };
}
