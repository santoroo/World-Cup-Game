import { useState } from 'react';
import { Button } from '../components/Button';
import { FormationPitch } from '../components/FormationPitch';
import { FORMATION_LIST, type Formation, type GameMode, type PlayStyle } from '../engine';
import { useGame, type SetupConfig } from '../game/useGameStore';

const MODES: { id: GameMode; label: string; desc: string }[] = [
  { id: 'classico', label: 'Clássico', desc: 'Notas e atributos das cartas à mostra.' },
  { id: 'almanaque', label: 'Almanaque', desc: 'Notas escondidas — escolha pelo nome, país e ano.' },
  { id: 'caos', label: 'Caos', desc: 'Sorteios mais difíceis e Colégio Módulo mais frequente.' },
];

const STYLES: { id: PlayStyle; label: string; desc: string }[] = [
  { id: 'defensivo', label: 'Defensivo', desc: '+ defesa, − ataque' },
  { id: 'equilibrado', label: 'Equilibrado', desc: 'sem ajustes' },
  { id: 'ofensivo', label: 'Ofensivo', desc: '+ ataque, − defesa' },
];

export function GameSetup() {
  const { goHome, startDraft, config } = useGame();
  const [teamName, setTeamName] = useState(config.teamName);
  const [formation, setFormation] = useState<Formation>(config.formation);
  const [mode, setMode] = useState<GameMode>(config.mode);
  const [style, setStyle] = useState<PlayStyle>(config.style);

  const submit = () => {
    const cfg: SetupConfig = {
      teamName: teamName.trim() || 'Seleção dos Sonhos',
      formation,
      mode,
      style,
    };
    startDraft(cfg);
  };

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <header className="mb-6 flex items-center justify-between">
        <button onClick={goHome} className="text-sm text-white/60 hover:text-white">← Voltar</button>
        <h1 className="font-display text-3xl text-white sm:text-4xl">Montar partida</h1>
        <span className="w-16" />
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section>
            <label className="mb-2 block text-sm font-semibold text-white/70">Nome do time</label>
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              maxLength={28}
              className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-lg text-white outline-none focus:border-gold-400"
              placeholder="Seleção dos Sonhos"
            />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-white/70">Formação</h2>
            <div className="flex flex-wrap gap-2">
              {FORMATION_LIST.map((f) => (
                <button
                  key={f}
                  onClick={() => setFormation(f)}
                  className={`rounded-xl border px-4 py-2 font-display text-xl transition ${
                    formation === f
                      ? 'border-gold-400 bg-gold-400/15 text-gold-300'
                      : 'border-white/15 bg-black/20 text-white/70 hover:border-white/40'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-white/70">Modo</h2>
            <div className="grid gap-2 sm:grid-cols-3">
              {MODES.map((m) => (
                <OptionCard key={m.id} active={mode === m.id} onClick={() => setMode(m.id)} title={m.label} desc={m.desc} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-white/70">Estilo de jogo</h2>
            <div className="grid gap-2 sm:grid-cols-3">
              {STYLES.map((s) => (
                <OptionCard key={s.id} active={style === s.id} onClick={() => setStyle(s.id)} title={s.label} desc={s.desc} />
              ))}
            </div>
          </section>

          <Button variant="gold" className="w-full py-4 text-lg" onClick={submit}>
            🎲 Começar sorteio
          </Button>
        </div>

        <aside className="hidden lg:block">
          <p className="mb-2 text-center text-sm text-white/60">Pré-visualização do {formation}</p>
          <FormationPitch formation={formation} placed={[]} highlightOpen />
        </aside>
      </div>
    </div>
  );
}

function OptionCard({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition ${
        active ? 'border-gold-400 bg-gold-400/10' : 'border-white/15 bg-black/20 hover:border-white/40'
      }`}
    >
      <div className="font-display text-lg text-white">{title}</div>
      <div className="text-xs text-white/55">{desc}</div>
    </button>
  );
}
