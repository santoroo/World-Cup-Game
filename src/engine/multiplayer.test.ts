import { describe, expect, it } from 'vitest';
import editionsRaw from '../data/editions.json';
import {
  addPlayer,
  autoPickCurrent,
  buildBracket,
  canStart,
  configurePlayer,
  createRoom,
  getPlayer,
  isDraftComplete,
  loadEditions,
  MAX_FREE_SKIPS,
  MP_MAX_PLAYERS,
  MP_SQUAD_SIZE,
  pickFor,
  pickOptions,
  rematch,
  removePlayer,
  rollFor,
  setReady,
  skipFor,
  startDraft,
  type Edition,
  type RawEdition,
  type RoomState,
} from './index';

const EDITIONS = loadEditions((editionsRaw as { editions: RawEdition[] }).editions);

/** Build a ready-to-start lobby with N players. */
function lobby(n: number, seed = 'room-seed'): RoomState {
  let room = createRoom('ABCD', seed, 'p1', 'classico');
  for (let i = 1; i <= n; i++) {
    room = addPlayer(room, { id: `p${i}`, name: `P${i}` });
    room = setReady(room, `p${i}`, true);
  }
  return room;
}

/** Drive a complete draft using a deterministic "take the first option" policy. */
function playFullDraft(start: RoomState, editions: Edition[]): { room: RoomState; turnOrder: string[] } {
  let room = startDraft(start);
  const turnOrder: string[] = [];
  let guard = 0;
  while (room.phase === 'draft' && guard++ < 1000) {
    const cur = room.currentId!;
    turnOrder.push(cur);
    room = rollFor(room, editions, cur);
    const opts = pickOptions(room, editions, cur);
    if (opts.length === 0) {
      room = autoPickCurrent(room, editions); // safety net; should be rare
      continue;
    }
    room = pickFor(room, editions, cur, opts[0].id);
  }
  return { room, turnOrder };
}

describe('mp lobby', () => {
  it('assigns the first joiner as host and caps the room', () => {
    let room = createRoom('ABCD', 's', 'x');
    for (let i = 1; i <= MP_MAX_PLAYERS + 2; i++) room = addPlayer(room, { id: `p${i}`, name: `` });
    expect(room.players).toHaveLength(MP_MAX_PLAYERS);
    expect(room.hostId).toBe('p1');
    expect(room.players[0].name).toBe('Jogador 1'); // blank → fallback
    expect(new Set(room.players.map((p) => p.avatar)).size).toBe(MP_MAX_PLAYERS); // distinct avatars
  });

  it('remembers the chosen game mode (e.g. almanaque) through the draft', () => {
    const room = createRoom('ABCD', 's', 'p1', 'almanaque');
    expect(room.mode).toBe('almanaque');
    const drafting = startDraft(lobby(2, 'mode-seed'));
    expect(drafting.mode).toBe('classico'); // lobby() builds a classico room
    const alm = createRoom('EFGH', 'mode2', 'p1', 'almanaque');
    expect(alm.mode).toBe('almanaque');
  });

  it('ignores duplicate ids', () => {
    let room = addPlayer(createRoom('ABCD', 's', 'x'), { id: 'p1', name: 'A' });
    room = addPlayer(room, { id: 'p1', name: 'again' });
    expect(room.players).toHaveLength(1);
  });

  it('requires 2+ players, all ready and connected, to start', () => {
    let room = lobby(1);
    expect(canStart(room)).toBe(false); // only one
    room = lobby(3);
    expect(canStart(room)).toBe(true);
    room = setReady(room, 'p2', false);
    expect(canStart(room)).toBe(false);
  });

  it('configuring a player clears their ready flag', () => {
    let room = lobby(2);
    expect(getPlayer(room, 'p1')!.ready).toBe(true);
    room = configurePlayer(room, 'p1', { formation: '3-5-2', style: 'ofensivo' });
    expect(getPlayer(room, 'p1')!.ready).toBe(false);
    expect(getPlayer(room, 'p1')!.formation).toBe('3-5-2');
    expect(getPlayer(room, 'p1')!.style).toBe('ofensivo');
  });

  it('removing a lobby player migrates the host', () => {
    let room = lobby(3);
    room = removePlayer(room, 'p1');
    expect(getPlayer(room, 'p1')).toBeUndefined();
    expect(room.hostId).toBe('p2');
  });
});

describe('mp draft', () => {
  for (const n of [2, 3, 4, 5]) {
    it(`completes a full ${n}-player draft with global uniqueness and a champion`, () => {
      const { room } = playFullDraft(lobby(n, `seed-${n}`), EDITIONS);

      expect(isDraftComplete(room)).toBe(true);
      // Every squad is full.
      for (const p of room.players) expect(p.placed).toHaveLength(MP_SQUAD_SIZE);
      // No player drafted twice anywhere.
      const allIds = room.players.flatMap((p) => p.placed.map((pp) => pp.player.id));
      expect(new Set(allIds).size).toBe(allIds.length);
      expect(allIds.length).toBe(n * MP_SQUAD_SIZE);
      expect(room.usedPlayerIds.length).toBe(n * MP_SQUAD_SIZE);
      // Bracket produced exactly one champion among the players.
      expect(room.phase).toBe('bracket');
      expect(room.bracket).not.toBeNull();
      expect(room.players.map((p) => p.id)).toContain(room.bracket!.championId);
    });
  }

  it('is deterministic: same seed → same champion and same picks', () => {
    const a = playFullDraft(lobby(4, 'fixed'), EDITIONS).room;
    const b = playFullDraft(lobby(4, 'fixed'), EDITIONS).room;
    expect(a.bracket!.championId).toBe(b.bracket!.championId);
    expect(a.usedPlayerIds).toEqual(b.usedPlayerIds);
  });

  it('follows a snake order (reverses every round)', () => {
    const { room, turnOrder } = playFullDraft(lobby(3, 'snake'), EDITIONS);
    const order = startDraft(lobby(3, 'snake')).order;
    expect(room.order).toEqual(order);
    // First round = order; second round = reversed; etc.
    expect(turnOrder.slice(0, 3)).toEqual(order);
    expect(turnOrder.slice(3, 6)).toEqual([...order].reverse());
    expect(turnOrder.slice(6, 9)).toEqual(order);
  });

  it('rejects acting out of turn and picking an unavailable player', () => {
    let room = startDraft(lobby(2, 'turns'));
    const cur = room.currentId!;
    const other = room.players.find((p) => p.id !== cur)!.id;
    room = rollFor(room, EDITIONS, cur);
    // Wrong player can't pick.
    const before = room;
    room = pickFor(room, EDITIONS, other, pickOptions(before, EDITIONS, cur)[0]?.id ?? 'nope');
    expect(room).toBe(before);
    // Picking a bogus id is a no-op.
    expect(pickFor(before, EDITIONS, cur, 'does-not-exist')).toBe(before);
  });

  it('skip consumes a limited resource and re-rolls', () => {
    let room = startDraft(lobby(2, 'skips'));
    const cur = room.currentId!;
    room = rollFor(room, EDITIONS, cur);
    expect(room.rolledEditionId).not.toBeNull();
    room = skipFor(room, cur);
    expect(room.rolledEditionId).toBeNull();
    expect(getPlayer(room, cur)!.skipsUsed).toBe(1);
    // Burn through the cap; further skips are no-ops.
    for (let i = 0; i < MAX_FREE_SKIPS + 3; i++) {
      room = rollFor(room, EDITIONS, cur);
      room = skipFor(room, cur);
    }
    expect(getPlayer(room, cur)!.skipsUsed).toBe(MAX_FREE_SKIPS);
  });
});

describe('mp bracket shape', () => {
  function finishedRoom(n: number, seed: string): RoomState {
    return playFullDraft(lobby(n, seed), EDITIONS).room;
  }

  it('2 players → a single Final', () => {
    const room = finishedRoom(2, 'b2');
    expect(room.bracket!.rounds).toHaveLength(1);
    expect(room.bracket!.rounds[0][0].stageLabel).toBe('Final');
    expect(room.bracket!.rounds[0][0].result).not.toBeNull();
  });

  it('3 players → top seed gets a bye into the Final', () => {
    const room = finishedRoom(3, 'b3');
    const rounds = room.bracket!.rounds;
    expect(rounds).toHaveLength(2); // semis + final
    const byes = rounds[0].filter((m) => m.byeId !== null);
    expect(byes).toHaveLength(1); // exactly one walkover
    expect(rounds[1][0].stageLabel).toBe('Final');
  });

  it('5 players → quarters/semis/final with three byes', () => {
    const room = finishedRoom(5, 'b5');
    const rounds = room.bracket!.rounds;
    expect(rounds).toHaveLength(3);
    expect(rounds[0]).toHaveLength(4); // 4 quarter slots in an 8-bracket
    const byes = rounds[0].filter((m) => m.byeId !== null);
    expect(byes).toHaveLength(3); // 8 - 5 = 3 walkovers
    expect(rounds[2][0].stageLabel).toBe('Final');
  });

  it('every played tie has a winner that is one of its two sides', () => {
    const room = finishedRoom(4, 'b4');
    for (const round of room.bracket!.rounds) {
      for (const m of round) {
        if (!m.result) continue;
        expect([m.aId, m.bId]).toContain(m.result.winnerId);
      }
    }
  });
});

describe('mp resilience', () => {
  it('auto-picks for a stalled current player so the draft never blocks', () => {
    let room = startDraft(lobby(3, 'auto'));
    const cur = room.currentId!;
    const filledBefore = getPlayer(room, cur)!.placed.length;
    room = autoPickCurrent(room, EDITIONS);
    // The stalled player advanced (got a player) and it's no longer their turn.
    expect(getPlayer(room, cur)!.placed.length).toBe(filledBefore + 1);
    expect(room.currentId).not.toBe(cur);
  });

  it('rematch returns everyone to a clean lobby with a new seed', () => {
    const finished = playFullDraft(lobby(2, 'rm'), EDITIONS).room;
    const fresh = rematch(finished, 'new-seed');
    expect(fresh.phase).toBe('lobby');
    expect(fresh.seed).toBe('new-seed');
    expect(fresh.usedPlayerIds).toHaveLength(0);
    expect(fresh.bracket).toBeNull();
    for (const p of fresh.players) {
      expect(p.placed).toHaveLength(0);
      expect(p.ready).toBe(false);
    }
  });
});

// buildBracket is exercised above through the full flow; this nails determinism.
describe('buildBracket determinism', () => {
  it('is a pure function of room state', () => {
    const room = playFullDraft(lobby(4, 'pure'), EDITIONS).room;
    const a = buildBracket(room);
    const b = buildBracket(room);
    expect(a.championId).toBe(b.championId);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
