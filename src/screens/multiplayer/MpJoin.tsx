import { useState } from 'react';
import { Button } from '../../components/Button';
import { useMultiplayer } from '../../game/useMultiplayer';

export function MpJoin({ onBack }: { onBack: () => void }) {
  const { create, join, status } = useMultiplayer();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');

  const cleanName = name.trim();
  const ready = status === 'online' && cleanName.length > 0 && (mode === 'create' || code.trim().length >= 4);

  const submit = () => {
    if (!ready) return;
    if (mode === 'create') create(cleanName);
    else join(code, cleanName);
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-5 py-10">
      <button onClick={onBack} className="mb-6 self-start text-sm text-white/60 hover:text-white">
        ← Voltar
      </button>

      <div className="mb-2 text-center text-5xl">🌐⚽</div>
      <h1 className="text-center font-display text-5xl leading-none text-white">
        Jogar <span className="text-gold-400">Online</span>
      </h1>
      <p className="mt-3 text-center text-white/70">
        Crie uma sala e mande o código pros amigos (até 5 jogadores). Vocês montam os times ao mesmo tempo,
        cada craque escolhido some pros outros, e os times se enfrentam até a final.
      </p>

      <div className="mt-8 space-y-4 rounded-2xl border border-white/10 bg-black/30 p-5">
        <div>
          <label className="mb-1 block text-sm font-semibold text-white/70">Seu apelido</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={16}
            placeholder="Ex.: Murilo"
            className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-lg text-white outline-none focus:border-gold-400"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <TabButton active={mode === 'create'} onClick={() => setMode('create')}>
            Criar sala
          </TabButton>
          <TabButton active={mode === 'join'} onClick={() => setMode('join')}>
            Entrar com código
          </TabButton>
        </div>

        {mode === 'join' && (
          <div>
            <label className="mb-1 block text-sm font-semibold text-white/70">Código da sala</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={4}
              placeholder="ABCD"
              className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-center font-display text-3xl tracking-[0.4em] text-white outline-none focus:border-gold-400"
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
        )}

        <Button variant="gold" className="w-full py-4 text-lg" onClick={submit} disabled={!ready}>
          {mode === 'create' ? '➕ Criar sala' : '🚪 Entrar na sala'}
        </Button>
        {status !== 'online' && (
          <p className="text-center text-xs text-amber-300">Aguardando conexão com o servidor…</p>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
        active ? 'border-gold-400 bg-gold-400/15 text-gold-300' : 'border-white/15 bg-black/20 text-white/70 hover:border-white/40'
      }`}
    >
      {children}
    </button>
  );
}
