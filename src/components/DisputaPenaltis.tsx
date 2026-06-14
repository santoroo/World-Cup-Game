// ============================================================================
// DisputaPenaltis — a disputa de pênaltis jogada como animação. Cada cobrança a
// bola vai pro canto escolhido pelo cobrador e o goleiro pula pro canto escolhido
// pela defesa: se acertarem o mesmo canto, defesa; senão, quase sempre gol.
//
// É a mesma tela pro online (ao vivo, com botões pros dois envolvidos e timer) e
// pro solo (replay automático). A diferença vem só do view-model `dados`.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import type { ChutePenalti, DirecaoPenalti } from '../engine';

/** View-model normalizado, montado pelo MpBracket (online) ou pelo solo. */
export interface DadosDisputaPenaltis {
  stageLabel?: string;
  ladoA: { nome: string; icon: string };
  ladoB: { nome: string; icon: string };
  /** Cobranças já resolvidas (cresce ao vivo no online). */
  historico: ChutePenalti[];
  encerrada: boolean;
  vencedorLado: 'a' | 'b' | null;
  /** Cobrança pendente ao vivo (online). null no replay/solo/intro decidido. */
  pendente: {
    vez: 'a' | 'b';
    /** epoch ms do prazo; null = aguardando os dois terminarem o jogo. */
    prazo: number | null;
    jaEscolhi: boolean;
  } | null;
  /** De que lado eu sou (null = espectador/solo). */
  meuLado: 'a' | 'b' | null;
}

const POS: Record<DirecaoPenalti, string> = { esquerda: '20%', meio: '50%', direita: '80%' };
const MS_VOO = 700;
const MS_RESULTADO = 950;

export function DisputaPenaltis({
  dados,
  onEscolher,
  onConcluido,
}: {
  dados: DadosDisputaPenaltis;
  onEscolher?: (dir: DirecaoPenalti) => void;
  onConcluido?: () => void;
}) {
  const { historico, ladoA, ladoB } = dados;
  // Quantas cobranças já foram animadas (anima uma de cada vez).
  const [mostrados, setMostrados] = useState(0);
  const [faseAnim, setFaseAnim] = useState<'voo' | 'resultado'>('voo');
  const [agora, setAgora] = useState(() => Date.now());
  const concluiuRef = useRef(false);

  // Anima a próxima cobrança ainda não mostrada.
  useEffect(() => {
    if (mostrados >= historico.length) return;
    setFaseAnim('voo');
    const t1 = setTimeout(() => setFaseAnim('resultado'), MS_VOO);
    const t2 = setTimeout(() => setMostrados((m) => m + 1), MS_VOO + MS_RESULTADO);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [mostrados, historico.length]);

  // Relógio do timer (só quando há cobrança pendente com prazo).
  const temPrazo = dados.pendente?.prazo != null;
  useEffect(() => {
    if (!temPrazo) return;
    const id = setInterval(() => setAgora(Date.now()), 250);
    return () => clearInterval(id);
  }, [temPrazo]);

  const animando = mostrados < historico.length;
  const alcancou = !animando; // já mostrou tudo que existe

  // Conclui (avança o cursor) quando a disputa acabou e tudo foi animado.
  useEffect(() => {
    if (alcancou && dados.encerrada && !concluiuRef.current) {
      concluiuRef.current = true;
      const id = setTimeout(() => onConcluido?.(), 1400);
      return () => clearTimeout(id);
    }
  }, [alcancou, dados.encerrada, onConcluido]);

  const placarA = historico.slice(0, mostrados).filter((c) => c.lado === 'a' && c.marcou).length;
  const placarB = historico.slice(0, mostrados).filter((c) => c.lado === 'b' && c.marcou).length;

  const emAnim = animando ? historico[mostrados] : null;
  const restanteS = dados.pendente?.prazo != null ? Math.max(0, Math.ceil((dados.pendente.prazo - agora) / 1000)) : null;

  return (
    <div className="animate-card-in rounded-2xl border border-amber-400/30 bg-gradient-to-b from-amber-500/10 to-black/40 p-4">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-amber-200/70">
        <span>{dados.stageLabel ?? 'Mata-mata'}</span>
        <span className="font-display text-base text-amber-300">Disputa de pênaltis</span>
      </div>

      {/* Placar de pênaltis */}
      <div className="flex items-center justify-center gap-3 text-center">
        <div className="flex-1 text-right">
          <p className="truncate font-display text-lg leading-tight text-white">{ladoA.icon} {ladoA.nome}</p>
        </div>
        <div className="flex items-center gap-2 font-display text-4xl text-amber-300">
          <span key={`a${placarA}`} className="animate-pop">{placarA}</span>
          <span className="text-white/40">×</span>
          <span key={`b${placarB}`} className="animate-pop">{placarB}</span>
        </div>
        <div className="flex-1 text-left">
          <p className="truncate font-display text-lg leading-tight text-white">{ladoB.icon} {ladoB.nome}</p>
        </div>
      </div>

      {/* Gol + animação da cobrança */}
      <Gol emAnim={emAnim} faseAnim={faseAnim} />

      {/* Histórico (pênalti a pênalti) */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-center text-sm">
        <LinhaHistorico cobrancas={historico.slice(0, mostrados).filter((c) => c.lado === 'a')} alinhar="right" />
        <LinhaHistorico cobrancas={historico.slice(0, mostrados).filter((c) => c.lado === 'b')} alinhar="left" />
      </div>

      {/* Estado / interação */}
      <div className="mt-3 min-h-[3rem] text-center">
        {alcancou && dados.encerrada && (
          <p className="animate-pop font-display text-2xl text-amber-300">
            {(dados.vencedorLado === 'a' ? ladoA : ladoB).icon} {(dados.vencedorLado === 'a' ? ladoA : ladoB).nome} venceu nos pênaltis! 🏆
          </p>
        )}

        {alcancou && !dados.encerrada && dados.pendente && (
          <Interacao
            dados={dados}
            restanteS={restanteS}
            onEscolher={onEscolher}
          />
        )}

        {animando && <p className="text-sm text-white/55">Bola na marca do pênalti…</p>}
      </div>
    </div>
  );
}

function Interacao({
  dados,
  restanteS,
  onEscolher,
}: {
  dados: DadosDisputaPenaltis;
  restanteS: number | null;
  onEscolher?: (dir: DirecaoPenalti) => void;
}) {
  const pendente = dados.pendente!;
  const cobrandoLado = pendente.vez;
  const nomeCobra = (cobrandoLado === 'a' ? dados.ladoA : dados.ladoB).nome;

  // Intro: ainda esperando os dois terminarem o replay 0'→90'.
  if (pendente.prazo == null) {
    return <p className="text-sm text-white/60">Aguardando os jogadores terminarem o jogo…</p>;
  }

  const souEnvolvido = dados.meuLado != null;
  const souCobrador = dados.meuLado === cobrandoLado;
  const podeEscolher = souEnvolvido && !pendente.jaEscolhi;

  return (
    <div>
      <p className="mb-1 text-sm">
        <span className="text-amber-300">{nomeCobra}</span> vai cobrar
        {restanteS != null && (
          <span className={`ml-2 font-display ${restanteS <= 3 ? 'text-rose-300' : 'text-white/70'}`}>{restanteS}s</span>
        )}
      </p>

      {podeEscolher ? (
        <>
          <p className="mb-2 text-sm font-semibold text-white/85">
            {souCobrador ? 'Escolha o canto da cobrança:' : 'Defenda! Pra onde você pula?'}
          </p>
          <div className="flex justify-center gap-2">
            {(['esquerda', 'meio', 'direita'] as DirecaoPenalti[]).map((dir) => (
              <button
                key={dir}
                onClick={() => onEscolher?.(dir)}
                className="rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 py-3 font-display text-lg text-amber-100 transition hover:-translate-y-0.5 hover:bg-amber-500/30"
              >
                {dir === 'esquerda' ? '⬅️' : dir === 'meio' ? '⬆️' : '➡️'}
                <span className="ml-1 text-sm capitalize">{dir}</span>
              </button>
            ))}
          </div>
        </>
      ) : souEnvolvido ? (
        <p className="text-sm text-emerald-300">Escolha feita! Aguardando o adversário…</p>
      ) : (
        <p className="text-sm text-white/55">{souCobrador ? '' : ''}Assistindo à decisão…</p>
      )}
    </div>
  );
}

/** O gol com o goleiro e a bola animando a cobrança atual. */
function Gol({ emAnim, faseAnim }: { emAnim: ChutePenalti | null; faseAnim: 'voo' | 'resultado' }) {
  const mostrarResultado = emAnim != null && faseAnim === 'resultado';
  const defendeu = emAnim != null && !emAnim.marcou && emAnim.direcaoChute === emAnim.direcaoDefesa;
  const errou = emAnim != null && !emAnim.marcou && emAnim.direcaoChute !== emAnim.direcaoDefesa;

  // Posições da bola e do goleiro.
  const bolaLeft = emAnim ? POS[emAnim.direcaoChute] : '50%';
  const bolaTop = emAnim ? (errou ? '6%' : '30%') : '82%';
  const goleiroLeft = emAnim ? POS[emAnim.direcaoDefesa] : '50%';

  return (
    <div className="relative mx-auto mt-3 h-32 w-full max-w-sm overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-sky-900/40 to-pitch-800/60">
      {/* Trave/gol */}
      <div className="absolute left-1/2 top-2 h-16 w-[78%] -translate-x-1/2 rounded-t-md border-2 border-b-0 border-white/70" />
      {/* Rede (linhas) */}
      <div className="absolute left-1/2 top-2 h-16 w-[78%] -translate-x-1/2 opacity-20"
        style={{ backgroundImage: 'repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px 10px),repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 10px)' }} />

      {/* Goleiro */}
      <div
        className="absolute text-3xl transition-all duration-500"
        style={{ left: goleiroLeft, top: '34%', transform: 'translate(-50%,-50%)' }}
      >
        🧤
      </div>

      {/* Bola */}
      <div
        className="absolute text-2xl transition-all"
        style={{
          left: bolaLeft,
          top: bolaTop,
          transform: 'translate(-50%,-50%)',
          transitionDuration: `${MS_VOO}ms`,
        }}
      >
        ⚽
      </div>

      {/* Resultado */}
      {mostrarResultado && (
        <div className="absolute inset-x-0 bottom-1 text-center">
          <span
            className={`animate-pop font-display text-xl ${
              emAnim!.marcou ? 'text-emerald-300' : defendeu ? 'text-sky-300' : 'text-rose-300'
            }`}
          >
            {emAnim!.marcou ? 'GOL! ⚽' : defendeu ? 'DEFENDEU! 🧤' : 'PRA FORA! 😱'}
          </span>
        </div>
      )}
    </div>
  );
}

function LinhaHistorico({ cobrancas, alinhar }: { cobrancas: ChutePenalti[]; alinhar: 'left' | 'right' }) {
  return (
    <div className={`flex flex-wrap gap-1 ${alinhar === 'right' ? 'justify-end' : 'justify-start'}`}>
      {cobrancas.map((c) => (
        <span key={c.numero} className={`text-base ${c.marcou ? 'text-emerald-400' : 'text-rose-400'}`} title={`Cobrança ${c.numero}`}>
          {c.marcou ? '⚽' : '✗'}
        </span>
      ))}
    </div>
  );
}
