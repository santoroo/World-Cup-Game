import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { EDITIONS } from '../src/lib/editions';
import { pickOptions, type RoomState } from '../src/engine';
import type { ClientMsg, ServerMsg } from '../src/game/mpProtocol';
import { _resetRooms, attachGameServer } from './gameServer';

// ---------------------------------------------------------------------------
// A tiny promise-driven test client over the real WebSocket protocol.
// ---------------------------------------------------------------------------
class TestClient {
  ws!: WebSocket;
  id: string | null = null;
  token: string | null = null;
  roomId: string | null = null;
  state: RoomState | null = null;
  lastError: ServerMsg & { t: 'error' } | null = null;
  private waiters: { pred: (c: TestClient) => boolean; resolve: () => void }[] = [];

  static connect(url: string): Promise<TestClient> {
    const c = new TestClient();
    c.ws = new WebSocket(url);
    c.ws.on('message', (data: Buffer) => c.onMessage(data.toString()));
    return new Promise((resolve, reject) => {
      c.ws.on('open', () => resolve(c));
      c.ws.on('error', reject);
    });
  }

  private onMessage(raw: string): void {
    const msg = JSON.parse(raw) as ServerMsg;
    if (msg.t === 'joined') {
      this.id = msg.playerId;
      this.token = msg.token;
      this.roomId = msg.roomId;
    } else if (msg.t === 'state') {
      this.state = msg.room;
    } else if (msg.t === 'error') {
      this.lastError = msg;
    }
    this.waiters = this.waiters.filter((w) => {
      if (!w.pred(this)) return true;
      w.resolve();
      return false;
    });
  }

  send(msg: ClientMsg): void {
    this.ws.send(JSON.stringify(msg));
  }

  waitFor(pred: (c: TestClient) => boolean, ms = 5000, label = ''): Promise<void> {
    if (pred(this)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`waitFor timed out: ${label}`)), ms);
      this.waiters.push({
        pred,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
      });
    });
  }

  close(): void {
    this.ws.close();
  }
}

let server: Server;
let url: string;

beforeEach(async () => {
  _resetRooms();
  server = createServer();
  attachGameServer(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  url = `ws://127.0.0.1:${port}/ws`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Stand up a lobby of N connected, ready players (returns clients, host first). */
async function readyLobby(n: number): Promise<TestClient[]> {
  const host = await TestClient.connect(url);
  host.send({ t: 'create', name: 'Host' });
  await host.waitFor((c) => !!c.id && !!c.state);
  const roomId = host.roomId!;

  const clients = [host];
  for (let i = 1; i < n; i++) {
    const c = await TestClient.connect(url);
    c.send({ t: 'join', roomId, name: `P${i + 1}` });
    await c.waitFor((x) => !!x.id && !!x.state);
    clients.push(c);
  }
  // Everyone sees everyone.
  await host.waitFor((c) => (c.state?.players.length ?? 0) === n);
  for (const c of clients) c.send({ t: 'ready', ready: true });
  await host.waitFor((c) => !!c.state && c.state.players.every((p) => p.ready));
  return clients;
}

/** Drive a started draft to completion, observing through the host. */
async function playToBracket(clients: TestClient[]): Promise<void> {
  const host = clients[0];
  const byId = (id: string) => clients.find((c) => c.id === id)!;
  let safety = 0;
  while (host.state!.phase === 'draft' && safety++ < 400) {
    const curId = host.state!.currentId!;
    const actor = byId(curId);

    actor.send({ t: 'roll' });
    await host.waitFor(
      (c) => c.state!.phase !== 'draft' || (c.state!.currentId === curId && c.state!.rolledEditionId !== null),
    );
    if (host.state!.phase !== 'draft') break;

    const opts = pickOptions(host.state!, EDITIONS, curId);
    expect(opts.length).toBeGreaterThan(0);
    const before = host.state!.usedPlayerIds.length;
    actor.send({ t: 'pick', cardId: opts[0].id });
    await host.waitFor((c) => c.state!.usedPlayerIds.length === before + 1 || c.state!.phase !== 'draft');
  }
}

/** Conduz, pela rede, qualquer disputa de pênaltis até o chaveamento terminar. */
async function resolverDisputasWS(clients: TestClient[]): Promise<void> {
  const host = clients[0];
  const byId = (id: string) => clients.find((c) => c.id === id)!;
  let safety = 0;
  while (host.state!.disputaPenaltis && safety++ < 600) {
    const d = host.state!.disputaPenaltis!;
    if (d.prazo == null) {
      // Os dois envolvidos sinalizam que terminaram o replay → arma a cobrança.
      byId(d.aId).send({ t: 'prontoPenalti' });
      byId(d.bId).send({ t: 'prontoPenalti' });
      await host.waitFor((c) => !c.state!.disputaPenaltis || c.state!.disputaPenaltis.prazo != null);
      continue;
    }
    const cobrador = d.vez === 'a' ? d.aId : d.bId;
    const defensor = d.vez === 'a' ? d.bId : d.aId;
    const histAntes = d.historico.length;
    byId(cobrador).send({ t: 'penalti', dir: 'esquerda' });
    byId(defensor).send({ t: 'penalti', dir: 'direita' });
    await host.waitFor((c) => {
      const nd = c.state!.disputaPenaltis;
      return !nd || nd.partidaId !== d.partidaId || nd.historico.length > histAntes;
    });
  }
}

describe('gameServer integration', () => {
  for (const n of [2, 3, 5]) {
    it(`runs a full ${n}-player game over WebSocket to a champion`, async () => {
      const clients = await readyLobby(n);
      const host = clients[0];

      host.send({ t: 'start' });
      await host.waitFor((c) => c.state!.phase === 'draft');

      await playToBracket(clients);
      await resolverDisputasWS(clients);

      expect(host.state!.phase).toBe('bracket');
      const champ = host.state!.bracket!.championId;
      expect(host.state!.players.map((p) => p.id)).toContain(champ);
      // Every client agrees on the same champion (single source of truth).
      for (const c of clients) {
        await c.waitFor((x) => x.state!.bracket?.championId === champ);
      }
      for (const c of clients) c.close();
    }, 20000);
  }

  it('rejects joining an unknown or already-started room', async () => {
    const ghost = await TestClient.connect(url);
    ghost.send({ t: 'join', roomId: 'ZZZZ', name: 'Nobody' });
    await ghost.waitFor((c) => c.lastError?.code === 'room_not_found');

    const clients = await readyLobby(2);
    clients[0].send({ t: 'start' });
    await clients[0].waitFor((c) => c.state!.phase === 'draft');

    const latecomer = await TestClient.connect(url);
    latecomer.send({ t: 'join', roomId: clients[0].roomId!, name: 'Late' });
    await latecomer.waitFor((c) => c.lastError?.code === 'already_started');

    ghost.close();
    latecomer.close();
    for (const c of clients) c.close();
  }, 15000);

  it('lets a player reconnect mid-draft and stay in sync', async () => {
    const clients = await readyLobby(3);
    const host = clients[0];
    host.send({ t: 'start' });
    await host.waitFor((c) => c.state!.phase === 'draft');

    // Drop a player who is neither the host (our observer) nor on the clock
    // (so no auto-pick races us).
    const victim = clients.find((c) => c !== host && c.id !== host.state!.currentId)!;
    const victimId = victim.id!;
    const token = victim.token!;
    const roomId = victim.roomId!;
    victim.close();
    await host.waitFor((c) => c.state!.players.find((p) => p.id === victimId)?.connected === false, 5000, 'disc');

    const back = await TestClient.connect(url);
    back.send({ t: 'reconnect', roomId, playerId: victimId, token });
    await back.waitFor((c) => !!c.state && c.id === victimId, 5000, 'back-joined');
    await host.waitFor((c) => c.state!.players.find((p) => p.id === victimId)?.connected === true, 5000, 'reconnected');

    back.close();
    for (const c of clients) if (c !== victim) c.close();
  }, 15000);
});
