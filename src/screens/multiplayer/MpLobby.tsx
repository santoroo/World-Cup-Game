import { useState } from 'react';
import { Button } from '../../components/Button';
import { FormationPitch } from '../../components/FormationPitch';
import {
  canStart,
  FORMATION_LIST,
  MP_MAX_PLAYERS,
  type Formation,
  type PlayStyle,
} from '../../engine';
import { useMultiplayer } from '../../game/useMultiplayer';

const STYLES: { id: PlayStyle; label: string }[] = [
  { id: 'defensivo', label: 'Defensivo' },
  { id: 'equilibrado', label: 'Equilibrado' },
  { id: 'ofensivo', label: 'Ofensivo' },
];

const MODE_LABEL: Record<string, string> = {
  classico: '🃏 Clássico',
  almanaque: '🔒 Almanaque',
  caos: '🌀 Caos',
};

export function MpLobby({ onExit }: { onExit: () => void }) {
  const { room, me, isHost, configure, setReady, start } = useMultiplayer();
  const [copied, setCopied] = useState(false);
  if (!room || !me) return null;

  const startable = canStart(room);
  const myFormation = me.formation;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the code is on screen anyway */
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <button onClick={onExit} className="text-sm text-white/60 hover:text-white">← Sair</button>
        <h1 className="font-display text-3xl text-white sm:text-4xl">Sala de espera</h1>
        <span className="w-12" />
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Room code */}
          <div className="rounded-2xl border border-gold-400/30 bg-gold-400/5 p-5 text-center">
            <p className="text-xs uppercase tracking-widest text-white/50">Código da sala</p>
            <button onClick={copyCode} className="mt-1 font-display text-6xl tracking-[0.3em] text-gold-400 hover:opacity-80">
              {room.id}
            </button>
            <p className="mt-1 text-sm text-white/55">
              {copied ? '✅ Copiado!' : 'Toque pra copiar e mande pros amigos entrarem.'}
            </p>
            <p className="mt-2 inline-block rounded-full border border-white/15 bg-black/30 px-3 py-1 text-xs font-semibold text-white/70">
              Modo: {MODE_LABEL[room.mode] ?? room.mode}
            </p>
          </div>

          {/* Players */}
          <div>
            <h2 className="mb-2 text-sm font-semibold text-white/70">
              Jogadores ({room.players.length}/{MP_MAX_PLAYERS})
            </h2>
            <div className="space-y-2">
              {room.players.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 rounded-xl border p-3 ${
                    p.ready ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-white/10 bg-black/20'
                  }`}
                >
                  <span className="text-2xl">{p.avatar}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg text-white">
                      {p.name}
                      {p.id === room.hostId && <span className="ml-1 text-gold-400" title="Anfitrião">👑</span>}
                      {p.id === me.id && <span className="ml-1 text-xs text-white/40">(você)</span>}
                    </p>
                    <p className="text-xs text-white/50">
                      {p.formation} · {p.style}{!p.connected && ' · desconectado'}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold ${p.ready ? 'text-emerald-300' : 'text-white/40'}`}>
                    {p.ready ? 'Pronto ✓' : 'Aguardando…'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* My setup */}
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <h2 className="mb-3 text-sm font-semibold text-white/70">Seu time</h2>

            <label className="mb-1 block text-xs text-white/50">Formação</label>
            <div className="mb-3 flex flex-wrap gap-2">
              {FORMATION_LIST.map((f) => (
                <button
                  key={f}
                  onClick={() => configure({ formation: f as Formation })}
                  className={`rounded-lg border px-3 py-1.5 font-display text-lg transition ${
                    myFormation === f
                      ? 'border-gold-400 bg-gold-400/15 text-gold-300'
                      : 'border-white/15 bg-black/20 text-white/70 hover:border-white/40'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <label className="mb-1 block text-xs text-white/50">Estilo</label>
            <div className="flex flex-wrap gap-2">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => configure({ style: s.id })}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                    me.style === s.id
                      ? 'border-gold-400 bg-gold-400/15 text-gold-300'
                      : 'border-white/15 bg-black/20 text-white/70 hover:border-white/40'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ready + start */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={me.ready ? 'secondary' : 'primary'}
              className="flex-1"
              onClick={() => setReady(!me.ready)}
            >
              {me.ready ? '↩ Cancelar pronto' : '✅ Estou pronto'}
            </Button>
            {isHost && (
              <Button variant="gold" className="flex-1" onClick={start} disabled={!startable}>
                ⚽ Começar
              </Button>
            )}
          </div>
          {isHost && !startable && (
            <p className="text-center text-xs text-white/45">
              Precisa de 2+ jogadores e todos prontos pra começar.
            </p>
          )}
          {!isHost && (
            <p className="text-center text-xs text-white/45">O anfitrião 👑 começa a partida quando todos estiverem prontos.</p>
          )}
        </div>

        {/* Formation preview */}
        <aside className="hidden lg:block">
          <p className="mb-2 text-center text-sm text-white/60">Pré-visualização do {myFormation}</p>
          <FormationPitch formation={myFormation} placed={[]} highlightOpen />
        </aside>
      </div>
    </div>
  );
}
