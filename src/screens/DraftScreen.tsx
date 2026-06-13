import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { Dice } from '../components/Dice';
import { FormationPitch } from '../components/FormationPitch';
import { PlayerCard } from '../components/PlayerCard';
import { TeamSummary } from '../components/TeamSummary';
import {
  bestSlotFor,
  computeTeamStrength,
  evaluateFit,
  FORMATIONS,
  freeSkipsLeft,
  isComplete,
  openSlots,
  pickablePlayers,
  progress,
  type Player,
} from '../engine';
import { useGame } from '../game/useGameStore';
import { positionLabel } from '../lib/messages';

export function DraftScreen() {
  const { draft, config, rolledEdition, rollDice, confirmPlayer, skipRoll, finishDraft, goHome } = useGame();
  const [rolling, setRolling] = useState(false);
  const [diceVal, setDiceVal] = useState(6);
  const [selected, setSelected] = useState<Player | null>(null);

  const { filled, total } = progress(draft);
  const complete = isComplete(draft);
  const hideOverall = config.mode === 'almanaque';

  const partialStrength = useMemo(
    () => computeTeamStrength(draft.placed, config.formation),
    [draft.placed, config.formation],
  );

  const options = useMemo(
    () => (rolledEdition ? pickablePlayers(draft, rolledEdition) : []),
    [rolledEdition, draft],
  );

  const open = openSlots(draft);
  const openSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of open) counts.set(s.position, (counts.get(s.position) ?? 0) + 1);
    return [...counts.entries()];
  }, [open]);

  const handleRoll = () => {
    if (rolling || complete) return;
    setSelected(null);
    setRolling(true);
    window.setTimeout(() => {
      rollDice();
      setDiceVal(1 + Math.floor(Math.random() * 6));
      setRolling(false);
    }, 750);
  };

  const handleConfirm = () => {
    if (!selected) return;
    confirmPlayer(selected);
    setSelected(null);
  };

  const fitFor = (player: Player) => {
    const slot = bestSlotFor(draft, player);
    if (!slot) return { label: 'Sem vaga', perfect: false };
    const fit = evaluateFit(player, slot.position);
    const slotDef = FORMATIONS[config.formation].find((s) => s.id === slot.id)!;
    if (!fit.outOfPosition) return { label: `Encaixa em ${slotDef.label} ✓`, perfect: true };
    return { label: `Joga em ${slotDef.label} (fora de posição)`, perfect: false };
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-4 flex items-center justify-between">
        <button onClick={goHome} className="text-sm text-white/60 hover:text-white">← Sair</button>
        <div className="text-center">
          <h1 className="font-display text-3xl leading-none text-white sm:text-4xl">{config.teamName}</h1>
          <p className="text-xs text-white/50">Formação {config.formation} · modo {config.mode}</p>
        </div>
        <div className="text-right">
          <div className="font-display text-3xl leading-none text-gold-400">{filled}/{total}</div>
          <p className="text-xs text-white/50">titulares</p>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        {/* Pitch + team strength */}
        <div className="space-y-4">
          <FormationPitch formation={config.formation} placed={draft.placed} highlightOpen />
          <TeamSummary strength={partialStrength} compact={!complete} />
        </div>

        {/* Draft action area */}
        <div className="space-y-4">
          {!complete && (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <Dice value={diceVal} rolling={rolling} />
                  <div>
                    <p className="font-display text-2xl text-white">
                      {rolling ? 'Rolando…' : rolledEdition ? 'Escolha sua carta' : 'Role o dado!'}
                    </p>
                    <p className="text-sm text-white/55">
                      {rolledEdition && !rolling
                        ? `${rolledEdition.flag} ${rolledEdition.country} ${rolledEdition.year}`
                        : 'A sorte decide qual elenco vem.'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="gold" onClick={handleRoll} disabled={rolling || (!!rolledEdition && !rolling)}>
                    🎲 Rolar dado
                  </Button>
                  {rolledEdition && !rolling && (
                    <Button variant="ghost" onClick={() => { skipRoll(); setSelected(null); }}>
                      Pular ({freeSkipsLeft(draft)})
                    </Button>
                  )}
                </div>
              </div>

              {/* Open slots hint */}
              <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-white/40">Faltam:</span>
                {openSummary.map(([pos, n]) => (
                  <span key={pos} className="rounded-md bg-white/10 px-2 py-0.5 text-white/70">
                    {n}× {positionLabel(pos)}
                  </span>
                ))}
              </div>

              {/* Roll result: pickable players */}
              {rolledEdition && !rolling && (
                <div className="mt-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {options.map((p) => (
                      <PlayerCard
                        key={p.id}
                        player={p}
                        hideOverall={hideOverall}
                        selected={selected?.id === p.id}
                        onClick={() => setSelected(p)}
                        fit={fitFor(p)}
                      />
                    ))}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button onClick={handleConfirm} disabled={!selected}>
                      Confirmar escolha →
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {complete && (
            <div className="animate-pop rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-6 text-center">
              <p className="font-display text-3xl text-white">Time completo! 🎉</p>
              <p className="mt-1 text-white/70">Overall {partialStrength.overall} · química {partialStrength.chemistry}. Hora de encarar a Copa.</p>
              <Button variant="gold" className="mt-4 px-8 py-4 text-lg" onClick={finishDraft}>
                ⚽ Simular campanha
              </Button>
            </div>
          )}

          {/* Already chosen list */}
          {draft.placed.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <h3 className="mb-2 text-sm font-semibold text-white/60">Escalados</h3>
              <div className="flex flex-wrap gap-2">
                {draft.placed.map((pp) => (
                  <span
                    key={pp.slotId}
                    className={`rounded-lg px-2 py-1 text-xs ${pp.outOfPosition ? 'bg-amber-500/20 text-amber-200' : 'bg-white/10 text-white/80'}`}
                    title={pp.outOfPosition ? 'Fora de posição' : undefined}
                  >
                    {pp.player.flag} {pp.player.name} · {pp.player.overall}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
