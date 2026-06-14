// ============================================================================
// Multiplayer client — a thin React layer over the WebSocket protocol. It owns
// the live connection (with auto-reconnect), the authoritative RoomState pushed
// by the server, and the local player's identity (persisted so a refresh or a
// dropped connection rejoins the same seat). All game rules live on the server;
// this only sends intents and renders snapshots.
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { pickOptions, type GameMode, type MpPlayer, type Player, type RoomState } from '../engine';
import { EDITIONS } from '../lib/editions';
import { decode, encode, type ClientMsg, type ServerMsg } from './mpProtocol';

export type MpStatus = 'connecting' | 'online' | 'offline';

interface Session {
  roomId: string;
  playerId: string;
  token: string;
}

const SESSION_KEY = 'copa-dos-sonhos:mp-session';

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function writeSession(s: Session | null): void {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable; reconnect simply won't persist */
  }
}

function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

interface MpContextValue {
  status: MpStatus;
  error: string | null;
  room: RoomState | null;
  myId: string | null;
  me: MpPlayer | null;
  isHost: boolean;
  isMyTurn: boolean;
  currentPlayer: MpPlayer | null;
  myPickOptions: Player[];
  clearError: () => void;
  create: (name: string, mode?: GameMode) => void;
  join: (roomId: string, name: string) => void;
  configure: (patch: { name?: string; formation?: MpPlayer['formation']; style?: MpPlayer['style'] }) => void;
  setReady: (ready: boolean) => void;
  start: () => void;
  roll: () => void;
  pick: (cardId: string) => void;
  skip: () => void;
  rematch: () => void;
  leave: () => void;
}

const MpContext = createContext<MpContextValue | null>(null);

export function MultiplayerProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<Session | null>(readSession());

  const [status, setStatus] = useState<MpStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [myId, setMyId] = useState<string | null>(sessionRef.current?.playerId ?? null);

  const handleServer = useCallback((msg: ServerMsg) => {
    switch (msg.t) {
      case 'joined':
        sessionRef.current = { roomId: msg.roomId, playerId: msg.playerId, token: msg.token };
        writeSession(sessionRef.current);
        setMyId(msg.playerId);
        setError(null);
        break;
      case 'state':
        setRoom(msg.room);
        break;
      case 'error':
        setError(msg.message);
        // A stale session (room gone / invalid) → drop it and show a clean entry.
        if (msg.code === 'room_not_found' || msg.code === 'invalid_token') {
          sessionRef.current = null;
          writeSession(null);
          setRoom(null);
          setMyId(null);
        }
        break;
    }
  }, []);

  // Open (and keep open) the socket for the provider's lifetime. `disposed` is a
  // per-effect-run flag (not a shared ref), so a socket closed during cleanup —
  // e.g. React StrictMode's mount/unmount/mount in dev — never triggers a stray
  // reconnect from the previous run.
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const ws = new WebSocket(wsUrl());
      socketRef.current = ws;
      setStatus('connecting');

      ws.onopen = () => {
        setStatus('online');
        // Resume an existing seat if we have one (refresh / dropped connection).
        if (sessionRef.current) ws.send(encode({ t: 'reconnect', ...sessionRef.current }));
      };
      ws.onmessage = (ev) => {
        const msg = decode<ServerMsg>(typeof ev.data === 'string' ? ev.data : '');
        if (msg) handleServer(msg);
      };
      ws.onclose = () => {
        if (disposed) return;
        setStatus('offline');
        if (!timer) timer = setTimeout(() => {
          timer = null;
          if (!disposed) connect();
        }, 1500);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      socketRef.current?.close();
    };
  }, [handleServer]);

  const send = useCallback((msg: ClientMsg) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(encode(msg));
  }, []);

  const create = useCallback(
    (name: string, mode?: GameMode) => {
      sessionRef.current = null;
      writeSession(null);
      setRoom(null);
      send({ t: 'create', name, mode });
    },
    [send],
  );
  const join = useCallback(
    (roomId: string, name: string) => {
      sessionRef.current = null;
      writeSession(null);
      setRoom(null);
      send({ t: 'join', roomId: roomId.toUpperCase().trim(), name });
    },
    [send],
  );
  const configure = useCallback<MpContextValue['configure']>((patch) => send({ t: 'configure', ...patch }), [send]);
  const setReady = useCallback((ready: boolean) => send({ t: 'ready', ready }), [send]);
  const start = useCallback(() => send({ t: 'start' }), [send]);
  const roll = useCallback(() => send({ t: 'roll' }), [send]);
  const pick = useCallback((cardId: string) => send({ t: 'pick', cardId }), [send]);
  const skip = useCallback(() => send({ t: 'skip' }), [send]);
  const rematch = useCallback(() => send({ t: 'rematch' }), [send]);
  const leave = useCallback(() => {
    send({ t: 'leave' });
    sessionRef.current = null;
    writeSession(null);
    setRoom(null);
    setMyId(null);
    setError(null);
  }, [send]);

  const me = useMemo(() => room?.players.find((p) => p.id === myId) ?? null, [room, myId]);
  const isHost = !!room && room.hostId === myId;
  const isMyTurn = !!room && room.phase === 'draft' && room.currentId === myId;
  const currentPlayer = useMemo(
    () => (room?.currentId ? room.players.find((p) => p.id === room.currentId) ?? null : null),
    [room],
  );
  const myPickOptions = useMemo(
    () => (isMyTurn && myId ? pickOptions(room!, EDITIONS, myId) : []),
    [isMyTurn, myId, room],
  );

  const value: MpContextValue = {
    status,
    error,
    room,
    myId,
    me,
    isHost,
    isMyTurn,
    currentPlayer,
    myPickOptions,
    clearError: useCallback(() => setError(null), []),
    create,
    join,
    configure,
    setReady,
    start,
    roll,
    pick,
    skip,
    rematch,
    leave,
  };

  return <MpContext.Provider value={value}>{children}</MpContext.Provider>;
}

export function useMultiplayer(): MpContextValue {
  const ctx = useContext(MpContext);
  if (!ctx) throw new Error('useMultiplayer must be used within MultiplayerProvider');
  return ctx;
}
