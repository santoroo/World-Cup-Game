# CLAUDE.md

Guidance for working in this repo. **Copa dos Sonhos** is a football "dream team"
draft game: roll a die to draw a real World-Cup squad, pick one player per round,
build your XI, then simulate a campaign (solo) or a live knockout (online).

`React 18` · `TypeScript` · `Vite` · `Tailwind` · `ws` (WebSocket) · pure,
seed-deterministic engine.

## Commands

```bash
npm run dev        # app + multiplayer server together (http://localhost:5173, /ws)
npm run build      # tsc -b && vite build (production client)
npm run preview    # serve the build
npm test           # Vitest: engine + multiplayer + real WebSocket server integration
npm run typecheck  # tsc -b (app) + tsc --noEmit -p tsconfig.server.json (server)
```

After any non-trivial change run **`npm run typecheck` and `npm test`** — the engine
is covered by determinism/balance tests that catch regressions. `npm run dev` may
fall back to port **5174+** if 5173 is taken.

## Architecture

The **engine is pure, has no React/DOM, and is deterministic by seed** — the same
logic runs on the client (solo) and the server (online), so there's no desync and
everything is unit-testable without a network.

```
src/
├─ engine/         # pure core (no React). Barrel: engine/index.ts
│  ├─ rng.ts          mulberry32; createRng(seed) → {next,int,range,chance,pick,weighted,shuffle}
│  ├─ types.ts        domain model (Player, Edition, MatchResult, RedCard, RoomState…)
│  ├─ attributes.ts   7 attrs derived from positions + overall (no 99 cap for bonus)
│  ├─ compatibility.ts position fit rules (evaluateFit)
│  ├─ chemistry.ts    computeTeamStrength(placed, formation)
│  ├─ draft.ts        roll/pick/place/move/swap, skip limit (MAX_FREE_SKIPS)
│  ├─ simulation.ts   xG + per-match "form" model; simulateMatch / simulatePvpMatch / simulateCampaign
│  └─ multiplayer.ts  room reducers: lobby → snake draft → knockout bracket
├─ data/editions.json ~28 real squads + the secret "Colégio Módulo" (isBonus)
├─ game/           # thin React stores over the engine
│  ├─ useGameStore.tsx   solo flow (phases: home→setup→draft→simulating→final)
│  ├─ useMultiplayer.tsx WebSocket client + reconnect; renders server RoomState
│  └─ mpProtocol.ts      ClientMsg/ServerMsg wire types (shared with the server)
├─ components/     PlayerCard, FormationPitch, TeamSummary, MatchCard, LiveMatch, Dice…
├─ screens/        Home, GameSetup, Draft, Simulation, FinalResult
│  └─ multiplayer/ MpJoin · MpLobby · MpDraft · MpBracket
└─ lib/            editions, messages, share (replay links), matchTimeline
server/
└─ gameServer.ts   authoritative WS server, thin over engine/multiplayer, on /ws
```

**Server is authoritative**: every online action goes through a pure engine reducer
and the whole `RoomState` is broadcast to the room (single source of truth). It
attaches to Vite's HTTP server on `/ws` only, leaving HMR alone — that single-origin
design is what lets one tunnel (`cloudflared`) expose the game to friends.

## Conventions

- **Determinism is sacred.** Anything affecting gameplay must be driven by
  `createRng(seed)`. Same seed ⇒ same result (share/replay links depend on it).
  When adding a *new* random element, seed a **separate** RNG stream
  (`createRng(\`${seed}#something\`)`) so you don't shift existing streams and break
  the determinism/balance tests. Red cards do exactly this (`#cards`).
- Engine stays pure (no React/DOM/imports from `game`/`components`). UI imports the
  engine via the `src/engine/index.ts` barrel.
- Replays (`lib/share.ts`) store only seed + config + picks + skips and **re-run the
  engine** to rebuild the campaign — never serialize derived results.
- Copy is Brazilian Portuguese; visual identity is original.

## Game modes (`GameMode`)

`classico` (stats shown) · `almanaque` (stats hidden) · `caos` (harder rolls, more
Módulo). **Almanaque** hides player descriptions, overalls/attributes, and the whole
"Força do time" panel behind `?` during setup/draft/simulation — everything is
**revealed only on the final results screen**. Implemented in `PlayerCard`
(`hideOverall` also hides desc) and `TeamSummary` (`hidden` prop). Online rooms carry
`mode` in `RoomState`; the host picks it in `MpJoin` (create) and it shows in the lobby.

## Match playback (live simulation)

Matches are decided instantly by the engine, then **played back as a live broadcast**
by `components/LiveMatch.tsx`: a clock ticks 0'→90' at a chosen tempo while goals and
red cards pop in at their minute and the score climbs. Speed = **Lento / Normal /
Rápido** (`lib/matchTimeline.ts`, persisted to localStorage via `useSimSpeed`).
- `liveFromMatch` (PvE) and `liveFromBracket` (PvP) normalize a result into a
  minute-sorted event stream.
- `SimulationScreen` (solo) and `MpBracket` (online) play ties **one at a time**;
  finished ones become static `MatchCard`/`MatchRow`s; byes auto-advance; there's a
  "pular animação" skip.
- **Red cards are cosmetic only** (never change the scoreline) and live on the
  `#cards` RNG stream so balance/determinism are untouched.

## Gotchas

- `npm run dev` runs the multiplayer server inside Vite; there's no separate process.
- The engine has **no upper cap** on bonus ("Colégio Módulo") ratings — intentional.
- Don't add gameplay randomness with `Math.random()` (breaks determinism); it's fine
  only for purely cosmetic UI (e.g. the dice face spin in `DraftScreen`).
```
