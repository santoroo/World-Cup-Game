import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { Dice } from '../components/Dice';
import { FormationPitch } from '../components/FormationPitch';
import { PlayerCard } from '../components/PlayerCard';
import { TeamSummary } from '../components/TeamSummary';
import {
  computeTeamStrength,
  draftOptions,
  eligibleOpenSlots,
  evaluateFit,
  FORMATIONS,
  freeSkipsLeft,
  isComplete,
  openSlots,
  progress,
  type DraftState,
  type PlacedPlayer,
  type Player,
  type Slot,
} from '../engine';
import { useGame } from '../game/useGameStore';
import { positionLabel } from '../lib/messages';

export function DraftScreen() {
  const {
    draft,
    config,
    rolledEdition,
    rollDice,
    confirmPlayerInSlot,
    repositionPlayer,
    swapPlacedPlayers,
    skipRoll,
    finishDraft,
    goHome,
  } = useGame();

  const [rolling, setRolling] = useState(false);
  const [diceVal, setDiceVal] = useState(6);
  const [pendingPlayer, setPendingPlayer] = useState<Player | null>(null);
  const [movingSlotId, setMovingSlotId] = useState<string | null>(null);

  const slots = FORMATIONS[config.formation];
  const { filled, total } = progress(draft);
  const complete = isComplete(draft);
  const hideOverall = config.mode === 'almanaque';
  const skipsLeft = freeSkipsLeft(draft);

  const partialStrength = useMemo(
    () => computeTeamStrength(draft.placed, config.formation),
    [draft.placed, config.formation],
  );

  const options = useMemo(
    () => (rolledEdition ? draftOptions(draft, rolledEdition) : []),
    [rolledEdition, draft],
  );

  const open = openSlots(draft);
  const openSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of open) counts.set(s.position, (counts.get(s.position) ?? 0) + 1);
    return [...counts.entries()];
  }, [open]);

  // Slots the pending player can be dropped into (sorted: perfect fit first).
  const pendingSlots = useMemo(() => {
    if (!pendingPlayer) return [] as { slot: Slot; perfect: boolean }[];
    return eligibleOpenSlots(draft, pendingPlayer)
      .map((slot) => ({ slot, perfect: !evaluateFit(pendingPlayer, slot.position).outOfPosition }))
      .sort((a, b) => Number(b.perfect) - Number(a.perfect));
  }, [pendingPlayer, draft]);

  // Valid destinations when moving a placed player: empty slots it fits + swap-compatible occupied slots.
  const moveTargets = useMemo(() => {
    if (!movingSlotId) return [] as string[];
    const moving = draft.placed.find((p) => p.slotId === movingSlotId);
    const movingSlot = slots.find((s) => s.id === movingSlotId);
    if (!moving || !movingSlot) return [];
    return slots
      .filter((s) => {
        if (s.id === movingSlotId) return false;
        const occupant = draft.placed.find((p) => p.slotId === s.id);
        if (!occupant) return evaluateFit(moving.player, s.position).allowed;
        return (
          evaluateFit(moving.player, s.position).allowed &&
          evaluateFit(occupant.player, movingSlot.position).allowed
        );
      })
      .map((s) => s.id);
  }, [movingSlotId, draft.placed, slots]);

  const eligibleSlotIds = pendingPlayer ? pendingSlots.map((p) => p.slot.id) : moveTargets;

  const handleRoll = () => {
    if (rolling || complete) return;
    setPendingPlayer(null);
    setMovingSlotId(null);
    setRolling(true);
    window.setTimeout(() => {
      rollDice();
      setDiceVal(1 + Math.floor(Math.random() * 6));
      setRolling(false);
    }, 750);
  };

  const handleSkip = () => {
    if (skipsLeft <= 0) return;
    skipRoll();
    setPendingPlayer(null);
  };

  const placePending = (slot: Slot) => {
    if (!pendingPlayer) return;
    confirmPlayerInSlot(pendingPlayer, slot);
    setPendingPlayer(null);
  };

  const handleSlotClick = (slotId: string) => {
    const slot = slots.find((s) => s.id === slotId)!;
    const occupant = draft.placed.find((p) => p.slotId === slotId);

    // Placing a freshly drafted player.
    if (pendingPlayer) {
      if (!occupant && evaluateFit(pendingPlayer, slot.position).allowed) placePending(slot);
      return;
    }

    // Repositioning an existing player.
    if (movingSlotId) {
      if (movingSlotId === slotId) {
        setMovingSlotId(null);
        return;
      }
      if (!moveTargets.includes(slotId)) return;
      if (occupant) swapPlacedPlayers(movingSlotId, slotId);
      else repositionPlayer(movingSlotId, slotId);
      setMovingSlotId(null);
      return;
    }

    // Nothing pending: start moving the player in this slot.
    if (occupant) setMovingSlotId(slotId);
  };

  const movingPlayer = movingSlotId ? draft.placed.find((p) => p.slotId === movingSlotId) : null;

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
        <div className="space-y-3">
          <FormationPitch
            formation={config.formation}
            placed={draft.placed}
            highlightOpen={!pendingPlayer && !movingSlotId}
            eligibleSlotIds={eligibleSlotIds}
            selectedSlotId={movingSlotId}
            onSlotClick={handleSlotClick}
          />
          <PitchHint
            pendingPlayer={pendingPlayer}
            movingPlayer={movingPlayer ?? null}
            hasPlaced={draft.placed.length > 0}
            onCancelMove={() => setMovingSlotId(null)}
          />
          <TeamSummary strength={partialStrength} compact={!complete} hidden={hideOverall} />
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
                      {rolling
                        ? 'Rolando…'
                        : pendingPlayer
                          ? 'Escolha a posição'
                          : rolledEdition
                            ? 'Escolha sua carta'
                            : 'Role o dado!'}
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
                    <Button
                      variant="ghost"
                      onClick={handleSkip}
                      disabled={skipsLeft <= 0}
                      title={skipsLeft <= 0 ? 'Você já usou seus 3 pulos' : undefined}
                    >
                      {skipsLeft > 0 ? `Pular (${skipsLeft})` : 'Sem pulos'}
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

              {/* Position chooser for the picked player */}
              {pendingPlayer && (
                <div className="mt-4 animate-card-in rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3">
                  <p className="mb-2 text-sm text-white/80">
                    Onde <b>{pendingPlayer.name}</b> joga? Toque numa vaga abaixo ou no campo.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {pendingSlots.map(({ slot, perfect }) => (
                      <button
                        key={slot.id}
                        onClick={() => placePending(slot)}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition hover:-translate-y-0.5 ${
                          perfect
                            ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100'
                            : 'border-amber-400/50 bg-amber-500/15 text-amber-100'
                        }`}
                      >
                        {positionLabel(slot.position)} <span className="opacity-60">({slot.label})</span>
                        {perfect ? ' ✓' : ' ⚠'}
                      </button>
                    ))}
                    <button
                      onClick={() => setPendingPlayer(null)}
                      className="rounded-lg px-3 py-2 text-sm text-white/60 hover:text-white"
                    >
                      cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Roll result: pickable players */}
              {rolledEdition && !rolling && (
                <div className="mt-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {options.map(({ player, disponivel, motivo }) => (
                      <PlayerCard
                        key={player.id}
                        player={player}
                        hideOverall={hideOverall}
                        selected={pendingPlayer?.id === player.id}
                        onClick={
                          disponivel
                            ? () => {
                                setMovingSlotId(null);
                                setPendingPlayer(player);
                              }
                            : undefined
                        }
                        indisponivel={!disponivel}
                        motivoIndisponivel={motivo === 'usado' ? 'Já escolhido' : 'Sem vaga'}
                        fit={disponivel ? fitHint(player, draft) : undefined}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {complete && (
            <div className="animate-pop rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-6 text-center">
              <p className="font-display text-3xl text-white">Time completo! 🎉</p>
              <p className="mt-1 text-white/70">
                {hideOverall
                  ? 'Overall ? · química ? (modo Almanaque). Ajeite as posições se quiser e encare a Copa.'
                  : `Overall ${partialStrength.overall} · química ${partialStrength.chemistry}. Ajeite as posições se quiser e encare a Copa.`}
              </p>
              <Button variant="gold" className="mt-4 px-8 py-4 text-lg" onClick={finishDraft}>
                ⚽ Simular campanha
              </Button>
            </div>
          )}

          {/* Already chosen list — tap to reposition */}
          {draft.placed.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <h3 className="mb-2 text-sm font-semibold text-white/60">
                Escalados <span className="font-normal text-white/35">· toque para trocar de posição</span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {draft.placed.map((pp) => (
                  <button
                    key={pp.slotId}
                    onClick={() => {
                      setPendingPlayer(null);
                      setMovingSlotId((cur) => (cur === pp.slotId ? null : pp.slotId));
                    }}
                    className={`rounded-lg px-2 py-1 text-xs transition ${
                      movingSlotId === pp.slotId
                        ? 'bg-gold-400 text-pitch-900'
                        : pp.outOfPosition
                          ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                          : 'bg-white/10 text-white/80 hover:bg-white/20'
                    }`}
                    title={slotLabel(pp, slots)}
                  >
                    {pp.player.flag} {pp.player.name} · {slotLabel(pp, slots)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PitchHint({
  pendingPlayer,
  movingPlayer,
  hasPlaced,
  onCancelMove,
}: {
  pendingPlayer: Player | null;
  movingPlayer: PlacedPlayer | null;
  hasPlaced: boolean;
  onCancelMove: () => void;
}) {
  if (pendingPlayer) {
    return (
      <p className="text-center text-xs text-emerald-300">
        Toque numa vaga destacada para escalar <b>{pendingPlayer.name}</b>.
      </p>
    );
  }
  if (movingPlayer) {
    return (
      <p className="text-center text-xs text-gold-300">
        Movendo <b>{movingPlayer.player.name}</b> — toque num destino destacado (ou{' '}
        <button onClick={onCancelMove} className="underline">cancele</button>).
      </p>
    );
  }
  if (hasPlaced) {
    return <p className="text-center text-xs text-white/40">Toque num jogador no campo para trocá-lo de posição.</p>;
  }
  return null;
}

function slotLabel(pp: PlacedPlayer, slots: Slot[]): string {
  const slot = slots.find((s) => s.id === pp.slotId);
  return slot ? slot.label : pp.slotId;
}

/** Fit hint for a draft option, based on its best available slot. */
function fitHint(player: Player, draft: DraftState) {
  const eligible = eligibleOpenSlots(draft, player);
  const perfect = eligible.some((s) => !evaluateFit(player, s.position).outOfPosition);
  if (perfect) return { label: 'Encaixa na posição ✓', perfect: true };
  return { label: 'Só fora de posição ⚠', perfect: false };
}
