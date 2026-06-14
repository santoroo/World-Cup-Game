import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { DisputaPenaltis, type DadosDisputaPenaltis } from '../../components/DisputaPenaltis';
import { FormationPitch } from '../../components/FormationPitch';
import { LiveMatch, SpeedSelector, useSimSpeed } from '../../components/LiveMatch';
import type { BracketMatch, MpPlayer, RoomState } from '../../engine';
import { useMultiplayer } from '../../game/useMultiplayer';
import { ehHumanoId, rotuloCompetidor } from '../../lib/competidores';
import { liveFromBracket } from '../../lib/matchTimeline';

export function MpBracket({ onExit }: { onExit: () => void }) {
  const { room, myId, isHost, rematch, prontoPenalti, penalti } = useMultiplayer();
  const [speed, setSpeed] = useSimSpeed();
  const rounds = room?.bracket?.rounds ?? [];

  const total = rounds.reduce((n, r) => n + r.length, 0);
  const [played, setPlayed] = useState(0);
  const [replayConcluido, setReplayConcluido] = useState(false);
  const allRevealed = played >= total;

  const current = flatItem(rounds, played);
  const disputaAtiva = room?.disputaPenaltis ?? null;
  const disputaDesteConfronto = disputaAtiva && current && disputaAtiva.partidaId === current.id;

  // Byes (e slots ainda sem resultado) não têm animação — pula.
  useEffect(() => {
    if (allRevealed) return;
    if (current && current.byeId) {
      const id = setTimeout(() => setPlayed((p) => p + 1), 500);
      return () => clearTimeout(id);
    }
  }, [played, current, allRevealed]);

  useEffect(() => setReplayConcluido(false), [played]);

  useEffect(() => {
    if (replayConcluido && disputaDesteConfronto) prontoPenalti();
  }, [replayConcluido, disputaDesteConfronto, prontoPenalti]);

  if (!room || !room.bracket) return null;
  const jogadores = room.players;
  const championId = allRevealed ? room.bracket.championId : null;

  const pular = () => {
    if (disputaAtiva) {
      const idx = flatIndexOf(rounds, disputaAtiva.partidaId);
      if (idx >= 0) {
        if (idx === played) setReplayConcluido(true);
        else setPlayed(idx);
        return;
      }
    }
    setPlayed(total);
  };

  let offset = 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <button onClick={onExit} className="text-sm text-white/60 hover:text-white">← Sair</button>
        <h1 className="font-display text-4xl text-white">Mata-mata</h1>
        <span className="w-12" />
      </header>

      {!allRevealed && (
        <div className="mb-6 flex justify-center">
          <SpeedSelector speed={speed} onChange={setSpeed} />
        </div>
      )}

      {championId && <ChampionBanner id={championId} jogadores={jogadores} />}

      <div className="space-y-6">
        {rounds.map((round, ri) => {
          const roundOffset = offset;
          offset += round.length;
          if (roundOffset > played) return null;
          const visibleCount = Math.min(round.length, played - roundOffset + 1);

          return (
            <div key={ri}>
              <h3 className="mb-2 text-center font-display text-2xl text-white/80">{round[0]?.stageLabel}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {round.slice(0, visibleCount).map((m, j) => {
                  const globalIndex = roundOffset + j;
                  const isCurrent = globalIndex === played;
                  const data = m.result && !m.byeId ? liveFromBracket(m, jogadores) : null;

                  if (isCurrent && data) {
                    const precisa = m.result!.penalties || m.result!.winnerId == null;
                    if (!replayConcluido) {
                      return (
                        <div key={m.id} className="sm:col-span-2">
                          <LiveMatch
                            data={data}
                            speed={speed}
                            onDone={() => (precisa ? setReplayConcluido(true) : setPlayed((p) => p + 1))}
                          />
                        </div>
                      );
                    }
                    if (precisa) {
                      return (
                        <div key={m.id} className="sm:col-span-2">
                          <DisputaPenaltis
                            dados={dadosDisputa(m, room, myId)}
                            onEscolher={penalti}
                            onConcluido={() => setPlayed((p) => p + 1)}
                          />
                        </div>
                      );
                    }
                  }
                  return <MatchRow key={m.id} match={m} jogadores={jogadores} />;
                })}
              </div>
            </div>
          );
        })}
      </div>

      {!allRevealed && (
        <div className="mt-6 text-center">
          <button onClick={pular} className="text-sm text-white/50 hover:text-white">
            {disputaAtiva ? 'ir pros pênaltis →' : 'pular animação →'}
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

function ChampionBanner({ id, jogadores }: { id: string; jogadores: MpPlayer[] }) {
  const rotulo = rotuloCompetidor(id, jogadores);
  const humano = ehHumanoId(id) ? jogadores.find((p) => p.id === id) : null;
  return (
    <div className="mb-8 animate-pop rounded-3xl border border-gold-400/50 bg-gradient-to-b from-gold-500/25 to-transparent p-6 text-center">
      <p className="text-sm uppercase tracking-widest text-white/60">Campeão da Copa dos Sonhos</p>
      <p className="mt-1 text-6xl">{rotulo.icon}🏆</p>
      <h2 className="mt-1 font-display text-5xl text-gold-400">{rotulo.nome}</h2>
      {humano ? (
        <div className="mx-auto mt-4 max-w-xs">
          <FormationPitch formation={humano.formation} placed={humano.placed} />
        </div>
      ) : (
        <p className="mt-2 text-sm text-white/55">Uma seleção lendária da CPU levou a taça! 🤖</p>
      )}
    </div>
  );
}

/** View-model da disputa pro confronto `m` (sempre humano×humano quando interativa). */
function dadosDisputa(m: BracketMatch, room: RoomState, myId: string | null): DadosDisputaPenaltis {
  const d = room.disputaPenaltis && room.disputaPenaltis.partidaId === m.id ? room.disputaPenaltis : null;
  const a = rotuloCompetidor(m.aId ?? '', room.players);
  const b = rotuloCompetidor(m.bId ?? '', room.players);
  const meuLado = myId && myId === m.aId ? 'a' : myId && myId === m.bId ? 'b' : null;
  const vencedorLado = m.result?.winnerId ? (m.result.winnerId === m.aId ? 'a' : 'b') : null;

  return {
    stageLabel: m.stageLabel,
    ladoA: { nome: a.nome, icon: a.icon },
    ladoB: { nome: b.nome, icon: b.icon },
    historico: d?.historico ?? m.result?.penaltis?.historico ?? [],
    encerrada: m.result?.winnerId != null,
    vencedorLado,
    meuLado,
    pendente:
      d && !d.encerrada
        ? {
            vez: d.vez,
            estado: d.prazo == null ? ('aguardando' as const) : ('escolhendo' as const),
            prazo: d.prazo,
            jaEscolhi: meuLado === d.vez ? d.direcaoChute != null : d.direcaoDefesa != null,
          }
        : null,
  };
}

/** The flattened tie at global index `i`, or null if out of range. */
function flatItem(rounds: BracketMatch[][], i: number): BracketMatch | null {
  let idx = i;
  for (const round of rounds) {
    if (idx < round.length) return round[idx];
    idx -= round.length;
  }
  return null;
}

function flatIndexOf(rounds: BracketMatch[][], matchId: string): number {
  let idx = 0;
  for (const round of rounds) {
    for (const m of round) {
      if (m.id === matchId) return idx;
      idx++;
    }
  }
  return -1;
}

function MatchRow({ match, jogadores }: { match: BracketMatch; jogadores: MpPlayer[] }) {
  if (match.byeId) {
    const who = rotuloCompetidor(match.byeId, jogadores);
    return (
      <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-center">
        <p className="text-sm text-white/60">
          <span className="text-lg">{who.icon}</span> {who.nome} passou direto
        </p>
        <p className="text-[11px] uppercase tracking-wide text-white/35">sem adversário nesta fase</p>
      </div>
    );
  }

  const a = match.aId ? rotuloCompetidor(match.aId, jogadores) : null;
  const b = match.bId ? rotuloCompetidor(match.bId, jogadores) : null;
  const res = match.result;
  const winnerIsA = !!res?.winnerId && res.winnerId === match.aId;
  const winnerIsB = !!res?.winnerId && res.winnerId === match.bId;

  return (
    <div className="animate-card-in rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <Side time={a} winner={winnerIsA} align="left" />
        <div className="flex items-center gap-2 font-display text-3xl text-gold-400">
          <span className={winnerIsA ? '' : 'text-white/50'}>{res?.a.goals ?? '–'}</span>
          <span className="text-white/30 text-xl">×</span>
          <span className={winnerIsB ? '' : 'text-white/50'}>{res?.b.goals ?? '–'}</span>
        </div>
        <Side time={b} winner={winnerIsB} align="right" />
      </div>
      {res?.penalties && res.penaltis && (
        <p className="mt-1 text-center text-[11px] font-semibold text-amber-300">
          pênaltis: {res.penaltis.golsA} × {res.penaltis.golsB}
        </p>
      )}
      {res?.blurb && <p className="mt-1 text-center text-xs italic text-white/55">“{res.blurb}”</p>}
    </div>
  );
}

function Side({ time, winner, align }: { time: { nome: string; icon: string } | null; winner: boolean; align: 'left' | 'right' }) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-1.5 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <span className="text-xl">{time?.icon ?? '—'}</span>
      <span className={`truncate font-display text-base ${winner ? 'text-white' : 'text-white/55'}`}>
        {time?.nome ?? 'TBD'}
        {winner && ' 🏆'}
      </span>
    </div>
  );
}
