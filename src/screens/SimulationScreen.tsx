import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { LiveMatch, SpeedSelector, useSimSpeed } from '../components/LiveMatch';
import { MatchCard } from '../components/MatchCard';
import { useGame } from '../game/useGameStore';
import { liveFromMatch } from '../lib/matchTimeline';

export function SimulationScreen() {
  const { campaign, runSimulation, goFinal, config } = useGame();
  const started = useRef(false);
  const [speed, setSpeed] = useSimSpeed();
  // How many matches have finished playing; the next one plays live.
  const [played, setPlayed] = useState(0);

  // Kick off the simulation once when entering the screen.
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      runSimulation();
    }
  }, [runSimulation]);

  if (!campaign) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="animate-pulse font-display text-3xl text-white/70">Sorteando o chaveamento…</p>
      </div>
    );
  }

  const matches = campaign.matches;
  const allRevealed = played >= matches.length;
  const live = !allRevealed ? matches[played] : null;

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
        {/* Already-played matches, as static recap cards. */}
        {matches.slice(0, played).map((m, i) => (
          <MatchCard key={i} match={m} teamName={config.teamName} />
        ))}

        {/* The match currently being broadcast. */}
        {live && (
          <LiveMatch
            key={live.stage}
            data={liveFromMatch(live, config.teamName, played)}
            speed={speed}
            onDone={() => setPlayed((p) => p + 1)}
          />
        )}
      </div>

      <div className="mt-6 flex justify-center">
        {allRevealed ? (
          <Button variant="gold" className="px-8 py-4 text-lg" onClick={goFinal}>
            🏆 Ver resultado final
          </Button>
        ) : (
          <button onClick={() => setPlayed(matches.length)} className="text-sm text-white/50 hover:text-white">
            pular animação →
          </button>
        )}
      </div>
    </div>
  );
}
