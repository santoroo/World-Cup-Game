import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { FormationPitch } from '../../components/FormationPitch';
import type { BracketMatch, MpPlayer } from '../../engine';
import { useMultiplayer } from '../../game/useMultiplayer';

export function MpBracket({ onExit }: { onExit: () => void }) {
  const { room, isHost, rematch } = useMultiplayer();
  const rounds = room?.bracket?.rounds ?? [];
  const [revealed, setRevealed] = useState(0);

  // Reveal one knockout round at a time for some drama.
  useEffect(() => {
    if (revealed >= rounds.length) return;
    const id = setTimeout(() => setRevealed((r) => r + 1), 1300);
    return () => clearTimeout(id);
  }, [revealed, rounds.length]);

  if (!room || !room.bracket) return null;
  const byId = new Map(room.players.map((p) => [p.id, p]));
  const allRevealed = revealed >= rounds.length;
  const champion = allRevealed ? byId.get(room.bracket.championId ?? '') ?? null : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <button onClick={onExit} className="text-sm text-white/60 hover:text-white">← Sair</button>
        <h1 className="font-display text-4xl text-white">Mata-mata</h1>
        <span className="w-12" />
      </header>

      {/* Champion */}
      {champion && (
        <div className="mb-8 animate-pop rounded-3xl border border-gold-400/50 bg-gradient-to-b from-gold-500/25 to-transparent p-6 text-center">
          <p className="text-sm uppercase tracking-widest text-white/60">Campeão da Copa dos Sonhos</p>
          <p className="mt-1 text-6xl">{champion.avatar}🏆</p>
          <h2 className="mt-1 font-display text-5xl text-gold-400">{champion.name}</h2>
          <div className="mx-auto mt-4 max-w-xs">
            <FormationPitch formation={champion.formation} placed={champion.placed} />
          </div>
        </div>
      )}

      {/* Rounds */}
      <div className="space-y-6">
        {rounds.slice(0, revealed).map((round, i) => (
          <div key={i}>
            <h3 className="mb-2 text-center font-display text-2xl text-white/80">{round[0]?.stageLabel}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {round.map((m) => (
                <MatchRow key={m.id} match={m} byId={byId} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {!allRevealed && (
        <div className="mt-6 text-center">
          <button onClick={() => setRevealed(rounds.length)} className="text-sm text-white/50 hover:text-white">
            pular animação →
          </button>
        </div>
      )}

      {allRevealed && (
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {isHost ? (
            <Button variant="gold" onClick={rematch}>🔁 Jogar de novo (mesma turma)</Button>
          ) : (
            <p className="text-sm text-white/55">Aguardando o anfitrião 👑 começar outra…</p>
          )}
          <Button variant="secondary" onClick={onExit}>🏠 Sair</Button>
        </div>
      )}
    </div>
  );
}

function MatchRow({ match, byId }: { match: BracketMatch; byId: Map<string, MpPlayer> }) {
  const a = match.aId ? byId.get(match.aId) : null;
  const b = match.bId ? byId.get(match.bId) : null;

  // Walkover.
  if (match.byeId) {
    const who = byId.get(match.byeId);
    return (
      <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-center">
        <p className="text-sm text-white/60">
          <span className="text-lg">{who?.avatar}</span> {who?.name} passou direto
        </p>
        <p className="text-[11px] uppercase tracking-wide text-white/35">sem adversário nesta fase</p>
      </div>
    );
  }

  const res = match.result;
  const winnerIsA = res?.winnerId === match.aId;
  const winnerIsB = res?.winnerId === match.bId;

  return (
    <div className="animate-card-in rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <Side player={a} winner={winnerIsA} align="left" />
        <div className="flex items-center gap-2 font-display text-3xl text-gold-400">
          <span className={winnerIsA ? '' : 'text-white/50'}>{res?.a.goals ?? '–'}</span>
          <span className="text-white/30 text-xl">×</span>
          <span className={winnerIsB ? '' : 'text-white/50'}>{res?.b.goals ?? '–'}</span>
        </div>
        <Side player={b} winner={winnerIsB} align="right" />
      </div>
      {res?.penalties && (
        <p className="mt-1 text-center text-[11px] font-semibold text-amber-300">decidido nos pênaltis</p>
      )}
      {res?.blurb && <p className="mt-1 text-center text-xs italic text-white/55">“{res.blurb}”</p>}
    </div>
  );
}

function Side({ player, winner, align }: { player: MpPlayer | null | undefined; winner: boolean; align: 'left' | 'right' }) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-1.5 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <span className="text-xl">{player?.avatar ?? '—'}</span>
      <span className={`truncate font-display text-base ${winner ? 'text-white' : 'text-white/55'}`}>
        {player?.name ?? 'TBD'}
        {winner && ' 🏆'}
      </span>
    </div>
  );
}
