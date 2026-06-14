import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { Dice } from '../../components/Dice';
import { FormationPitch } from '../../components/FormationPitch';
import { PlayerCard } from '../../components/PlayerCard';
import { TeamSummary } from '../../components/TeamSummary';
import {
  computeTeamStrength,
  FORMATIONS,
  MAX_FREE_SKIPS,
  MP_SQUAD_SIZE,
  type MpPlayer,
} from '../../engine';
import { useMultiplayer } from '../../game/useMultiplayer';
import { positionLabel } from '../../lib/messages';

export function MpDraft({ onExit }: { onExit: () => void }) {
  const { room, me, isMyTurn, currentPlayer, myPickOptions, roll, pick, skip } = useMultiplayer();
  const [diceVal, setDiceVal] = useState(6);
  const [rolling, setRolling] = useState(false);

  const rolledEditionId = room?.rolledEditionId ?? null;

  // Stop the dice animation as soon as the server confirms the rolled edition.
  useEffect(() => {
    if (rolledEditionId) setRolling(false);
  }, [rolledEditionId]);
  // Reset the animation whenever the turn changes.
  useEffect(() => {
    setRolling(false);
  }, [room?.currentId]);

  if (!room || !me) return null;

  const round = Math.min(room.round + 1, MP_SQUAD_SIZE);
  const myStrength = computeTeamStrength(me.placed, me.formation);
  const hideOverall = room.mode === 'almanaque';
  const skipsLeft = Math.max(0, MAX_FREE_SKIPS - me.skipsUsed);

  const handleRoll = () => {
    if (rolling || rolledEditionId) return;
    setRolling(true);
    setDiceVal(1 + Math.floor(Math.random() * 6));
    roll();
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-3 flex items-center justify-between">
        <button onClick={onExit} className="text-sm text-white/60 hover:text-white">← Sair</button>
        <div className="text-center">
          <p className="font-display text-2xl leading-none text-white">Sala {room.id}</p>
          <p className="text-xs text-white/50">Draft ao vivo</p>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl leading-none text-gold-400">{round}/{MP_SQUAD_SIZE}</div>
          <p className="text-xs text-white/50">rodada</p>
        </div>
      </header>

      {/* Turn banner */}
      <div
        className={`mb-4 rounded-2xl border p-3 text-center ${
          isMyTurn ? 'animate-pop border-emerald-400/50 bg-emerald-500/15' : 'border-white/10 bg-black/25'
        }`}
      >
        {isMyTurn ? (
          <p className="font-display text-2xl text-emerald-300">Sua vez! Role o dado e escolha um craque.</p>
        ) : (
          <p className="font-display text-xl text-white/80">
            {currentPlayer ? (
              <>
                <span className="text-2xl">{currentPlayer.avatar}</span> Vez de{' '}
                <span className="text-gold-300">{currentPlayer.name}</span> — escolhendo…
              </>
            ) : (
              'Preparando o chaveamento…'
            )}
          </p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        {/* My pitch + my action area */}
        <div className="space-y-3">
          <FormationPitch formation={me.formation} placed={me.placed} />
          <TeamSummary strength={myStrength} compact hidden={hideOverall} />
        </div>

        <div className="space-y-4">
          {/* Draft action (only on my turn) */}
          {isMyTurn && (
            <div className="rounded-2xl border border-emerald-400/30 bg-black/30 p-5">
              {!rolledEditionId ? (
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
                  <div className="flex items-center gap-4">
                    <Dice value={diceVal} rolling={rolling} />
                    <div>
                      <p className="font-display text-2xl text-white">{rolling ? 'Rolando…' : 'Role o dado!'}</p>
                      <p className="text-sm text-white/55">A sorte decide qual elenco vem.</p>
                    </div>
                  </div>
                  <Button variant="gold" onClick={handleRoll} disabled={rolling}>🎲 Rolar dado</Button>
                </div>
              ) : (
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-display text-xl text-white">Escolha sua carta</p>
                    <Button variant="ghost" onClick={skip} disabled={skipsLeft <= 0} title={skipsLeft <= 0 ? 'Sem pulos' : undefined}>
                      {skipsLeft > 0 ? `Pular (${skipsLeft})` : 'Sem pulos'}
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {myPickOptions.map((p) => (
                      <PlayerCard key={p.id} player={p} hideOverall={hideOverall} onClick={() => pick(p.id)} />
                    ))}
                  </div>
                  {myPickOptions.length === 0 && (
                    <p className="text-sm text-white/55">Nenhuma carta disponível desse elenco — pule pra rolar de novo.</p>
                  )}
                </div>
              )}
            </div>
          )}
          {!isMyTurn && rolledEditionId && currentPlayer && (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-center text-sm text-white/60">
              {currentPlayer.name} rolou o dado e está escolhendo um jogador…
            </div>
          )}

          {/* Everyone's teams, live */}
          <div className="grid gap-3 sm:grid-cols-2">
            {room.players.map((p) => (
              <TeamPanel
                key={p.id}
                player={p}
                isCurrent={p.id === room.currentId}
                isMe={p.id === me.id}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamPanel({ player, isCurrent, isMe }: { player: MpPlayer; isCurrent: boolean; isMe: boolean }) {
  const slots = FORMATIONS[player.formation];
  const labelFor = (slotId: string) => slots.find((s) => s.id === slotId)?.label ?? slotId;

  return (
    <div
      className={`rounded-2xl border p-3 transition ${
        isCurrent ? 'border-gold-400/60 bg-gold-400/5' : 'border-white/10 bg-black/20'
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xl">{player.avatar}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg leading-none text-white">
            {player.name}
            {isMe && <span className="ml-1 text-xs text-white/40">(você)</span>}
            {!player.connected && <span className="ml-1 text-xs text-rose-300">⚠</span>}
          </p>
          <p className="text-[11px] text-white/45">{player.formation}</p>
        </div>
        <span className="font-display text-lg text-gold-400">{player.placed.length}/{MP_SQUAD_SIZE}</span>
      </div>

      {/* progress */}
      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-400 transition-all"
          style={{ width: `${(player.placed.length / MP_SQUAD_SIZE) * 100}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {player.placed.length === 0 && <span className="text-[11px] text-white/35">Ainda sem jogadores…</span>}
        {player.placed.map((pp) => (
          <span
            key={pp.slotId}
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              pp.outOfPosition ? 'bg-amber-500/20 text-amber-200' : 'bg-white/10 text-white/75'
            }`}
            title={`${pp.player.name} · ${positionLabel(slots.find((s) => s.id === pp.slotId)?.position ?? '')}`}
          >
            {pp.player.flag} {pp.player.name} <span className="opacity-50">{labelFor(pp.slotId)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
