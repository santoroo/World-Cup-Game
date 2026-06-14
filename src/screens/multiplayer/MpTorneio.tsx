import { useState } from 'react';
import { useMultiplayer } from '../../game/useMultiplayer';
import { MpBracket } from './MpBracket';
import { MpGrupos } from './MpGrupos';

/**
 * Pós-draft: sequencia a fase de grupos e depois o mata-mata (etapa local). A
 * sincronia que importa — os pênaltis humano×humano — é resolvida pelo gate
 * `prontoPenalti` do servidor, então cada um pode assistir os grupos no seu ritmo.
 */
export function MpTorneio({ onExit }: { onExit: () => void }) {
  const { room } = useMultiplayer();
  const [etapa, setEtapa] = useState<'grupos' | 'mata-mata'>('grupos');
  if (!room) return null;
  if (!room.grupos || etapa === 'mata-mata') return <MpBracket onExit={onExit} />;
  return <MpGrupos onConcluido={() => setEtapa('mata-mata')} />;
}
