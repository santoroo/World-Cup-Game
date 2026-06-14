<div align="center">

# Copa dos Sonhos ⚽🏆

**Monte a seleção dos sonhos no dado e na estratégia — sozinho ou com até 5 amigos online.**

Role o dado, sorteie **seleção + ano** de Copa, escolha **1 craque** por rodada,
monte seus **11 titulares** e encare a campanha. O troféu máximo? O lendário **7 a 0**.

`React` · `TypeScript` · `Vite` · `Tailwind` · `WebSocket` · engine pura e determinística

</div>

---

## ✨ Destaques

- 🎲 **Sorte + conhecimento de futebol + estratégia** — você não escolhe craques à vontade: o dado sorteia o elenco, você escolhe quem entra.
- 🌍 **~28 elencos icônicos** de Copas reais (Brasil 70/82/94/2002, Argentina 86/2022, Alemanha 2014, França 98/2018…) + o secreto **Colégio Módulo**.
- 🧪 **Engine pura e determinística por _seed_**, isolada da UI e coberta por testes — mesmo resultado para o mesmo jogo (links de replay reproduzíveis).
- ⚖️ **Matchmaking justo**: o melhor time é favorito, **nunca garantido** — viradas acontecem.
- 🌐 **Multiplayer online** (2 a 5 jogadores), pela internet, sem LAN: draft alternado ao vivo e mata-mata até a final.
- 🥅 **Pênaltis interativos no online:** empate no mata-mata vira disputa onde **você escolhe o canto** (e, no gol, pra onde pular), com timer de 10s e animação. No solo, a disputa é animada automaticamente.
- 📱 **Responsivo** desktop + celular, com cara de transmissão de futebol.

---

## 🎮 Como jogar (solo)

1. **Formação, modo e estilo** — escolha entre `4-3-3`, `4-4-2`, `3-5-2`, `4-2-3-1`, `3-4-3`.
2. **Role o dado** — ele sorteia uma **seleção + ano** (ou o misterioso Colégio Módulo, com peso menor).
3. **Escolha 1 jogador** daquele elenco. Ele entra na melhor vaga livre — e você reposiciona como quiser.
4. **Repita até os 11 titulares.** Acompanhe overall, química e pontos fortes/fracos em tempo real.
5. **Simule a campanha** — grupos → oitavas → quartas → semi → final — e mire no 7 a 0.

> **Modos:** Clássico (notas à mostra) · Almanaque (notas escondidas) · Caos (sorteios difíceis, Módulo mais frequente).

---

## 🌐 Jogar online com os amigos (sem LAN, pela internet)

O servidor multiplayer sobe **junto** com `npm run dev`, na mesma porta/origem do app
(rota `/ws`). Para os amigos entrarem de qualquer lugar, exponha o endereço local
com um **túnel grátis** — o [Cloudflare `cloudflared`](https://github.com/cloudflare/cloudflared)
é o mais simples e não pede cadastro:

```bash
# 1) na sua máquina, com o jogo rodando:
npm run dev

# 2) em outro terminal, suba o túnel apontando pro app:
cloudflared tunnel --url http://localhost:5173
# (instale antes:  winget install --id Cloudflare.cloudflared )
```

O `cloudflared` imprime uma URL pública (tipo `https://algo.trycloudflare.com`).
**Mande esse link pros amigos.** Cada um abre no navegador e clica em **Jogar online**:

1. **Você** → **Criar sala** → recebe um **código de 4 letras**.
2. **Amigos** → **Entrar com código** → digitam o código.
3. Todos escolhem **formação + estilo** e marcam **Pronto**; o anfitrião 👑 começa.
4. **Draft alternado (snake):** na sua vez você rola o dado, escolhe 1 jogador **e a vaga** onde ele entra — e pode reposicionar/trocar os escalados (igual ao solo).
   **Quem é escolhido some pra todo mundo** — e os times de todos aparecem ao vivo.
5. Com os 11 de cada um prontos, rola o **mata-mata** (com _byes_ pros melhores) até a final.
   **Empatou? Vai pros pênaltis interativos:** a cada cobrança, cobrador e goleiro escolhem o canto (10s, ou sorteia) e a bola/defesa são animadas. 🏆

| 💡 | |
|---|---|
| **Hospedagem** | Seu PC fica de host: precisa ficar ligado durante a partida. |
| **Caiu a conexão?** | Recarregar a página **reentra na mesma vaga** automaticamente (token de sessão). |
| **Alguém saiu?** | O draft não trava: o servidor **auto-escala** por quem desconectou. |
| **Link fixo?** | O mesmo `server/gameServer.ts` serve pra um deploy num host com WebSocket — é só apontar um `http.Server` para `attachGameServer`. |

---

## 🧠 Como funciona por baixo

- **Atributos derivados:** cada jogador é só `positions` + `overall`; os 7 atributos (ataque, meio, defesa, goleiro, técnica, físico, decisão) são derivados pela posição. Sem teto para o Colégio Módulo (overall pode passar de 99 de propósito).
- **Compatibilidade de posição:** encaixes sensatos têm penalidade pequena/média (ponta↔centroavante, volante↔meia, zagueiro↔lateral); o resto é proibido. Jogador de linha no gol e goleiro na linha: bloqueados (salvo o coringa `ALL`).
- **Química:** sobe com mesmo país, mesma década, todos na posição e formação coerente; cai com gente fora de posição.
- **Matchmaking (sorte × estratégia):** modelo de _expected goals_ com um fator de **forma/sorte por jogo**. Times parelhos viram cara-ou-coroa; um azarão inspirado bate um favorito de vez em quando; uma vantagem enorme ainda pode escorregar num dia ruim. Tudo determinístico por _seed_.
- **Pênaltis no mata-mata:** empate vai pra disputa (melhor de 5 + morte súbita). No **online** é **interativa** — cobrador e goleiro escolhem o canto (esquerda/meio/direita) num timer de 10s; acertou o mesmo canto, defesa; canto diferente, quase sempre gol. No **solo**, é animada automaticamente (determinística por _seed_, levemente puxada pelo overall). As escolhas humanas são a única entrada fora do _seed_ — e só no online, que não tem replay por _seed_.

---

## 🏗️ Arquitetura e estrutura

A engine é **pura, sem React/DOM e determinística por seed** — a mesma lógica roda
no cliente (solo) e no servidor (online), o que mantém tudo testável e sem desync.

```
src/
├─ engine/         # núcleo puro: rng, atributos, formações, compatibilidade,
│                  #   química, simulação (PvE + PvP) e multiplayer (sala/draft/chaveamento)
├─ data/           # editions.json (seleções reais + Colégio Módulo)
├─ game/           # stores React finos: solo (useGameStore), online (useMultiplayer) + protocolo WS
├─ components/     # PlayerCard, FormationPitch, Dice, TeamSummary, ShareCard…
├─ screens/        # Home, GameSetup, Draft, Simulation, FinalResult
│  └─ multiplayer/ #   Join · Lobby · Draft (ao vivo) · Bracket
└─ lib/            # carregamento de dados, mensagens, share/serialização
server/
└─ gameServer.ts   # servidor WebSocket autoritativo, fino sobre a engine, acoplado ao Vite em /ws
```

O servidor é **autoritativo**: cada ação passa por um _reducer_ puro da engine e o
`RoomState` inteiro é transmitido para a sala — uma fonte única da verdade para
todos os jogadores.

---

## 🛠️ Rodando localmente

```bash
npm install
npm run dev        # app + servidor multiplayer juntos (http://localhost:5173, /ws)
npm run build      # build de produção (cliente)
npm run preview    # serve o build
npm test           # testes (engine + multiplayer + integração do servidor) — Vitest
npm run typecheck  # checagem de tipos (app + servidor)
```

## ✅ Testes

Cobertura via **Vitest**, incluindo:

- **Engine:** RNG determinístico, derivação de atributos, compatibilidade, draft, química e simulação.
- **Matchmaking:** times parelhos = moeda; favorito tem mais chance, mas leva virada; favoritão ainda escorrega.
- **Multiplayer (pura):** draft em snake de 2 a 5 jogadores, unicidade global, limites de pulo, chaveamento com _byes_ e determinismo.
- **Servidor (integração real por WebSocket):** partidas completas de 2/3/5 jogadores, reconexão no meio do draft e rejeição de entradas inválidas.

```bash
npm test
```

---

## 📦 Como expandir os dados

Adicionar uma seleção = colar um objeto em `src/data/editions.json`. Cada jogador
precisa só de `positions` + `overall` + `desc`; os 7 atributos são derivados
automaticamente. Seleções reais têm teto de overall **99**; o Colégio Módulo
(`isBonus: true`) pode passar disso de propósito.

## 🗺️ Roadmap

Multiplayer alternado já está **pronto** (até 5 jogadores + mata-mata). A seguir:
mais elencos, gerador de _filler_, ranking global, compartilhar imagem, mais
modos, deploy do servidor pra link fixo e admin de jogadores.

---

<div align="center">
<sub>Implementação 100% própria — dados, código e identidade visual originais. Feito com bola, sorte e estratégia. ⚽</sub>
</div>
