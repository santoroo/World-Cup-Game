// ============================================================================
// Multiplayer wire protocol — the message contract shared by the React client
// and the WebSocket server. Pure types + tiny guards, no runtime dependencies,
// so both sides import the exact same definitions.
// ============================================================================

import type { DirecaoPenalti, Formation, GameMode, PlayStyle, RoomState } from '../engine';

/** Messages the client sends to the server. */
export type ClientMsg =
  | { t: 'create'; name: string; mode?: GameMode }
  | { t: 'join'; roomId: string; name: string }
  | { t: 'reconnect'; roomId: string; playerId: string; token: string }
  | { t: 'configure'; name?: string; formation?: Formation; style?: PlayStyle }
  | { t: 'ready'; ready: boolean }
  | { t: 'start' }
  | { t: 'roll' }
  | { t: 'pick'; cardId: string; slotId?: string }
  | { t: 'mover'; de: string; para: string }
  | { t: 'trocar'; a: string; b: string }
  | { t: 'skip' }
  | { t: 'prontoPenalti' }
  | { t: 'penalti'; dir: DirecaoPenalti }
  | { t: 'rematch' }
  | { t: 'leave' };

/** Messages the server sends to the client. */
export type ServerMsg =
  | { t: 'joined'; roomId: string; playerId: string; token: string }
  | { t: 'state'; room: RoomState }
  | { t: 'error'; code: ErrorCode; message: string };

export type ErrorCode =
  | 'bad_request'
  | 'room_not_found'
  | 'room_full'
  | 'already_started'
  | 'not_your_turn'
  | 'invalid_token'
  | 'internal';

export function encode(msg: ClientMsg | ServerMsg): string {
  return JSON.stringify(msg);
}

export function decode<T = ClientMsg | ServerMsg>(raw: string): T | null {
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object' && typeof obj.t === 'string') return obj as T;
    return null;
  } catch {
    return null;
  }
}
