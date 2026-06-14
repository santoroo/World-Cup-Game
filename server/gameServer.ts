// ============================================================================
// Authoritative WebSocket game server for Copa dos Sonhos multiplayer.
//
// It is a *thin* adapter over the pure room engine (src/engine/multiplayer): it
// owns no game rules, only sockets, rooms, identity and broadcasting. Every
// mutation goes through an engine reducer and the full RoomState is broadcast to
// the room, so all clients stay in lock-step with a single source of truth.
//
// Attached to an existing HTTP server (Vite's dev server, or a standalone one)
// on the `/ws` path, leaving every other upgrade — notably Vite's HMR socket —
// untouched. That single-origin design is what lets one tunnel expose the whole
// game to friends over the internet.
// ============================================================================

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';

import {
  addPlayer,
  autoPickCurrent,
  configurePlayer,
  createRoom,
  getPlayer,
  MP_MAX_PLAYERS,
  randomSeed,
  rematch,
  removePlayer,
  rollFor,
  pickFor,
  setConnected,
  setReady,
  skipFor,
  startDraft,
  type RoomState,
} from '../src/engine';
import { EDITIONS } from '../src/lib/editions';
import { decode, encode, type ClientMsg, type ErrorCode, type ServerMsg } from '../src/game/mpProtocol';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

interface ServerRoom {
  state: RoomState;
  /** playerId → secret token (proves identity on reconnect). */
  tokens: Map<string, string>;
  /** playerId → live socket. */
  sockets: Map<string, WebSocket>;
  autoTimer?: ReturnType<typeof setTimeout>;
  lastActivity: number;
}

interface ConnCtx {
  roomId: string;
  playerId: string;
}

const rooms = new Map<string, ServerRoom>();
const ctxOf = new WeakMap<WebSocket, ConnCtx>();

const AUTO_PICK_DELAY_MS = 2500; // grace before auto-drafting for a vanished player
const ROOM_IDLE_MS = 30 * 60 * 1000; // reap rooms left empty for half an hour
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 ambiguity

function newRoomCode(): string {
  let code = '';
  do {
    code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

// ---------------------------------------------------------------------------
// Send / broadcast
// ---------------------------------------------------------------------------

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(encode(msg));
}

function sendError(ws: WebSocket, code: ErrorCode, message: string): void {
  send(ws, { t: 'error', code, message });
}

function broadcast(room: ServerRoom): void {
  const msg: ServerMsg = { t: 'state', room: room.state };
  const payload = encode(msg);
  for (const ws of room.sockets.values()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

// ---------------------------------------------------------------------------
// Auto-draft for vanished players (keeps the game from ever stalling)
// ---------------------------------------------------------------------------

function scheduleAuto(room: ServerRoom): void {
  if (room.autoTimer) clearTimeout(room.autoTimer);
  room.autoTimer = undefined;

  const st = room.state;
  if (st.phase !== 'draft' || !st.currentId) return;
  const cur = getPlayer(st, st.currentId);
  if (!cur || cur.connected) return; // a connected player keeps their agency

  room.autoTimer = setTimeout(() => {
    room.autoTimer = undefined;
    if (room.state.phase !== 'draft') return;
    room.state = autoPickCurrent(room.state, EDITIONS);
    broadcast(room);
    scheduleAuto(room); // chain on if the next player is also gone
  }, AUTO_PICK_DELAY_MS);
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

function bind(ws: WebSocket, room: ServerRoom, playerId: string): void {
  ctxOf.set(ws, { roomId: room.state.id, playerId });
  room.sockets.set(playerId, ws);
}

function handle(ws: WebSocket, msg: ClientMsg): void {
  switch (msg.t) {
    case 'create': {
      const code = newRoomCode();
      const playerId = randomUUID();
      const token = randomUUID();
      let state = createRoom(code, randomSeed(), playerId, msg.mode ?? 'classico');
      state = addPlayer(state, { id: playerId, name: msg.name });
      const room: ServerRoom = { state, tokens: new Map([[playerId, token]]), sockets: new Map(), lastActivity: Date.now() };
      rooms.set(code, room);
      bind(ws, room, playerId);
      send(ws, { t: 'joined', roomId: code, playerId, token });
      broadcast(room);
      return;
    }

    case 'join': {
      const room = rooms.get((msg.roomId ?? '').toUpperCase().trim());
      if (!room) return sendError(ws, 'room_not_found', 'Sala não encontrada.');
      if (room.state.phase !== 'lobby') return sendError(ws, 'already_started', 'Essa partida já começou.');
      if (room.state.players.length >= MP_MAX_PLAYERS) return sendError(ws, 'room_full', 'Sala cheia.');
      const playerId = randomUUID();
      const token = randomUUID();
      const next = addPlayer(room.state, { id: playerId, name: msg.name });
      if (next === room.state) return sendError(ws, 'room_full', 'Não foi possível entrar na sala.');
      room.state = next;
      room.tokens.set(playerId, token);
      bind(ws, room, playerId);
      send(ws, { t: 'joined', roomId: room.state.id, playerId, token });
      broadcast(room);
      return;
    }

    case 'reconnect': {
      const room = rooms.get((msg.roomId ?? '').toUpperCase().trim());
      if (!room) return sendError(ws, 'room_not_found', 'Sala não encontrada.');
      if (room.tokens.get(msg.playerId) !== msg.token || !getPlayer(room.state, msg.playerId)) {
        return sendError(ws, 'invalid_token', 'Sessão inválida.');
      }
      // Drop any stale socket for this player, then re-attach.
      const stale = room.sockets.get(msg.playerId);
      if (stale && stale !== ws) stale.close();
      bind(ws, room, msg.playerId);
      room.state = setConnected(room.state, msg.playerId, true);
      send(ws, { t: 'joined', roomId: room.state.id, playerId: msg.playerId, token: msg.token });
      broadcast(room);
      scheduleAuto(room);
      return;
    }

    default:
      handleInRoom(ws, msg);
  }
}

function handleInRoom(ws: WebSocket, msg: Exclude<ClientMsg, { t: 'create' } | { t: 'join' } | { t: 'reconnect' }>): void {
  const ctx = ctxOf.get(ws);
  const room = ctx ? rooms.get(ctx.roomId) : undefined;
  if (!ctx || !room) return sendError(ws, 'bad_request', 'Você não está numa sala.');
  const me = ctx.playerId;

  switch (msg.t) {
    case 'configure':
      room.state = configurePlayer(room.state, me, { name: msg.name, formation: msg.formation, style: msg.style });
      break;
    case 'ready':
      room.state = setReady(room.state, me, !!msg.ready);
      break;
    case 'start':
      if (me !== room.state.hostId) return sendError(ws, 'bad_request', 'Só o anfitrião começa a partida.');
      room.state = startDraft(room.state);
      break;
    case 'roll':
      room.state = rollFor(room.state, EDITIONS, me);
      break;
    case 'pick':
      room.state = pickFor(room.state, EDITIONS, me, msg.cardId);
      break;
    case 'skip':
      room.state = skipFor(room.state, me);
      break;
    case 'rematch':
      if (me !== room.state.hostId) return sendError(ws, 'bad_request', 'Só o anfitrião reinicia.');
      room.state = rematch(room.state, randomSeed());
      break;
    case 'leave':
      detach(ws);
      return;
  }

  broadcast(room);
  scheduleAuto(room);
}

// ---------------------------------------------------------------------------
// Disconnect handling
// ---------------------------------------------------------------------------

function detach(ws: WebSocket): void {
  const ctx = ctxOf.get(ws);
  ctxOf.delete(ws);
  if (!ctx) return;
  const room = rooms.get(ctx.roomId);
  if (!room) return;

  if (room.sockets.get(ctx.playerId) === ws) room.sockets.delete(ctx.playerId);

  if (room.state.phase === 'lobby') {
    // In the lobby the player is removed outright (their slot frees up).
    room.state = removePlayer(room.state, ctx.playerId);
    room.tokens.delete(ctx.playerId);
  } else {
    // Mid-game we keep their squad and just mark them gone (they can reconnect);
    // removePlayer handles the disconnect flag + host migration in one step.
    room.state = removePlayer(room.state, ctx.playerId);
  }

  if (room.state.players.length === 0 && room.sockets.size === 0) {
    if (room.autoTimer) clearTimeout(room.autoTimer);
    rooms.delete(room.state.id);
    return;
  }

  broadcast(room);
  scheduleAuto(room);
}

// ---------------------------------------------------------------------------
// Idle room reaper
// ---------------------------------------------------------------------------

let reaper: ReturnType<typeof setInterval> | null = null;
function startReaper(): void {
  if (reaper) return;
  reaper = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const anyConnected = [...room.sockets.values()].some((s) => s.readyState === WebSocket.OPEN);
      if (!anyConnected && now - room.lastActivity > ROOM_IDLE_MS) {
        if (room.autoTimer) clearTimeout(room.autoTimer);
        rooms.delete(code);
      }
    }
  }, 60_000);
  reaper.unref?.();
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

const ATTACHED = Symbol.for('copa.gameServer.attached');

/**
 * Attach the multiplayer server to an HTTP server, handling WebSocket upgrades
 * on `/ws` only. Idempotent — safe to call across Vite restarts/HMR.
 */
export function attachGameServer(httpServer: HttpServer): void {
  const flagged = httpServer as HttpServer & { [ATTACHED]?: boolean };
  if (flagged[ATTACHED]) return;
  flagged[ATTACHED] = true;

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = (req.url ?? '').split('?')[0];
    if (pathname !== '/ws') return; // leave Vite HMR (and everything else) alone
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket) => {
    ws.on('message', (data: Buffer) => {
      const ctx = ctxOf.get(ws);
      const room = ctx && rooms.get(ctx.roomId);
      if (room) room.lastActivity = Date.now();

      const msg = decode<ClientMsg>(data.toString());
      if (!msg) return sendError(ws, 'bad_request', 'Mensagem inválida.');
      try {
        handle(ws, msg);
      } catch (err) {
        console.error('[gameServer] handler error', err);
        sendError(ws, 'internal', 'Erro interno no servidor.');
      }
    });

    ws.on('close', () => detach(ws));
    ws.on('error', () => detach(ws));
  });

  startReaper();
  console.log('[gameServer] multiplayer ready on /ws');
}

/** Test-only: clear all rooms between cases. */
export function _resetRooms(): void {
  for (const room of rooms.values()) if (room.autoTimer) clearTimeout(room.autoTimer);
  rooms.clear();
}
