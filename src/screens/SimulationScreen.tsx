import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { MatchCard } from '../components/MatchCard';
import { useGame } from '../game/useGameStore';

export function SimulationScreen() {
  const { campaign, runSimulation, goFinal, config } = useGame();
  const started = useRef(false);
  const [revealed, setRevealed] = useState(0);

  // Kick off the simulation once when entering the screen.
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      runSimulation();
    }
  }, [runSimulation]);

  // Reveal matches one by one. Stops at the point of elimination.
  useEffect(() => {
    if (!campaign) return;
    if (revealed >= campaign.matches.length) return;
    const id = window.setTimeout(() => setRevealed((r) => r + 1), 850);
    return () => clearTimeout(id);
  }, [campaign, revealed]);

  if (!campaign) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="animate-pulse font-display text-3xl text-white/70">Sorteando o chaveamento…</p>
      </div>
    );
  }

  const allRevealed = revealed >= campaign.matches.length;
  const shown = campaign.matches.slice(0, revealed);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 text-center">
        <h1 className="font-display text-4xl text-white">Campanha em andamento</h1>
        <p className="text-white/55">Agora o bicho pegou. Vamos ver até onde {config.teamName} chega.</p>
      </header>

      <div className="space-y-3">
        {shown.map((m, i) => (
          <MatchCard key={i} match={m} teamName={config.teamName} />
        ))}
      </div>

      <div className="mt-6 flex justify-center">
        {allRevealed ? (
          <Button variant="gold" className="px-8 py-4 text-lg" onClick={goFinal}>
            🏆 Ver resultado final
          </Button>
        ) : (
          <button onClick={() => setRevealed(campaign.matches.length)} className="text-sm text-white/50 hover:text-white">
            pular animação →
          </button>
        )}
      </div>
    </div>
  );
}
