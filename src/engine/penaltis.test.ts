import { describe, expect, it } from 'vitest';
import {
  armarPrazo,
  autoCompletarDirecoes,
  criarDisputa,
  definirDirecao,
  disputaDecidida,
  gerarDisputaAutomatica,
  marcarPronto,
  prontosParaComecar,
  resolverChutePendente,
  type DirecaoPenalti,
  type DisputaPenaltis,
} from './index';

/** Resolve uma cobrança forçando os cantos do chute e da defesa. */
function cobrar(d: DisputaPenaltis, chute: DirecaoPenalti, defesa: DirecaoPenalti): DisputaPenaltis {
  d = definirDirecao(d, 'chute', chute);
  d = definirDirecao(d, 'defesa', defesa);
  return resolverChutePendente(d, 0, 0);
}

describe('penaltis — resolução de uma cobrança', () => {
  it('mesmo canto quase sempre é defesa; cantos diferentes quase sempre são gol', () => {
    let defesas = 0;
    let gols = 0;
    for (let i = 0; i < 200; i++) {
      const d = criarDisputa('m', 'a', 'b', `seed-${i}`);
      const mesmo = cobrar(d, 'esquerda', 'esquerda');
      const diferente = cobrar(d, 'esquerda', 'direita');
      if (!mesmo.historico[0].marcou) defesas++;
      if (diferente.historico[0].marcou) gols++;
    }
    expect(defesas).toBeGreaterThan(140); // ~80% de defesa no mesmo canto
    expect(gols).toBeGreaterThan(150); // ~88% de gol em canto diferente
  });

  it('alterna a vez e respeita quem o seed escolheu pra começar', () => {
    const d = criarDisputa('m', 'a', 'b', 'ordem');
    const primeiro = d.vez;
    const apos = cobrar(d, 'meio', 'esquerda');
    expect(apos.historico[0].lado).toBe(primeiro);
    expect(apos.vez).toBe(primeiro === 'a' ? 'b' : 'a');
    expect(apos.numeroChute).toBe(2);
  });

  it('não resolve sem as duas direções definidas', () => {
    let d = criarDisputa('m', 'a', 'b', 's');
    d = definirDirecao(d, 'chute', 'meio');
    expect(resolverChutePendente(d, 0, 0)).toBe(d); // sem defesa → no-op
  });

  it('definirDirecao é no-op se já definida', () => {
    let d = criarDisputa('m', 'a', 'b', 's');
    d = definirDirecao(d, 'chute', 'esquerda');
    const d2 = definirDirecao(d, 'chute', 'direita');
    expect(d2.direcaoChute).toBe('esquerda');
  });
});

describe('penaltis — decisão (melhor de 5 + morte súbita)', () => {
  it('decide cedo quando a vantagem fica inalcançável', () => {
    // A: 3 gols em 3 cobranças; B: 0 em 3 → B só tem 2 restantes, não alcança.
    expect(disputaDecidida(3, 0, 3, 3)).toBe(true);
    // Ainda alcançável.
    expect(disputaDecidida(2, 1, 3, 3)).toBe(false);
  });

  it('5x5 empatado segue pra morte súbita; decide em cobranças iguais', () => {
    expect(disputaDecidida(3, 3, 5, 5)).toBe(false); // empate após as 5
    expect(disputaDecidida(4, 3, 6, 6)).toBe(true); // morte súbita resolvida
    expect(disputaDecidida(4, 3, 6, 5)).toBe(false); // só A cobrou na rodada extra
  });
});

describe('penaltis — modo automático (solo) e prontidão (online)', () => {
  it('gerarDisputaAutomatica sempre encerra com um vencedor e é determinística', () => {
    const a = gerarDisputaAutomatica('m', 'home', 'away', 'campanha#1');
    const b = gerarDisputaAutomatica('m', 'home', 'away', 'campanha#1');
    expect(a.encerrada).toBe(true);
    expect([a.aId, a.bId]).toContain(a.vencedorId);
    expect(a.golsA).not.toBe(a.golsB);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // mesmo seed → mesma disputa
    // Cada lado cobrou pelo menos uma vez e no máximo o número de cobranças do outro ±1.
    expect(Math.abs(a.cobrancasA - a.cobrancasB)).toBeLessThanOrEqual(1);
  });

  it('autoCompletarDirecoes preenche os dois cantos que faltam', () => {
    const d = autoCompletarDirecoes(criarDisputa('m', 'a', 'b', 's'));
    expect(d.direcaoChute).not.toBeNull();
    expect(d.direcaoDefesa).not.toBeNull();
  });

  it('só começa quando os dois envolvidos estão prontos; prazo arma uma vez', () => {
    let d = criarDisputa('m', 'a', 'b', 's');
    d = marcarPronto(d, 'a');
    expect(prontosParaComecar(d)).toBe(false);
    d = marcarPronto(d, 'estranho'); // ignora quem não é da partida
    d = marcarPronto(d, 'b');
    expect(prontosParaComecar(d)).toBe(true);

    const armada = armarPrazo(d, 1000, 10_000);
    expect(armada.prazo).toBe(11_000);
    expect(armarPrazo(armada, 5000, 10_000).prazo).toBe(11_000); // não rearma
  });
});
