# Copa dos Sonhos ⚽🏆

Simulador casual de futebol. Role o dado, sorteie **seleção + ano** de Copa,
escolha **1 jogador** por rodada e monte seus **11 titulares**. Depois simule a
campanha (grupos → mata-mata → final) e mire no lendário **7 a 0**.

> Implementação 100% própria — dados, código e identidade visual originais.

## Stack

- **React + TypeScript + Vite + Tailwind**
- Engine de jogo **pura e isolada da UI**, determinística por *seed*
- Dados em **JSON local** (`src/data/editions.json`), progresso em `localStorage`

## Rodando

```bash
npm install
npm run dev        # servidor de desenvolvimento (http://localhost:5173)
npm run build      # build de produção
npm run preview    # serve o build
npm test           # testes da engine (Vitest)
npm run typecheck  # checagem de tipos
```

## Estrutura

```
src/
├─ engine/      # núcleo puro: rng, atributos, formações, química, simulação…
├─ data/        # editions.json (seleções reais + Colégio Módulo)
├─ game/        # store React fino sobre a engine
├─ components/  # PlayerCard, FormationPitch, Dice, TeamSummary, ShareCard…
├─ screens/     # Home, GameSetup, Draft, Simulation, FinalResult
└─ lib/         # carregamento de dados, mensagens, share/serialização
```

## Como expandir os dados

Adicionar uma seleção = colar um objeto em `src/data/editions.json`. Cada jogador
precisa só de `positions` + `overall` + `desc`; os 7 atributos são derivados
automaticamente (seção 3b da especificação). Seleções reais têm teto de overall
99; o Colégio Módulo (`isBonus: true`) pode passar disso de propósito.

## Roadmap (pós-MVP)

Mais elencos, gerador de *filler*, multiplayer (sorteios alternados), ranking
global, compartilhar imagem, mais modos e admin de jogadores.
