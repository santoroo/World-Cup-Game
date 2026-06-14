import { MultiplayerProvider, useMultiplayer } from '../../game/useMultiplayer';
import { MpJoin } from './MpJoin';
import { MpLobby } from './MpLobby';
import { MpDraft } from './MpDraft';
import { MpBracket } from './MpBracket';

function StatusBar() {
  const { status, error, clearError } = useMultiplayer();
  if (status === 'online' && !error) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-1 p-2">
      {status !== 'online' && (
        <div className="rounded-full bg-amber-500/90 px-4 py-1 text-sm font-semibold text-amber-950 shadow-lg">
          {status === 'connecting' ? 'Conectando ao servidor…' : 'Conexão perdida — reconectando…'}
        </div>
      )}
      {error && (
        <button
          onClick={clearError}
          className="rounded-full bg-rose-500/90 px-4 py-1 text-sm font-semibold text-white shadow-lg hover:bg-rose-500"
        >
          {error} ✕
        </button>
      )}
    </div>
  );
}

function Inner({ onExit }: { onExit: () => void }) {
  const { room, leave } = useMultiplayer();

  const exit = () => {
    leave();
    onExit();
  };

  return (
    <div className="min-h-[100dvh]">
      <StatusBar />
      {!room && <MpJoin onBack={onExit} />}
      {room?.phase === 'lobby' && <MpLobby onExit={exit} />}
      {room?.phase === 'draft' && <MpDraft onExit={exit} />}
      {room?.phase === 'bracket' && <MpBracket onExit={exit} />}
    </div>
  );
}

/** Entry point for the online mode. Owns the multiplayer connection lifecycle. */
export function MultiplayerScreen({ onExit }: { onExit: () => void }) {
  return (
    <MultiplayerProvider>
      <Inner onExit={onExit} />
    </MultiplayerProvider>
  );
}
