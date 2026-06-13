# Copa dos Sonhos — Especificação Completa do Jogo
*(Draft de seleções históricas da Copa + elenco bônus "Colégio Módulo")*

> **Nome de trabalho** — pode ser trocado.
> **Importante:** implementação 100% própria. NÃO copiar código, assets, textos, identidade visual, base de dados ou layout de nenhum jogo existente (incluindo o "7a0 / Sete a Zero"). Mesma *ideia* de gameplay, execução e dados próprios.

---

## 0. INSTRUÇÕES PARA QUEM VAI IMPLEMENTAR (Claude Code)

Você está recebendo este documento **sem nenhum contexto de conversa anterior**. Tudo o que você precisa está aqui. Faça nesta ordem:

1. **Leia o documento inteiro** antes de codar.
2. Proponha um **plano curto** de implementação e a **estrutura de pastas**.
3. Faça o **scaffold**: React + TypeScript + Vite + Tailwind.
4. Implemente a **engine isolada da UI** (sorteio, derivação de atributos, química, simulação) com lógica pura e determinística por *seed*.
5. Carregue os dados de `src/data/editions.json` (monte esse arquivo a partir das seções **17** e **18**).
6. Implemente o **MVP jogável** seguindo as telas da seção 7.
7. Configure **git** e faça commits incrementais.

**Não trave pedindo detalhes.** Tome boas decisões de MVP; ajustes específicos virão depois.
**Prioridade:** 1) jogo funcionando · 2) fluxo divertido · 3) interface bonita · 4) código organizado · 5) fácil de expandir.

---

## 1. Conceito

Simulador casual de futebol. O jogador **não escolhe craques livremente**: rola um dado que sorteia **seleção + ano de Copa**, escolhe **1 jogador** daquele elenco, e repete até montar **11 titulares** numa formação. Depois simula uma campanha contra adversários históricos. O troféu máximo é vencer com placar absurdo — o lendário **7 a 0**. A graça é misturar **conhecimento de futebol + sorte + estratégia**.

---

## 2. Escopo do conteúdo

- **Núcleo:** seleções reais que participaram das Copas **de 1962 em diante** (1958 = add fácil opcional).
- **Realidade:** cobrir *todas* as seleções de *todas* as Copas = milhares de jogadores, inviável de digitar à mão. Portanto:
  - MVP entrega **~20–30 elencos icônicos curados** (lista na seção 18), com overalls calibrados.
  - **Schema aberto:** adicionar uma seleção = colar um objeto no JSON.
  - Opcional (flag `generateFiller`): gerador de elencos plausíveis para seleções menos famosas, marcados como aproximados, só pra encher o pool.
- **Elenco bônus "Colégio Módulo":** entra **no mesmo sorteio** como mais uma "seleção", com **peso menor** (`weight` baixo → pode vir ou não). Dados completos na seção 17.

---

## 3. Modelo de dados

```jsonc
// Jogador (definição mínima: positions + overall + desc; atributos derivados na seção 3b)
{
  "id": "ronaldo_bra_2002",
  "name": "Ronaldo",
  "positions": ["ST"],     // 1ª = principal; "ALL" = coringa (qualquer posição, sem penalidade)
  "overall": 98,
  "desc": "Artilheiro e campeão mundial em 2002.",
  "rarity": "lenda"        // comum | raro | craque | lenda  (opcional)
  // attack/midfield/defense/goalkeeper/technique/physical/clutch:
  // derivados automaticamente (seção 3b), salvo se vierem explícitos aqui
}

// Edição (seleção + ano)
{
  "id": "bra_2002",
  "country": "Brasil",
  "flag": "🇧🇷",            // emoji/código — sem assets de terceiros
  "year": 2002,
  "strength": 96,          // força média; usada por adversários gerados
  "weight": 1,             // peso no sorteio (Colégio Módulo usa < 1)
  "isBonus": false,        // true = Colégio Módulo (permite overall > 99)
  "players": [ /* ... */ ]
}
```

Base inteira em `src/data/editions.json`. Versionável e fácil de expandir.

---

## 3b. Derivação de atributos (aplicar a TODOS os jogadores)

Cada jogador é definido por `positions` + `overall`. Os 7 atributos abaixo são **derivados** a partir do overall e da posição principal, salvo se já vierem explícitos no jogador. Use estes multiplicadores (resultado arredondado, **sem limite superior** — ver regra de overall na seção 17):

| Pos. | attack | midfield | defense | goalkeeper | technique | physical | clutch |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| GK   |0.12|0.20|0.70|1.00|0.70|0.80|0.90|
| CB   |0.40|0.60|1.00|0.00|0.70|0.95|0.85|
| LB/RB|0.70|0.75|0.90|0.00|0.80|0.90|0.80|
| DM   |0.60|1.00|0.88|0.00|0.80|0.90|0.82|
| CM   |0.75|1.00|0.70|0.00|0.90|0.80|0.85|
| AM   |0.90|0.92|0.50|0.00|0.95|0.72|0.88|
| LW/RW|0.92|0.78|0.42|0.00|0.92|0.82|0.85|
| ST   |1.00|0.62|0.35|0.00|0.86|0.86|0.92|
| ALL  |0.95|0.95|0.95|0.92|0.95|0.95|0.95|

Para jogadores com **múltiplas posições**, use a média dos multiplicadores das posições listadas. `ALL` = coringa total (atributos altos e equilibrados, inclusive goleiro).

---

## 4. Posições e compatibilidade

`GK` goleiro · `CB` zagueiro · `LB`/`RB` laterais · `DM` volante · `CM` meio · `AM` meia ofensivo (= "CAM") · `LW`/`RW` pontas · `ST` centroavante · `ALL` coringa.

Encaixe nas vagas da formação:
- Posição exata (ou `ALL`): perfeito, sem penalidade.
- `ST` ↔ `LW`/`RW`: penalidade pequena · `CM` ↔ `DM`/`AM`: penalidade pequena · `CB` → lateral: penalidade média.
- Jogador de linha no gol: **proibido** · `GK` fora do gol: **proibido** (exceto `ALL`).
- Fora de posição reduz **química** e aplica penalidade no atributo.

---

## 5. Formações

`4-3-3` · `4-4-2` · `3-5-2` · `4-2-3-1` · `3-4-3`. Cada uma define as vagas por posição.
Ex. **4-3-3** = 1 GK, 2 CB, 1 LB, 1 RB, 3 meios (DM/CM/AM), 3 frente (ST/LW/RW).

---

## 6. Modos

- **Clássico:** mostra overall e atributos das cartas.
- **Almanaque:** esconde notas; escolhe por nome/país/ano; revela o overall só após escolher.
- **Caos (opcional):** sorteios mais difíceis, seleções menos óbvias, peso do Colégio Módulo maior.

Estilo de jogo (opcional): **Defensivo** (+def, −atq) · **Equilibrado** · **Ofensivo** (+atq, −def).

---

## 7. Fluxo do usuário (telas)

1. **HomePage** — nome, frase curta, "Jogar agora", "Como funciona". Visual de futebol/Copa.
2. **GameSetup** — formação, modo, estilo.
3. **DraftScreen** — campo + vagas + progresso (`7/11`) + "Rolar dado" + carta(s) do sorteio + "Confirmar escolha" + overall parcial + pontos fortes/fracos.
4. **SimulationScreen** — campanha rodando.
5. **MatchResult** — placar + resumo por jogo.
6. **FinalResult / ShareCard** — resultado final compartilhável.

Componentes: `HomePage, GameSetup, DraftScreen, PlayerCard, FormationPitch, RollResult, TeamSummary, SimulationScreen, MatchResult, FinalResult, ShareCard`.

---

## 8. Sorteio (draft)

- Botão **"Rolar dado"** com animação.
- Sorteia uma **edição** respeitando `weight` (Colégio Módulo = peso baixo → "pode vir ou não").
- Mostra os jogadores **ainda disponíveis** daquela edição. Usuário escolhe **1**.
- Regras: sem repetição; respeita compatibilidade (proíbe impossíveis); mostra vagas restantes; **pular** permitido com limite (3) ou penalidade.
- A sorte faz parte: pode vir elenco fortíssimo ou fraquíssimo.

---

## 9. Força e química do time

```
teamAttack    = média(ofensivos dos atacantes) + bônus dos meias ofensivos
teamMidfield  = média(meias)
teamDefense   = média(defensores) + peso do goleiro
goalkeeper    = atributo do GK
chemistry     = base
                + bônus por mesmo país + mesma era/década
                + bônus por todos em posição correta + formação coerente
                + bônus por capitão/líder (maior clutch)
                − penalidade por jogadores fora de posição
overall       = média ponderada(attack, midfield, defense, goalkeeper, chemistry)
```
Exibir na `TeamSummary`: ataque/meio/defesa/GK/química/overall + pontos fortes e fracos.

---

## 10. Simulação de partida

`simulateMatch(userTeam, opponentTeam)`:
```
xgA = f(attackA + midfieldA + chemistryA − defenseB − gkB) * estiloA
xgB = f(attackB + midfieldB + chemistryB − defenseA − gkA) * estiloB
placar = converter(xg) com aleatoriedade controlada (fator sorte por seed)
```
- Química alta → mais consistência (menos variância).
- Fator sorte impede resultado sempre previsível.
- Time muito superior pode fazer 5, 6, 7 gols. **7 a 0 raro mas possível.**
- **Não limitar atributos a 99** nas contas (o time bônus pode estourar isso).

Resumo por jogo: placar, gols (quem marcou), destaque, frase curta de análise.
**Campanha:** Grupos (3 jogos) → Oitavas → Quartas → Semi → Final. Versão rápida: 1 partida única.

---

## 11. Pontuação e ranking

Após a campanha: resultado (campeão/eliminado), vitórias, gols feitos/sofridos, maior goleada, overall, **nota final** e **ranking textual**.
Critérios: campeão = bônus grande · **7 a 0 = bônus máximo** · muitos gols feitos = bônus · poucos sofridos = bônus · química alta = bônus · fora de posição = penalidade.
Rankings: *"Lenda da Copa"*, *"Campeão dominante"*, *"Time forte, faltou equilíbrio"*, *"Eliminado com honra"*, *"Bagre histórico"*.

---

## 12. Tela final / compartilhamento

Mostrar: escalação completa, formação, overall, campanha, placar da final, maior goleada, melhor jogador, pior escolha (opcional, tom engraçado). Botões: **Jogar de novo**, **Compartilhar**, **Copiar link**, **Baixar imagem** (se der).
Sem login no MVP. Salvar em **localStorage** + **código serializado na URL** (seed/ID) pra compartilhar.

---

## 13. Interface / visual

Moderna, rápida, viciante. Fundo escuro ou verde campo · cartas estilo card de futebol · botões grandes · animação de dado · placar estilo transmissão · campo com posições · feedback visual ao escolher · **responsivo desktop + celular**.

---

## 14. Tom (mensagens próprias)

Futebol brasileiro, divertido. Ex.: *"Role o dado e torça por um elencão."*, *"Agora o bicho pegou."*, *"Esse ataque mete medo."*, *"A defesa tá pedindo arrego."*, *"Você montou uma máquina."*, *"Esse time não saía da fase de grupos."*, *"Faltou pouco pro 7 a 0."*, *"Humilhação pra história."*

---

## 15. Stack e arquitetura

- **React + TypeScript + Vite + Tailwind.**
- Dados em **JSON local**; **localStorage** pra progresso.
- Engine (sorteio/química/simulação) **pura e isolada da UI**, determinística por seed.
- **Preparar pra multiplayer futuro** (sem implementar): sala 2 jogadores, sorteios alternados, times se enfrentam, link de sala, modo assíncrono.

---

## 16. Escopo de entrega

**MVP:** Home → setup → sorteio com pesos → lista do elenco → escolher 1 por rodada → campo 11 posições → overall/química → simulação de campanha → tela final → jogar de novo. Inclui elencos icônicos (seção 18) + **Colégio Módulo** (seção 17).
**Depois:** mais elencos, gerador de filler, multiplayer, ranking global, compartilhar imagem, mais modos, login, admin de jogadores.

---

## 17. DADOS — Elenco bônus "Colégio Módulo"

Brincadeira com o pessoal da escola. Entra no **mesmo sorteio** das seleções reais, com **`weight` baixo** (sugestão `0.25`) e **`isBonus: true`**.

**Regra de overall:** seleções reais têm teto **99**. O Colégio Módulo é **exceção** — overalls podem passar de 99 (102, 105, 120). O engine **não deve limitar** esses valores; o time bônus é intencionalmente absurdo (é a graça).

**Posições:** `CAM` foi mapeado para `AM`. `ALL` = coringa (qualquer posição, sem penalidade). Edições **2012 e 2013** compartilham o mesmo elenco. **2022** ainda não tem jogadores (adicionar depois). Descrições são **provisórias** — editar à vontade.

```json
{
  "modulo_2012": {
    "id": "modulo_2012", "country": "Colégio Módulo", "flag": "🎓", "year": 2012,
    "strength": 88, "weight": 0.25, "isBonus": true,
    "players": [
      { "id": "deco_mod_2012", "name": "Deco", "positions": ["GK"], "overall": 90, "desc": "Paredão embaixo das traves." },
      { "id": "murilo_mod_2012", "name": "Murilo", "positions": ["RW"], "overall": 91, "desc": "Velocidade e drible pela direita." },
      { "id": "biel_mod_2012", "name": "Biel", "positions": ["AM","LW"], "overall": 91, "desc": "Criatividade e finalização." },
      { "id": "vini_mod_2012", "name": "Vini", "positions": ["ALL"], "overall": 99, "desc": "Coringa: joga em qualquer lugar do campo." },
      { "id": "ricardo_mod_2012", "name": "Ricardo", "positions": ["CB"], "overall": 65, "desc": "Zaga raçuda, mais coração que técnica." },
      { "id": "luceval_mod_2012", "name": "Luceval", "positions": ["LB"], "overall": 80, "desc": "Sobe e desce a lateral o jogo todo." },
      { "id": "joaomanoel_mod_2012", "name": "João Manoel", "positions": ["RB"], "overall": 85, "desc": "Lateral seguro na marcação." }
    ]
  },

  "modulo_2013": {
    "id": "modulo_2013", "country": "Colégio Módulo", "flag": "🎓", "year": 2013,
    "strength": 88, "weight": 0.25, "isBonus": true,
    "players": [
      { "id": "deco_mod_2013", "name": "Deco", "positions": ["GK"], "overall": 90, "desc": "Paredão embaixo das traves." },
      { "id": "murilo_mod_2013", "name": "Murilo", "positions": ["RW"], "overall": 91, "desc": "Velocidade e drible pela direita." },
      { "id": "biel_mod_2013", "name": "Biel", "positions": ["AM","LW"], "overall": 91, "desc": "Criatividade e finalização." },
      { "id": "vini_mod_2013", "name": "Vini", "positions": ["ALL"], "overall": 99, "desc": "Coringa: joga em qualquer lugar do campo." },
      { "id": "ricardo_mod_2013", "name": "Ricardo", "positions": ["CB"], "overall": 65, "desc": "Zaga raçuda, mais coração que técnica." },
      { "id": "luceval_mod_2013", "name": "Luceval", "positions": ["LB"], "overall": 80, "desc": "Sobe e desce a lateral o jogo todo." },
      { "id": "joaomanoel_mod_2013", "name": "João Manoel", "positions": ["RB"], "overall": 85, "desc": "Lateral seguro na marcação." }
    ]
  },

  "modulo_2015": {
    "id": "modulo_2015", "country": "Colégio Módulo", "flag": "🎓", "year": 2015,
    "strength": 95, "weight": 0.25, "isBonus": true,
    "players": [
      { "id": "deco_mod_2015", "name": "Deco", "positions": ["GK"], "overall": 105, "desc": "Versão lendária no gol." },
      { "id": "murilo_mod_2015", "name": "Murilo", "positions": ["RW","AM"], "overall": 105, "desc": "Ataque e criação na mesma jogada." },
      { "id": "biel_mod_2015", "name": "Biel", "positions": ["LW","AM"], "overall": 105, "desc": "Pura magia pela esquerda." },
      { "id": "vini_mod_2015", "name": "Vini", "positions": ["ALL"], "overall": 99, "desc": "Coringa: resolve em qualquer posição." },
      { "id": "missani_mod_2015", "name": "Missani", "positions": ["ST"], "overall": 90, "desc": "Faro de gol na área." },
      { "id": "vitormandrake_mod_2015", "name": "Vitor Mandrake", "positions": ["CM"], "overall": 85, "desc": "Maestro do meio-campo." },
      { "id": "bad_mod_2015", "name": "BAD", "positions": ["CB"], "overall": 30, "desc": "A defesa pede orações." }
    ]
  },

  "modulo_2023": {
    "id": "modulo_2023", "country": "Colégio Módulo", "flag": "🎓", "year": 2023,
    "strength": 97, "weight": 0.25, "isBonus": true,
    "players": [
      { "id": "deco_mod_2023", "name": "Deco", "positions": ["GK"], "overall": 99, "desc": "Goleirão confiável." },
      { "id": "murilo_mod_2023", "name": "Murilo", "positions": ["RW","AM"], "overall": 99, "desc": "Desequilibra pela direita e cria." },
      { "id": "biel_mod_2023", "name": "Biel", "positions": ["LW","AM"], "overall": 99, "desc": "Talento pela esquerda e no meio." },
      { "id": "vini_mod_2023", "name": "Vini", "positions": ["ALL"], "overall": 60, "desc": "Versão veterano — ainda quebra um galho em qualquer posição." },
      { "id": "valente_mod_2023", "name": "Valente", "positions": ["AM","CM"], "overall": 102, "desc": "Cérebro e motor do time." },
      { "id": "piovesan_mod_2023", "name": "Piovesan", "positions": ["RW"], "overall": 101, "desc": "Imparável pela direita." },
      { "id": "enzo_mod_2023", "name": "Enzo", "positions": ["ST"], "overall": 99, "desc": "Artilheiro nato." },
      { "id": "jaco_mod_2023", "name": "Jaco", "positions": ["RB"], "overall": 85, "desc": "Lateral aplicado." },
      { "id": "marcos_mod_2023", "name": "Marcos", "positions": ["RB","CM"], "overall": 88, "desc": "Versátil entre defesa e meio." },
      { "id": "danielprofessor_mod_2023", "name": "Daniel Professor", "positions": ["ALL"], "overall": 120, "desc": "O chefão. Joga em todas as posições e ainda dá aula. Boa sorte pra quem enfrentar." }
    ]
  }
}
```

> **Nota:** edição `modulo_2022` pendente (sem jogadores). Adicionar quando houver lista.

---

## 18. DADOS — Seleções reais (curadoria)

Crie os elencos abaixo no mesmo formato das edições (seção 3), com **`isBonus: false`** e **`weight: 1`**. Overalls dos jogadores **no teto 99** (nada acima). Para cada seleção, inclua de **8 a 15 jogadores notáveis** daquele elenco, distribuídos pelas posições, com overalls coerentes com o desempenho histórico e a `strength` da edição. Atributos individuais são derivados pela seção 3b — basta definir `positions` + `overall` + `desc`.

Seleções a criar no MVP:
**Brasil** 1970, 1982, 1994, 2002 · **Argentina** 1978, 1986, 2022 · **Alemanha** 1974, 1990, 2014 · **Itália** 1982, 2006 · **França** 1998, 2018 · **Holanda** 1974, 2010 · **Espanha** 2010 · **Inglaterra** 1966 · **Uruguai** 1970 · **Portugal** 2006 · **Croácia** 2018 · **Colômbia** 1994 · **México** 1986 · **Camarões** 1990.

Calibragem sugerida de `strength`: elencos lendários (Brasil 1970/2002, Alemanha 2014, Argentina 1986/2022, França 1998) na faixa 92–97; bons elencos 84–91; azarões 75–83. Deixe o `editions.json` organizado e fácil de expandir com novas seleções depois.
