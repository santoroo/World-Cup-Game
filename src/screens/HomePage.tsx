import { useState } from 'react';
import { Button } from '../components/Button';
import { useGame } from '../game/useGameStore';

export function HomePage({ onPlayOnline }: { onPlayOnline: () => void }) {
  const { goToSetup } = useGame();
  const [showHow, setShowHow] = useState(false);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col items-center justify-center px-5 py-10 text-center">
      <div className="mb-3 animate-pop text-6xl">⚽🏆</div>
      <h1 className="font-display text-6xl leading-none text-white sm:text-8xl">
        Copa dos <span className="text-gold-400">Sonhos</span>
      </h1>
      <p className="mt-4 max-w-md text-lg text-white/70">
        Role o dado, sorteie seleções históricas, escolha craque por craque e monte o time perfeito.
        O troféu máximo? O lendário <span className="font-bold text-gold-400">7 a 0</span>.
      </p>

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Button variant="gold" className="px-8 py-4 text-lg" onClick={goToSetup}>
          ⚽ Jogar agora
        </Button>
        <Button variant="primary" className="px-8 py-4 text-lg" onClick={onPlayOnline}>
          🌐 Jogar online
        </Button>
        <Button variant="secondary" onClick={() => setShowHow((v) => !v)}>
          Como funciona
        </Button>
      </div>
      <p className="mt-2 text-xs text-white/40">
        Online: até 5 amigos, draft alternado e mata-mata até a final.
      </p>

      {showHow && (
        <div className="mt-6 w-full animate-card-in rounded-2xl border border-white/10 bg-black/30 p-5 text-left text-sm text-white/80">
          <h2 className="mb-2 font-display text-2xl text-white">Como funciona</h2>
          <ol className="list-inside list-decimal space-y-1.5">
            <li>Escolha formação, modo e estilo de jogo.</li>
            <li>Role o dado: ele sorteia uma <b>seleção + ano</b> de Copa (ou o misterioso Colégio Módulo).</li>
            <li>Escolha <b>1 jogador</b> daquele elenco. O craque entra na melhor vaga livre.</li>
            <li>Repita até preencher os <b>11 titulares</b>.</li>
            <li>Simule a campanha: grupos, mata-mata e a grande final.</li>
            <li>Quanto mais goleada, química e título, maior a sua nota. Mire no 7 a 0!</li>
          </ol>
          <p className="mt-3 text-white/55">
            A sorte faz parte: pode vir um elencão ou um time pra esquecer. Conhecimento de futebol ajuda — e muito.
          </p>
        </div>
      )}

      <p className="mt-10 text-xs text-white/30">Feito com bola, sorte e estratégia. Dados e código 100% próprios.</p>
    </div>
  );
}
