import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { DisputaPenaltis, type DadosDisputaPenaltis } from '../components/DisputaPenaltis';
import { LiveMatch, SpeedSelector, useSimSpeed } from '../components/LiveMatch';
import { MatchCard } from '../components/MatchCard';
import type { DisputaPenaltis as DisputaState, MatchResult } from '../engine';
import { useGame } from '../game/useGameStore';
import { liveFromMatch } from '../lib/matchTimeline';

export function SimulationScreen() {
  const { campaign, disputaPenaltis, runSimulation, escolherPenaltiSolo, goFinal, config } = useGame();
  const started = useRef(false);
  const [speed, setSpeed] = useSimSpeed();
  // Quantas partidas já foram reveladas; a próxima é jogada ao vivo.
  const [played, setPlayed] = useState(0);
  // Replay 0'→90' da partida atual concluído? (antes de entrar nos pênaltis)
  const [replayConcluido, setReplayConcluido] = useState(false);

  // Dispara a simulação ao entrar na tela.
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      runSimulation();
    }
  }, [runSimulation]);

  // Reseta o estado do replay sempre que o cursor muda de partida.
  useEffect(() => setReplayConcluido(false), [played]);

  if (!campaign) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="animate-pulse font-display text-3xl text-white/70">Sorteando o chaveamento…</p>
      </div>
    );
  }

  const matches = campaign.matches;
  const current = played < matches.length ? matches[played] : null;
  const allRevealed = played >= matches.length;
  const disputaDoAtual = disputaPenaltis && current && disputaPenaltis.partidaId === current.stage ? disputaPenaltis : null;
  // Partida atual precisa de pênaltis (disputa ativa aqui, ou já resolvida nos pênaltis).
  const atualPrecisaPenaltis = !!current && (!!disputaDoAtual || !!current.penaltis);

  const pular = () => {
    if (disputaPenaltis) {
      const idx = matches.findIndex((m) => m.stage === disputaPenaltis.partidaId);
      if (idx >= 0) {
        if (idx === played) setReplayConcluido(true);
        else setPlayed(idx);
        return;
      }
    }
    setPlayed(matches.length);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 text-center">
        <h1 className="font-display text-4xl text-white">Campanha em andamento</h1>
        <p className="text-white/55">Agora o bicho pegou. Vamos ver até onde {config.teamName} chega.</p>
        <div className="mt-4 flex justify-center">
          <SpeedSelector speed={speed} onChange={setSpeed} />
        </div>
      </header>

      <div className="space-y-3">
        {/* Partidas já jogadas, como recaps estáticos. */}
        {matches.slice(0, played).map((m, i) => (
          <MatchCard key={i} match={m} teamName={config.teamName} />
        ))}

        {/* Partida atual. */}
        {current && (
          atualPrecisaPenaltis && replayConcluido ? (
            <DisputaPenaltis
              key={`pen-${current.stage}`}
              dados={dadosDisputaSolo(current, disputaDoAtual, config.teamName)}
              onEscolher={escolherPenaltiSolo}
              onConcluido={() => setPlayed((p) => p + 1)}
            />
          ) : (
            <LiveMatch
              key={current.stage}
              data={liveFromMatch(current, config.teamName, played)}
              speed={speed}
              onDone={() => (atualPrecisaPenaltis ? setReplayConcluido(true) : setPlayed((p) => p + 1))}
            />
          )
        )}
      </div>

      <div className="mt-6 flex justify-center">
        {allRevealed ? (
          <Button variant="gold" className="px-8 py-4 text-lg" onClick={goFinal}>
            🏆 Ver resultado final
          </Button>
        ) : (
          <button onClick={pular} className="text-sm text-white/50 hover:text-white">
            {disputaPenaltis ? 'ir pros pênaltis →' : 'pular animação →'}
          </button>
        )}
      </div>
    </div>
  );
}

/** Monta o view-model da disputa do solo: usuário sempre é o lado A (mandante). */
function dadosDisputaSolo(match: MatchResult, disputa: DisputaState | null, teamName: string): DadosDisputaPenaltis {
  const meuLado = 'a' as const;
  return {
    stageLabel: match.stage,
    ladoA: { nome: teamName, icon: '⭐' },
    ladoB: { nome: match.opponent.name, icon: match.opponent.flag },
    historico: disputa?.historico ?? match.penaltis?.historico ?? [],
    encerrada: match.penaltis != null,
    vencedorLado: match.penaltis?.vencedorLado ?? null,
    meuLado,
    pendente:
      disputa && !disputa.encerrada
        ? {
            vez: disputa.vez,
            estado: 'escolhendo',
            prazo: null, // no solo não há cronômetro (sem ninguém esperando)
            jaEscolhi: meuLado === disputa.vez ? disputa.direcaoChute != null : disputa.direcaoDefesa != null,
          }
        : null,
  };
}
