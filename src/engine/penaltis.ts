// ============================================================================
// Disputa de pênaltis — núcleo puro (sem React/DOM/sockets).
//
// Decide um confronto empatado do mata-mata por pênaltis. No online, cada
// cobrança é interativa: o COBRADOR escolhe o canto (esquerda/meio/direita) e o
// DEFENSOR escolhe pra onde pular; o resultado sai do cruzamento das duas
// escolhas + um pouco de sorte (`createRng`). No solo, as direções são sorteadas
// automaticamente (`gerarDisputaAutomatica`), então tudo é determinístico por
// seed. Pênaltis vivem num stream de RNG próprio (`${seed}#pen#...`) pra não
// perturbar os streams de gols/cartões.
// ============================================================================

import { createRng } from './rng';

export type DirecaoPenalti = 'esquerda' | 'meio' | 'direita';

export const DIRECOES_PENALTI: readonly DirecaoPenalti[] = ['esquerda', 'meio', 'direita'] as const;

/** Cobranças regulamentares por lado antes da morte súbita. */
export const COBRANCAS_REGULARES = 5;

/** Tempo (ms) que cada lado tem pra escolher antes do auto. */
export const MS_PRAZO_PENALTI = 10_000;

// Probabilidades do cruzamento canto-do-chute × canto-da-defesa.
const PROB_GOL_CANTO_DIFERENTE = 0.88; // goleiro pulou pro lado errado → quase gol
const PROB_GOL_MESMO_CANTO = 0.2; // goleiro acertou o lado → defesa provável

/** Uma cobrança já resolvida (pra histórico/animação). `lado` a = aId, b = bId. */
export interface ChutePenalti {
  numero: number;
  lado: 'a' | 'b';
  direcaoChute: DirecaoPenalti;
  direcaoDefesa: DirecaoPenalti;
  marcou: boolean;
}

export interface DisputaPenaltis {
  partidaId: string;
  aId: string;
  bId: string;
  /** Base do stream de RNG (`${seed}#pen#...`). */
  seed: string;
  golsA: number;
  golsB: number;
  cobrancasA: number;
  cobrancasB: number;
  /** Quem cobra a cobrança pendente (alterna a cada cobrança). */
  vez: 'a' | 'b';
  /** Índice (1-based) da cobrança pendente. */
  numeroChute: number;
  /** Canto escolhido pelo cobrador (null = ainda não escolheu). */
  direcaoChute: DirecaoPenalti | null;
  /** Canto escolhido pelo defensor (null = ainda não escolheu). */
  direcaoDefesa: DirecaoPenalti | null;
  /** Epoch ms do limite pra escolher; null = ainda não armado (intro). */
  prazo: number | null;
  /** Ids dos jogadores que já terminaram o replay 0'→90' (online). */
  prontos: string[];
  historico: ChutePenalti[];
  encerrada: boolean;
  vencedorId: string | null;
}

/** Cria uma disputa zerada. Quem cobra primeiro sai do seed (determinístico). */
export function criarDisputa(partidaId: string, aId: string, bId: string, seed: string): DisputaPenaltis {
  const primeiro: 'a' | 'b' = createRng(`${seed}#pen#ordem`).chance(0.5) ? 'a' : 'b';
  return {
    partidaId,
    aId,
    bId,
    seed,
    golsA: 0,
    golsB: 0,
    cobrancasA: 0,
    cobrancasB: 0,
    vez: primeiro,
    numeroChute: 1,
    direcaoChute: null,
    direcaoDefesa: null,
    prazo: null,
    prontos: [],
    historico: [],
    encerrada: false,
    vencedorId: null,
  };
}

/** Define o canto do cobrador ('chute') ou do defensor ('defesa'). No-op se já definido/encerrada. */
export function definirDirecao(disputa: DisputaPenaltis, papel: 'chute' | 'defesa', dir: DirecaoPenalti): DisputaPenaltis {
  if (disputa.encerrada) return disputa;
  if (papel === 'chute') {
    if (disputa.direcaoChute != null) return disputa;
    return { ...disputa, direcaoChute: dir };
  }
  if (disputa.direcaoDefesa != null) return disputa;
  return { ...disputa, direcaoDefesa: dir };
}

export function ambasDirecoesDefinidas(disputa: DisputaPenaltis): boolean {
  return disputa.direcaoChute != null && disputa.direcaoDefesa != null;
}

/** Preenche, via RNG, as direções que ainda faltam (timeout / modo automático). */
export function autoCompletarDirecoes(disputa: DisputaPenaltis): DisputaPenaltis {
  if (disputa.encerrada) return disputa;
  const rng = createRng(`${disputa.seed}#pen#${disputa.numeroChute}#auto`);
  let d = disputa;
  if (d.direcaoChute == null) d = { ...d, direcaoChute: rng.pick(DIRECOES_PENALTI) };
  if (d.direcaoDefesa == null) d = { ...d, direcaoDefesa: rng.pick(DIRECOES_PENALTI) };
  return d;
}

/**
 * Melhor de 5 + morte súbita. Decidida só quando há um vencedor estrito: na
 * fase regular, quando uma vantagem fica inalcançável; na morte súbita, quando
 * os dois cobraram o mesmo número e o placar difere.
 */
export function disputaDecidida(golsA: number, golsB: number, cobrancasA: number, cobrancasB: number): boolean {
  const restantesA = Math.max(0, COBRANCAS_REGULARES - cobrancasA);
  const restantesB = Math.max(0, COBRANCAS_REGULARES - cobrancasB);
  if (cobrancasA < COBRANCAS_REGULARES || cobrancasB < COBRANCAS_REGULARES) {
    return golsA > golsB + restantesB || golsB > golsA + restantesA;
  }
  return cobrancasA === cobrancasB && golsA !== golsB;
}

/**
 * Resolve a cobrança pendente (precisa das duas direções definidas) e prepara a
 * próxima — ou encerra a disputa. `agora`/`msPorChute` rearmam o prazo da
 * próxima cobrança (irrelevantes no modo automático).
 */
export function resolverChutePendente(disputa: DisputaPenaltis, agora: number, msPorChute: number): DisputaPenaltis {
  if (disputa.encerrada || disputa.direcaoChute == null || disputa.direcaoDefesa == null) return disputa;

  const rng = createRng(`${disputa.seed}#pen#${disputa.numeroChute}`);
  const mesmoCanto = disputa.direcaoChute === disputa.direcaoDefesa;
  const marcou = rng.chance(mesmoCanto ? PROB_GOL_MESMO_CANTO : PROB_GOL_CANTO_DIFERENTE);

  const lado = disputa.vez;
  const golsA = disputa.golsA + (lado === 'a' && marcou ? 1 : 0);
  const golsB = disputa.golsB + (lado === 'b' && marcou ? 1 : 0);
  const cobrancasA = disputa.cobrancasA + (lado === 'a' ? 1 : 0);
  const cobrancasB = disputa.cobrancasB + (lado === 'b' ? 1 : 0);

  const chute: ChutePenalti = {
    numero: disputa.numeroChute,
    lado,
    direcaoChute: disputa.direcaoChute,
    direcaoDefesa: disputa.direcaoDefesa,
    marcou,
  };
  const historico = [...disputa.historico, chute];

  if (disputaDecidida(golsA, golsB, cobrancasA, cobrancasB)) {
    return {
      ...disputa,
      golsA,
      golsB,
      cobrancasA,
      cobrancasB,
      historico,
      direcaoChute: null,
      direcaoDefesa: null,
      prazo: null,
      encerrada: true,
      vencedorId: golsA > golsB ? disputa.aId : disputa.bId,
    };
  }

  return {
    ...disputa,
    golsA,
    golsB,
    cobrancasA,
    cobrancasB,
    historico,
    vez: lado === 'a' ? 'b' : 'a',
    numeroChute: disputa.numeroChute + 1,
    direcaoChute: null,
    direcaoDefesa: null,
    prazo: agora + msPorChute,
  };
}

/** Marca um jogador envolvido como pronto (terminou o replay 0'→90'). */
export function marcarPronto(disputa: DisputaPenaltis, playerId: string): DisputaPenaltis {
  if (playerId !== disputa.aId && playerId !== disputa.bId) return disputa;
  if (disputa.prontos.includes(playerId)) return disputa;
  return { ...disputa, prontos: [...disputa.prontos, playerId] };
}

/** Os dois lados terminaram o replay e a disputa pode começar. */
export function prontosParaComecar(disputa: DisputaPenaltis): boolean {
  return disputa.prontos.includes(disputa.aId) && disputa.prontos.includes(disputa.bId);
}

/** Arma o prazo da cobrança atual, se ainda não armado. */
export function armarPrazo(disputa: DisputaPenaltis, agora: number, msPorChute: number): DisputaPenaltis {
  if (disputa.encerrada || disputa.prazo != null) return disputa;
  return { ...disputa, prazo: agora + msPorChute };
}

/**
 * Direção determinística do adversário (CPU) numa cobrança — usada no solo
 * interativo: o usuário escolhe seu canto, a máquina sorteia o do outro time.
 * Stream próprio (`#cpu`) pra não colidir com a resolução (`#pen`).
 */
export function escolhaCpu(disputaSeed: string, numeroChute: number): DirecaoPenalti {
  return createRng(`${disputaSeed}#cpu#${numeroChute}`).pick(DIRECOES_PENALTI);
}

/**
 * Roda a disputa inteira automaticamente (direções sorteadas) — usada no solo e
 * em testes. Determinística por seed. `favorA` (~[-0.33, 0.33]) inclina o
 * resultado pro lado A (time mais forte): o goleiro adversário "acerta o canto"
 * menos nas cobranças de A e mais nas de B, então A converte mais. 0 = neutro.
 */
export function gerarDisputaAutomatica(
  partidaId: string,
  aId: string,
  bId: string,
  seed: string,
  favorA = 0,
): DisputaPenaltis {
  let d = criarDisputa(partidaId, aId, bId, seed);
  let guard = 0;
  while (!d.encerrada && guard++ < 200) {
    const rng = createRng(`${d.seed}#pen#${d.numeroChute}#auto`);
    const chute = rng.pick(DIRECOES_PENALTI);
    // Goleiro acerta o canto com probabilidade ajustada por quem cobra.
    const vies = d.vez === 'a' ? -favorA : favorA;
    const pAcerto = Math.max(0.05, Math.min(0.95, 1 / 3 + vies));
    const defesa = rng.chance(pAcerto) ? chute : rng.pick(DIRECOES_PENALTI.filter((x) => x !== chute));
    d = definirDirecao(d, 'chute', chute);
    d = definirDirecao(d, 'defesa', defesa);
    d = resolverChutePendente(d, 0, 0);
  }
  return d;
}
