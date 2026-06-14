import { useEffect, useState } from 'react';
import { GameProvider, useGame } from './game/useGameStore';
import { EDITIONS } from './lib/editions';
import { clearShareUrl, decodeResult, readShareFromUrl } from './lib/share';
import { HomePage } from './screens/HomePage';
import { GameSetup } from './screens/GameSetup';
import { DraftScreen } from './screens/DraftScreen';
import { SimulationScreen } from './screens/SimulationScreen';
import { FinalResult } from './screens/FinalResult';
import { MultiplayerScreen } from './screens/multiplayer/MultiplayerScreen';

function Router({ onPlayOnline }: { onPlayOnline: () => void }) {
  const { phase, loadSharedResult } = useGame();

  // Open a shared result if the URL carries one.
  useEffect(() => {
    const code = readShareFromUrl();
    if (!code) return;
    const rebuilt = decodeResult(code, EDITIONS);
    if (rebuilt) loadSharedResult(rebuilt);
    clearShareUrl();
  }, [loadSharedResult]);

  switch (phase) {
    case 'home':
      return <HomePage onPlayOnline={onPlayOnline} />;
    case 'setup':
      return <GameSetup />;
    case 'draft':
      return <DraftScreen />;
    case 'simulating':
      return <SimulationScreen />;
    case 'final':
      return <FinalResult />;
    default:
      return <HomePage onPlayOnline={onPlayOnline} />;
  }
}

export default function App() {
  const [online, setOnline] = useState(false);

  if (online) return <MultiplayerScreen onExit={() => setOnline(false)} />;

  return (
    <GameProvider>
      <Router onPlayOnline={() => setOnline(true)} />
    </GameProvider>
  );
}
