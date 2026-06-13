import { useEffect } from 'react';
import { GameProvider, useGame } from './game/useGameStore';
import { EDITIONS } from './lib/editions';
import { clearShareUrl, decodeResult, readShareFromUrl } from './lib/share';
import { HomePage } from './screens/HomePage';
import { GameSetup } from './screens/GameSetup';
import { DraftScreen } from './screens/DraftScreen';
import { SimulationScreen } from './screens/SimulationScreen';
import { FinalResult } from './screens/FinalResult';

function Router() {
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
      return <HomePage />;
    case 'setup':
      return <GameSetup />;
    case 'draft':
      return <DraftScreen />;
    case 'simulating':
      return <SimulationScreen />;
    case 'final':
      return <FinalResult />;
    default:
      return <HomePage />;
  }
}

export default function App() {
  return (
    <GameProvider>
      <Router />
    </GameProvider>
  );
}
