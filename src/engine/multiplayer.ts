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

  const advanced = advanceTurn({
    ...room,
    players,
    usedPlayerIds: [...room.usedPlayerIds, chosen.id],
    rolledEditionId: null,
  });
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

function advanceTurn(room: RoomState): RoomState {
  let turnInRound = room.turnInRound + 1;
  let round = room.round;
  if (turnInRound >= room.order.length) {
    turnInRound = 0;
    round += 1;
  }
  if (round >= MP_SQUAD_SIZE || isDraftComplete(room)) {
    return enterBracket(room);
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

function toPvpTeam(p: MpPlayer): PvpTeam {
  return { id: p.id, name: p.name, style: p.style, strength: p.strength!, placed: p.placed };
}

/**
 * Monta o esqueleto do chaveamento: round 0 com participantes/walkovers vindos do
 * sorteio por força; rounds seguintes com vagas vazias (preenchidas conforme os
 * confrontos vão sendo resolvidos). Os resultados começam todos nulos.
 */
function montarBracket(room: RoomState): Bracket {
  // Seed by team overall (desc); top seeds earn the byes. Ties broken by id.
  const seeded = [...room.players].sort(
    (a, b) => (b.strength?.overall ?? 0) - (a.strength?.overall ?? 0) || a.id.localeCompare(b.id),
  );
  const n = seeded.length;
  const size = nextPow2(n);
  const totalRounds = Math.max(1, Math.log2(size));
  const order = seedOrder(size);
  const participantesR0 = order.map((s) => (s - 1 < n ? seeded[s - 1].id : null));

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
function avancarBracket(room: RoomState, opts: { auto?: boolean } = {}): RoomState {
  const bracket = clonarBracket(room.bracket!);
  const byId = new Map(room.players.map((p) => [p.id, p]));

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

      const tn = simularPvpTempoNormal(toPvpTeam(byId.get(m.aId)!), toPvpTeam(byId.get(m.bId)!), `${room.seed}#bracket#${m.id}`);
      const seedPen = `${room.seed}#bracket#${m.id}#pen`;

      if (!tn.empate) {
        const vencedorId = tn.golsA > tn.golsB ? m.aId : m.bId;
        m.result = montarResultado(m, tn, vencedorId, null);
        propagar(bracket, ri, m.slot, vencedorId);
        continue;
      }
      if (opts.auto) {
        const disputa = gerarDisputaAutomatica(m.id, m.aId, m.bId, seedPen);
        m.result = montarResultado(m, tn, disputa.vencedorId!, disputa);
        propagar(bracket, ri, m.slot, disputa.vencedorId!);
        continue;
      }
      // Online: grava o tempo normal pendente e cria a disputa interativa (pausa).
      m.result = montarResultado(m, tn, null, null);
      return { ...room, bracket, disputaPenaltis: criarDisputa(m.id, m.aId, m.bId, seedPen) };
    }
  }

  const ultima = bracket.rounds[bracket.rounds.length - 1][0];
  const championId = ultima?.result?.winnerId ?? ultima?.byeId ?? null;
  return { ...room, bracket: { ...bracket, championId }, disputaPenaltis: null };
}

/** Monta e resolve TODO o chaveamento automaticamente. Determinístico por seed. */
export function buildBracket(room: RoomState): Bracket {
  const base: RoomState = { ...room, bracket: montarBracket(room), disputaPenaltis: null };
  return avancarBracket(base, { auto: true }).bracket!;
}

function enterBracket(room: RoomState): RoomState {
  const players = room.players.map((p) => ({
    ...p,
    strength: p.strength ?? computeTeamStrength(p.placed, p.formation),
  }));
  const comStrength: RoomState = { ...room, players };
  const staged: RoomState = {
    ...comStrength,
    phase: 'bracket',
    currentId: null,
    rolledEditionId: null,
    disputaPenaltis: null,
    bracket: montarBracket(comStrength),
  };
  return avancarBracket(staged);
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
export function definirDirecaoPenalti(room: RoomState, playerId: string, dir: DirecaoPenalti, agora: number): RoomState {
  const d = room.disputaPenaltis;
  if (!d || d.encerrada || d.prazo == null) return room; // só depois que a disputa começa
  const lado = ladoDoJogador(d, playerId);
  if (!lado) return room; // espectador não interfere
  const papel = lado === d.vez ? 'chute' : 'defesa';
  let nova = definirDirecao(d, papel, dir);
  if (ambasDirecoesDefinidas(nova)) nova = resolverChutePendente(nova, agora, MS_PRAZO_PENALTI);
  const r: RoomState = { ...room, disputaPenaltis: nova };
  return nova.encerrada ? resolverDisputaConcluida(r) : r;
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
export function timeoutPenalti(room: RoomState, agora: number): RoomState {
  const d = room.disputaPenaltis;
  if (!d || d.encerrada || d.prazo == null) return room;
  let nova = autoCompletarDirecoes(d);
  nova = resolverChutePendente(nova, agora, MS_PRAZO_PENALTI);
  const r: RoomState = { ...room, disputaPenaltis: nova };
  return nova.encerrada ? resolverDisputaConcluida(r) : r;
}

/** Grava o resultado da disputa encerrada no confronto e segue o chaveamento. */
function resolverDisputaConcluida(room: RoomState): RoomState {
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
  return avancarBracket({ ...room, bracket, disputaPenaltis: null });
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
    bracket: null,
    disputaPenaltis: null,
  };
}
