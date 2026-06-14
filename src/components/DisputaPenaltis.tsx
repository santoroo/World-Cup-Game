// ============================================================================
// DisputaPenaltis — a disputa de pênaltis jogada como animação interativa. Cada
// cobrança a bola vai pro canto escolhido pelo cobrador e o goleiro pula pro
// canto escolhido pela defesa: mesmo canto → defesa provável; canto diferente →
// quase sempre gol. É a mesma tela do online (dois jogadores) e do solo (o
// usuário escolhe os dois lados do SEU time; a CPU sorteia o adversário) — a
// diferença vem só do view-model `dados`. Deixa SEMPRE claro quem está cobrando.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import type { ChutePenalti, DirecaoPenalti } from '../engine';

/** View-model normalizado, montado pelo MpBracket (online) ou pela tela do solo. */
export interface DadosDisputaPenaltis {
  stageLabel?: string;
  ladoA: { nome: string; icon: string };
  ladoB: { nome: string; icon: string };
  /** Cobranças já resolvidas (cresce ao vivo no online). */
  historico: ChutePenalti[];
  encerrada: boolean;
  vencedorLado: 'a' | 'b' | null;
  /** Cobrança pendente. null no replay já decidido. */
  pendente: {
    vez: 'a' | 'b';
    /** 'aguardando' = esperando os dois terminarem o jogo (online); 'escolhendo' = pode mirar. */
    estado: 'aguardando' | 'escolhendo';
    /** epoch ms do prazo (só pro contador); null = sem cronômetro. */
    prazo: number | null;
    jaEscolhi: boolean;
  } | null;
  /** De que lado eu sou (null = espectador). No solo é sempre 'a'. */
  meuLado: 'a' | 'b' | null;
}

const DIRS: DirecaoPenalti[] = ['esquerda', 'meio', 'direita'];
const SETA: Record<DirecaoPenalti, string> = { esquerda: '⬅️', meio: '⬆️', direita: '➡️' };
const POS: Record<DirecaoPenalti, number> = { esquerda: 22, meio: 50, direita: 78 };
const MS_VOO = 650;
const MS_RESULTADO = 950;

// Cores de acento por lado — reforçam quem é quem (junto do avatar/bandeira).
interface Acento {
  texto: string;
  borda: string;
  bg: string;
  anel: string;
  grad: string;
  zona: string;
}
const ACENTO: Record<'a' | 'b', Acento> = {
  a: { texto: 'text-sky-300', borda: 'border-sky-400/70', bg: 'bg-sky-500/20', anel: 'ring-sky-400/70', grad: 'from-sky-500/25', zona: 'bg-sky-400/40' },
  b: { texto: 'text-fuchsia-300', borda: 'border-fuchsia-400/70', bg: 'bg-fuchsia-500/20', anel: 'ring-fuchsia-400/70', grad: 'from-fuchsia-500/25', zona: 'bg-fuchsia-400/40' },
};

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
  const [mostrados, setMostrados] = useState(0);
  const [faseAnim, setFaseAnim] = useState<'voo' | 'resultado'>('voo');
  const [agora, setAgora] = useState(() => Date.now());
  const onConcluidoRef = useRef(onConcluido);
  onConcluidoRef.current = onConcluido;

  // Anima a próxima cobrança ainda não mostrada (uma de cada vez).
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

  // Cronômetro (só quando há prazo).
  const temPrazo = dados.pendente?.prazo != null;
  useEffect(() => {
    if (!temPrazo) return;
    const id = setInterval(() => setAgora(Date.now()), 200);
    return () => clearInterval(id);
  }, [temPrazo]);

  const animando = mostrados < historico.length;
  const alcancou = !animando;

  // Conclui quando a disputa acabou e tudo foi animado (ref + deps estáveis →
  // resiliente a re-render do pai e ao StrictMode; o último timer sobrevive).
  useEffect(() => {
    if (!alcancou || !dados.encerrada) return;
    const id = setTimeout(() => onConcluidoRef.current?.(), 1500);
    return () => clearTimeout(id);
  }, [alcancou, dados.encerrada]);

  const placarA = historico.slice(0, mostrados).filter((c) => c.lado === 'a' && c.marcou).length;
  const placarB = historico.slice(0, mostrados).filter((c) => c.lado === 'b' && c.marcou).length;
  const emAnim = animando ? historico[mostrados] : null;
  const restanteS = dados.pendente?.prazo != null ? Math.max(0, Math.ceil((dados.pendente.prazo - agora) / 1000)) : null;

  const pendente = alcancou && !dados.encerrada ? dados.pendente : null;
  const ladoQueCobra = pendente?.vez ?? null;
  const souCobrador = pendente != null && dados.meuLado === pendente.vez;
  const podeEscolher = pendente != null && pendente.estado === 'escolhendo' && dados.meuLado != null && !pendente.jaEscolhi;
  const acentoEscolha = dados.meuLado ? ACENTO[dados.meuLado] : ACENTO.a;

  return (
    <div className="animate-card-in overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-black/50 to-pitch-900/70 p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-widest text-amber-200/70">
        <span>{dados.stageLabel ?? 'Mata-mata'}</span>
        <span className="font-display text-base tracking-normal text-amber-300">Disputa de pênaltis</span>
      </div>

      {/* Placar — o lado que cobra fica aceso */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TimePanel lado="a" time={ladoA} placar={placarA} cobrando={ladoQueCobra === 'a'} alinhar="right" />
        <div className="font-display text-2xl text-white/30">×</div>
        <TimePanel lado="b" time={ladoB} placar={placarB} cobrando={ladoQueCobra === 'b'} alinhar="left" />
      </div>

      {/* Histórico (⚽/✗) por lado */}
      <div className="mt-2 grid grid-cols-2 gap-3 text-center">
        <Historico cobrancas={historico.slice(0, mostrados).filter((c) => c.lado === 'a')} alinhar="right" />
        <Historico cobrancas={historico.slice(0, mostrados).filter((c) => c.lado === 'b')} alinhar="left" />
      </div>

      {/* Banner de quem cobra — impossível confundir */}
      {ladoQueCobra && (
        <BannerCobrador
          time={ladoQueCobra === 'a' ? ladoA : ladoB}
          acento={ACENTO[ladoQueCobra]}
          souCobrador={souCobrador}
          souEnvolvido={dados.meuLado != null}
          aguardando={pendente?.estado === 'aguardando'}
        />
      )}

      {/* Gol + animação / mira */}
      <Gol
        emAnim={emAnim}
        faseAnim={faseAnim}
        podeEscolher={podeEscolher}
        souCobrador={souCobrador}
        acento={acentoEscolha}
        onEscolher={onEscolher}
      />

      {/* Rodapé: contador, status e fim */}
      <div className="mt-3 min-h-[1.75rem] text-center text-sm">
        {restanteS != null && podeEscolher && (
          <span className={`font-display ${restanteS <= 3 ? 'animate-pulse text-rose-300' : 'text-white/70'}`}>⏱ {restanteS}s pra escolher</span>
        )}
        {pendente != null && dados.meuLado != null && pendente.jaEscolhi && (
          <span className="text-emerald-300">Escolha feita! Aguardando o adversário…</span>
        )}
        {pendente?.estado === 'aguardando' && <span className="text-white/55">Aguardando os jogadores terminarem o jogo…</span>}
        {animando && <span className="text-white/45">Bola na marca do pênalti…</span>}
        {alcancou && dados.encerrada && (
          <span className="animate-pop font-display text-2xl text-amber-300">
            {(dados.vencedorLado === 'a' ? ladoA : ladoB).icon} {(dados.vencedorLado === 'a' ? ladoA : ladoB).nome} venceu nos pênaltis! 🏆
          </span>
        )}
      </div>
    </div>
  );
}

function TimePanel({
  lado,
  time,
  placar,
  cobrando,
  alinhar,
}: {
  lado: 'a' | 'b';
  time: { nome: string; icon: string };
  placar: number;
  cobrando: boolean;
  alinhar: 'left' | 'right';
}) {
  const ac = ACENTO[lado];
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border p-2 transition ${alinhar === 'right' ? 'flex-row-reverse text-right' : ''} ${
        cobrando ? `${ac.borda} ${ac.bg} ring-1 ${ac.anel}` : 'border-white/10 bg-black/20'
      }`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl ${cobrando ? `bg-gradient-to-b ${ac.grad} to-transparent` : ''}`}>
        {time.icon}
      </span>
      <div className="min-w-0">
        <p className={`truncate font-display text-base leading-tight ${cobrando ? ac.texto : 'text-white/80'}`}>{time.nome}</p>
        <p className="font-display text-3xl leading-none text-white">{placar}</p>
      </div>
    </div>
  );
}

function BannerCobrador({
  time,
  acento,
  souCobrador,
  souEnvolvido,
  aguardando,
}: {
  time: { nome: string; icon: string };
  acento: Acento;
  souCobrador: boolean;
  souEnvolvido: boolean;
  aguardando: boolean;
}) {
  const titulo = aguardando
    ? `${time.icon} ${time.nome} vai cobrar`
    : souEnvolvido
      ? souCobrador
        ? 'Sua vez! Mire o canto 🎯'
        : 'Defenda! Escolha o lado pra pular 🧤'
      : `${time.icon} ${time.nome} vai cobrar…`;
  return (
    <div className={`mt-3 rounded-xl border ${acento.borda} bg-gradient-to-r ${acento.grad} to-transparent px-3 py-2 text-center`}>
      <p className={`font-display text-lg ${acento.texto}`}>{titulo}</p>
    </div>
  );
}

/** O gol: zonas (mira/animação), goleiro e bola. */
function Gol({
  emAnim,
  faseAnim,
  podeEscolher,
  souCobrador,
  acento,
  onEscolher,
}: {
  emAnim: ChutePenalti | null;
  faseAnim: 'voo' | 'resultado';
  podeEscolher: boolean;
  souCobrador: boolean;
  acento: Acento;
  onEscolher?: (dir: DirecaoPenalti) => void;
}) {
  const mostrarResultado = emAnim != null && faseAnim === 'resultado';
  const defendeu = emAnim != null && !emAnim.marcou && emAnim.direcaoChute === emAnim.direcaoDefesa;
  const goleiroLeft = emAnim ? POS[emAnim.direcaoDefesa] : 50;
  const bolaLeft = emAnim ? POS[emAnim.direcaoChute] : 50;
  const bolaTop = emAnim ? (!emAnim.marcou && emAnim.direcaoChute !== emAnim.direcaoDefesa ? 8 : 34) : 86;

  return (
    <div className="relative mx-auto mt-3 aspect-[2/1] w-full max-w-md overflow-hidden rounded-xl bg-gradient-to-b from-sky-950/50 to-pitch-800/70">
      {/* Trave + rede */}
      <div className="absolute left-1/2 top-3 h-[68%] w-[84%] -translate-x-1/2 rounded-t-lg border-[3px] border-b-0 border-white/80" />
      <div
        className="absolute left-1/2 top-3 h-[68%] w-[84%] -translate-x-1/2 rounded-t-lg opacity-[0.18]"
        style={{ backgroundImage: 'repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px 11px),repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 11px)' }}
      />
      {/* gramado */}
      <div className="absolute inset-x-0 bottom-0 h-[18%] bg-pitch-700/60" />

      {/* Zonas (mira quando é minha vez) */}
      <div className="absolute left-1/2 top-3 flex h-[68%] w-[84%] -translate-x-1/2">
        {DIRS.map((dir) => (
          <button
            key={dir}
            type="button"
            disabled={!podeEscolher}
            onClick={podeEscolher ? () => onEscolher?.(dir) : undefined}
            className={`group relative flex-1 border-r border-white/10 last:border-r-0 transition ${
              podeEscolher ? 'cursor-pointer hover:bg-white/5' : 'cursor-default'
            }`}
          >
            {podeEscolher && (
              <span className={`absolute inset-x-1 top-1 rounded-md py-1 text-center text-xs font-semibold opacity-80 transition group-hover:opacity-100 ${acento.texto}`}>
                {SETA[dir]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Goleiro */}
      <div
        className="pointer-events-none absolute text-3xl transition-all duration-500 ease-out"
        style={{ left: `${goleiroLeft}%`, top: '40%', transform: `translate(-50%,-50%) ${mostrarResultado && defendeu ? 'scale(1.25)' : 'scale(1)'}` }}
      >
        🧤
      </div>

      {/* Bola */}
      <div
        className="pointer-events-none absolute text-2xl transition-all ease-out"
        style={{ left: `${bolaLeft}%`, top: `${bolaTop}%`, transform: `translate(-50%,-50%) scale(${emAnim ? 1.15 : 1})`, transitionDuration: `${MS_VOO}ms` }}
      >
        ⚽
      </div>

      {/* Carimbo de resultado */}
      {mostrarResultado && (
        <div className="absolute inset-0 grid place-items-center">
          <span
            className={`animate-pop font-display text-3xl drop-shadow-lg ${
              emAnim!.marcou ? 'text-emerald-300' : defendeu ? 'text-sky-300' : 'text-rose-300'
            }`}
          >
            {emAnim!.marcou ? 'GOL! ⚽' : defendeu ? 'DEFENDEU! 🧤' : 'PRA FORA! 😱'}
          </span>
        </div>
      )}

      {/* Dica de mira */}
      {podeEscolher && !emAnim && (
        <p className="absolute inset-x-0 bottom-1 text-center text-[11px] text-white/55">
          {souCobrador ? 'toque no canto pra chutar' : 'toque no canto pra defender'}
        </p>
      )}
    </div>
  );
}

function Historico({ cobrancas, alinhar }: { cobrancas: ChutePenalti[]; alinhar: 'left' | 'right' }) {
  return (
    <div className={`flex flex-wrap gap-1 ${alinhar === 'right' ? 'justify-end' : 'justify-start'}`}>
      {cobrancas.map((c) => (
        <span key={c.numero} className={`text-sm ${c.marcou ? 'text-emerald-400' : 'text-rose-400'}`} title={`Cobrança ${c.numero}`}>
          {c.marcou ? '⚽' : '✗'}
        </span>
      ))}
    </div>
  );
}
