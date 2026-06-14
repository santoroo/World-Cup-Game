import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { LiveMatch, SpeedSelector, useSimSpeed } from '../../components/LiveMatch';
import { calcularTabela, type Grupo, type JogoGrupo, type MpPlayer } from '../../engine';
import { useMultiplayer } from '../../game/useMultiplayer';
import { rotuloCompetidor } from '../../lib/competidores';
import { liveFromJogoGrupo } from '../../lib/matchTimeline';

export function MpGrupos({ onConcluido }: { onConcluido: () => void }) {
  const { room, myId } = useMultiplayer();
  const [speed, setSpeed] = useSimSpeed();

  const fg = room?.grupos ?? null;
  // Jogos achatados (com índice do grupo). Tocamos os jogos do humano ao vivo.
  const jogos = useMemo(
    () => (fg ? fg.grupos.flatMap((g, gi) => g.jogos.map((jogo) => ({ jogo, gi }))) : []),
    [fg],
  );
  const total = jogos.length;
  const [played, setPlayed] = useState(0);
  const allRevealed = played >= total;
  const atual = played < total ? jogos[played] : null;

  // Jogos CPU×CPU avançam na hora (sem animação); só entram na tabela.
  useEffect(() => {
    if (allRevealed || !atual) return;
    if (!atual.jogo.comHumano) {
      const id = setTimeout(() => setPlayed((p) => p + 1), 320);
      return () => clearTimeout(id);
    }
  }, [played, atual, allRevealed]);

  if (!room || !fg) return null;
  const jogadores = room.players;
  const meuGrupo = fg.grupos.findIndex((g) => g.competidores.includes(myId ?? ''));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-4 text-center">
        <h1 className="font-display text-4xl text-white">Fase de grupos</h1>
        <p className="text-white/55">Cada um no seu grupo — os 2 melhores avançam pro mata-mata.</p>
      </header>

      {!allRevealed && (
        <div className="mb-5 flex justify-center">
          <SpeedSelector speed={speed} onChange={setSpeed} />
        </div>
      )}

      {/* Jogo do humano sendo disputado ao vivo */}
      {atual && atual.jogo.comHumano && (
        <div className="mb-6">
          <LiveMatch
            key={`g-${played}`}
            data={liveFromJogoGrupo(atual.jogo, jogadores, `Grupo ${fg.grupos[atual.gi].nome}`, `g-${played}`)}
            speed={speed}
            onDone={() => setPlayed((p) => p + 1)}
          />
        </div>
      )}

      {/* Tabelas dos grupos (sobem conforme os jogos saem) */}
      <div className="grid gap-4 sm:grid-cols-2">
        {fg.grupos.map((g, gi) => (
          <TabelaGrupo
            key={g.nome}
            grupo={g}
            revelados={jogos.slice(0, played).filter((x) => x.gi === gi).map((x) => x.jogo)}
            jogadores={jogadores}
            meuId={myId}
            ativo={atual?.gi === gi}
            destaque={gi === meuGrupo}
          />
        ))}
      </div>

      <div className="mt-6 text-center">
        {allRevealed ? (
          <Button variant="gold" className="px-8 py-4 text-lg" onClick={onConcluido}>
            🏆 Ir pro mata-mata
          </Button>
        ) : (
          <button onClick={() => setPlayed(total)} className="text-sm text-white/50 hover:text-white">
            pular fase de grupos →
          </button>
        )}
      </div>
    </div>
  );
}

function TabelaGrupo({
  grupo,
  revelados,
  jogadores,
  meuId,
  ativo,
  destaque,
}: {
  grupo: Grupo;
  revelados: JogoGrupo[];
  jogadores: MpPlayer[];
  meuId: string | null;
  ativo: boolean;
  destaque: boolean;
}) {
  const tabela = calcularTabela(grupo.competidores, revelados);
  return (
    <div
      className={`rounded-2xl border p-3 transition ${
        destaque
          ? 'border-gold-400/50 bg-gold-400/5'
          : ativo
            ? 'border-emerald-400/40 bg-emerald-500/5'
            : 'border-white/10 bg-black/20'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-xl text-white">Grupo {grupo.nome}</h3>
        {destaque && <span className="text-[11px] font-semibold text-gold-300">seu grupo</span>}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-white/40">
            <th className="text-left font-normal">Time</th>
            <th className="w-6 font-normal">P</th>
            <th className="w-6 font-normal">J</th>
            <th className="w-8 font-normal">SG</th>
          </tr>
        </thead>
        <tbody>
          {tabela.map((l, i) => {
            const r = rotuloCompetidor(l.competidorId, jogadores);
            const classifica = i < 2;
            const sou = l.competidorId === meuId;
            return (
              <tr key={l.competidorId} className={classifica ? 'text-white' : 'text-white/45'}>
                <td className="py-0.5">
                  <div className={`flex items-center gap-1.5 ${sou ? 'font-semibold text-gold-200' : ''}`}>
                    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] ${classifica ? 'bg-emerald-500/40 text-emerald-100' : 'bg-white/10 text-white/50'}`}>
                      {i + 1}
                    </span>
                    <span>{r.icon}</span>
                    <span className="truncate">{r.nome}{sou && ' (você)'}</span>
                  </div>
                </td>
                <td className="text-center font-display text-base text-gold-300">{l.pts}</td>
                <td className="text-center text-white/50">{l.v + l.e + l.d}</td>
                <td className="text-center text-white/50">{l.sg > 0 ? `+${l.sg}` : l.sg}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
