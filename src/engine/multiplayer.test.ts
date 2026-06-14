import { describe, expect, it } from 'vitest';
import editionsRaw from '../data/editions.json';
import {
  addPlayer,
  autoPickCurrent,
  buildBracket,
  canStart,
  configurePlayer,
  createRoom,
  definirDirecaoPenalti,
  eligibleOpenSlots,
  getPlayer,
  isDraftComplete,
  loadEditions,
  marcarProntoPenalti,
  MAX_FREE_SKIPS,
  MP_MAX_PLAYERS,
  MP_SQUAD_SIZE,
  moverFor,
  pickFor,
  pickOptions,
  rematch,
  removePlayer,
  rollFor,
  setReady,
  skipFor,
  startDraft,
  timeoutPenalti,
  type DraftState,
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

/** Conduz o draft (sem resolver pênaltis), parando ao entrar no chaveamento. */
function conduzirDraft(start: RoomState, editions: Edition[]): { room: RoomState; turnOrder: string[] } {
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

/** Draft completo + conduz qualquer disputa de pênaltis até o chaveamento terminar. */
function playFullDraft(start: RoomState, editions: Edition[]): { room: RoomState; turnOrder: string[] } {
  const { room, turnOrder } = conduzirDraft(start, editions);
  return { room: resolverDisputasAteOFim(room), turnOrder };
}

/** Conduz qualquer disputa de pênaltis interativa até o chaveamento terminar. */
function resolverDisputasAteOFim(start: RoomState): RoomState {
  let room = start;
  let guard = 0;
  while (room.disputaPenaltis && guard++ < 2000) {
    let d = room.disputaPenaltis;
    if (d.prazo == null) {
      // Os dois envolvidos "ficam prontos" (terminaram o replay) → arma a cobrança.
      room = marcarProntoPenalti(room, d.aId, 0);
      room = marcarProntoPenalti(room, d.bId, 0);
      d = room.disputaPenaltis!;
    }
    const cobrador = d.vez === 'a' ? d.aId : d.bId;
    const defensor = d.vez === 'a' ? d.bId : d.aId;
    room = definirDirecaoPenalti(room, EDITIONS, cobrador, 'esquerda', 0);
    room = definirDirecaoPenalti(room, EDITIONS, defensor, 'direita', 0);
  }
  return room;
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
      // Fase de grupos computada e um campeão coroado (humano OU seleção da CPU).
      expect(room.phase).toBe('bracket');
      expect(room.grupos).not.toBeNull();
      expect(room.bracket).not.toBeNull();
      expect(room.bracket!.championId).not.toBeNull();
      expect(room.grupos!.classificados).toContain(room.bracket!.championId);
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

describe('mp posição (escolha de vaga, igual ao solo)', () => {
  // Estado de draft "sintético" do jogador, pra reusar os helpers do engine.
  const draftLike = (room: RoomState, id: string): DraftState => {
    const m = getPlayer(room, id)!;
    return { seed: '', formation: m.formation, placed: m.placed, usedPlayerIds: room.usedPlayerIds, skipsUsed: 0, rollCount: 0 };
  };

  it('pickFor respeita a vaga escolhida e moverFor reposiciona o próprio time', () => {
    let room = startDraft(lobby(2, 'pos-seed'));
    const cur = room.currentId!;
    room = rollFor(room, EDITIONS, cur);
    const opts = pickOptions(room, EDITIONS, cur);
    expect(opts.length).toBeGreaterThan(0);

    // Prefere um jogador versátil (encaixa em ≥2 vagas) pra exercer a escolha.
    const versatil = opts.find((p) => eligibleOpenSlots(draftLike(room, cur), p).length >= 2) ?? opts[0];
    const elig = eligibleOpenSlots(draftLike(room, cur), versatil);
    const alvo = elig[elig.length - 1]; // não necessariamente a "melhor" vaga

    room = pickFor(room, EDITIONS, cur, versatil.id, alvo.id);
    const colocado = getPlayer(room, cur)!.placed.find((pp) => pp.player.id === versatil.id);
    expect(colocado?.slotId).toBe(alvo.id);

    if (elig.length >= 2) {
      const destino = elig.find((s) => s.id !== alvo.id)!;
      room = moverFor(room, cur, alvo.id, destino.id);
      const movido = getPlayer(room, cur)!.placed.find((pp) => pp.player.id === versatil.id);
      expect(movido?.slotId).toBe(destino.id);
    }
  });

  it('pickFor cai na melhor vaga quando nenhum slotId é dado (auto-pick)', () => {
    let room = startDraft(lobby(2, 'auto-slot'));
    const cur = room.currentId!;
    room = rollFor(room, EDITIONS, cur);
    const opts = pickOptions(room, EDITIONS, cur);
    room = pickFor(room, EDITIONS, cur, opts[0].id); // sem slotId
    expect(getPlayer(room, cur)!.placed).toHaveLength(1);
  });
});

describe('mp fase de grupos', () => {
  const humanos = new Set<string>();
  const ehHumano = (room: RoomState, id: string) => room.players.some((p) => p.id === id);

  for (const n of [2, 3, 5]) {
    it(`${n} humanos → ${n} grupos de 4 (1 humano + 3 CPU), top 2 classificam`, () => {
      const room = playFullDraft(lobby(n, `g-${n}`), EDITIONS).room;
      const fg = room.grupos!;
      expect(fg).not.toBeNull();
      expect(fg.grupos).toHaveLength(n);

      humanos.clear();
      for (const gr of fg.grupos) {
        expect(gr.competidores).toHaveLength(4);
        expect(gr.jogos).toHaveLength(6); // round-robin de 4 = 6 jogos
        expect(gr.tabela).toHaveLength(4);
        const humanosNoGrupo = gr.competidores.filter((id) => ehHumano(room, id));
        expect(humanosNoGrupo).toHaveLength(1); // exatamente 1 humano por grupo
        humanos.add(humanosNoGrupo[0]);
      }
      expect(humanos.size).toBe(n); // cada humano num grupo diferente
      expect(fg.classificados).toHaveLength(2 * n); // top 2 de cada grupo
    });
  }

  it('o campeão é sempre um dos classificados (pode ser CPU)', () => {
    const room = playFullDraft(lobby(2, 'champ-g'), EDITIONS).room;
    expect(room.grupos!.classificados).toContain(room.bracket!.championId);
  });

  it('grupos determinísticos por seed', () => {
    const a = playFullDraft(lobby(3, 'det-g'), EDITIONS).room;
    const b = playFullDraft(lobby(3, 'det-g'), EDITIONS).room;
    expect(JSON.stringify(a.grupos)).toBe(JSON.stringify(b.grupos));
  });

  it('todo confronto resolvido do mata-mata tem um vencedor entre os dois lados', () => {
    const room = playFullDraft(lobby(4, 'b4-g'), EDITIONS).room;
    for (const round of room.bracket!.rounds) {
      for (const m of round) {
        if (!m.result || !m.result.winnerId) continue;
        expect([m.aId, m.bId]).toContain(m.result.winnerId);
      }
    }
  });
});

describe('mp disputa de pênaltis (online, interativa, só humano×humano)', () => {
  // A disputa só é criada quando os DOIS lados são humanos. Varre seeds/tamanhos
  // até dois humanos se cruzarem no mata-mata e empatarem.
  function ateUmaDisputa(): RoomState | null {
    for (let n = 2; n <= 5; n++) {
      for (let i = 0; i < 250; i++) {
        const { room } = conduzirDraft(lobby(n, `pen-${n}-${i}`), EDITIONS);
        if (room.disputaPenaltis) return room;
      }
    }
    return null;
  }

  it('empate humano×humano pausa o chaveamento e abre a disputa', () => {
    const room = ateUmaDisputa();
    expect(room, 'esperava um empate humano×humano').not.toBeNull();
    const d = room!.disputaPenaltis!;
    expect(room!.players.some((p) => p.id === d.aId)).toBe(true); // os dois são humanos
    expect(room!.players.some((p) => p.id === d.bId)).toBe(true);
    expect(room!.bracket!.championId).toBeNull(); // pausado, sem campeão ainda
    const m = room!.bracket!.rounds.flat().find((x) => x.id === d.partidaId)!;
    expect(m.result!.winnerId).toBeNull();
    expect(m.result!.a.goals).toBe(m.result!.b.goals); // empate no tempo normal
  });

  it('só decide depois dos dois prontos; as escolhas levam a um campeão', () => {
    let room = ateUmaDisputa()!;
    const d = room.disputaPenaltis!;
    // Antes de armar (ninguém pronto), escolher canto não faz nada.
    expect(definirDirecaoPenalti(room, EDITIONS, d.aId, 'esquerda', 0)).toBe(room);
    room = marcarProntoPenalti(room, d.aId, 0);
    room = marcarProntoPenalti(room, d.bId, 0);
    expect(room.disputaPenaltis!.prazo).not.toBeNull();
    room = resolverDisputasAteOFim(room);
    expect(room.disputaPenaltis).toBeNull();
    expect(room.grupos!.classificados).toContain(room.bracket!.championId);
  });

  it('timeout auto-resolve a cobrança quando ninguém escolhe', () => {
    let room = ateUmaDisputa()!;
    const d = room.disputaPenaltis!;
    room = marcarProntoPenalti(room, d.aId, 0);
    room = marcarProntoPenalti(room, d.bId, 0);
    const golsAntes = room.disputaPenaltis!.historico.length;
    room = timeoutPenalti(room, EDITIONS, 1_000_000); // estourou o prazo, ninguém escolheu
    const depois = room.disputaPenaltis ? room.disputaPenaltis.historico.length : Infinity;
    expect(depois).toBeGreaterThan(golsAntes);
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
    const a = buildBracket(room, EDITIONS);
    const b = buildBracket(room, EDITIONS);
    expect(a.championId).toBe(b.championId);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
