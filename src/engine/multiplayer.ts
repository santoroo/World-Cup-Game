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
import { createRng } from './rng';
import { simulatePvpMatch } from './simulation';
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
    winnerId: string;
    penalties: boolean;
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

function toPvpTeam(p: MpPlayer): import('./simulation').PvpTeam {
  return { id: p.id, name: p.name, style: p.style, strength: p.strength!, placed: p.placed };
}

/** Build and fully simulate the knockout bracket. Deterministic by room seed. */
export function buildBracket(room: RoomState): Bracket {
  const byId = new Map(room.players.map((p) => [p.id, p]));
  // Seed by team overall (desc); top seeds earn the byes. Ties broken by id.
  const seeded = [...room.players].sort(
    (a, b) => (b.strength?.overall ?? 0) - (a.strength?.overall ?? 0) || a.id.localeCompare(b.id),
  );
  const n = seeded.length;
  const size = nextPow2(n);
  const totalRounds = Math.max(1, Math.log2(size));
  const order = seedOrder(size);

  // Round 0 participants in bracket order (null = bye / empty slot).
  let current: (string | null)[] = order.map((s) => (s - 1 < n ? seeded[s - 1].id : null));

  const rounds: BracketMatch[][] = [];
  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex++) {
    const matches: BracketMatch[] = [];
    const winners: (string | null)[] = [];
    for (let k = 0; k < current.length; k += 2) {
      const aId = current[k];
      const bId = current[k + 1];
      const slot = k / 2;
      const base: BracketMatch = {
        id: `r${roundIndex}m${slot}`,
        round: roundIndex,
        slot,
        stageLabel: stageLabel(roundIndex, totalRounds),
        aId,
        bId,
        byeId: null,
        result: null,
      };

      if (aId && bId) {
        const res = simulatePvpMatch(
          toPvpTeam(byId.get(aId)!),
          toPvpTeam(byId.get(bId)!),
          `${room.seed}#bracket#${base.id}`,
        );
        base.result = {
          a: { playerId: aId, goals: res.goalsA, scorers: res.scorersA, redCards: res.redCardsA },
          b: { playerId: bId, goals: res.goalsB, scorers: res.scorersB, redCards: res.redCardsB },
          winnerId: res.winnerId,
          penalties: res.penalties,
          blurb: res.blurb,
        };
        winners.push(res.winnerId);
      } else {
        const advancing = aId ?? bId ?? null;
        base.byeId = advancing;
        winners.push(advancing);
      }
      matches.push(base);
    }
    rounds.push(matches);
    current = winners;
  }

  return { rounds, championId: current[0] ?? null };
}

function enterBracket(room: RoomState): RoomState {
  const players = room.players.map((p) => ({
    ...p,
    strength: p.strength ?? computeTeamStrength(p.placed, p.formation),
  }));
  const staged: RoomState = {
    ...room,
    players,
    phase: 'bracket',
    currentId: null,
    rolledEditionId: null,
  };
  const bracket = buildBracket(staged);
  return { ...staged, bracket };
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
  };
}
