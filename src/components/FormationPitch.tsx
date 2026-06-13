import { FORMATIONS, type Formation, type PlacedPlayer, type Slot } from '../engine';

interface FormationPitchProps {
  formation: Formation;
  placed: PlacedPlayer[];
  /** Highlight still-open slots (draft). */
  highlightOpen?: boolean;
  /** Slot ids to emphasise as valid targets (placement/move/swap). */
  eligibleSlotIds?: string[];
  /** Currently picked slot (e.g. the player being moved). */
  selectedSlotId?: string | null;
  /** Click handler; when set, slots become interactive buttons. */
  onSlotClick?: (slotId: string) => void;
  className?: string;
}

export function FormationPitch({
  formation,
  placed,
  highlightOpen,
  eligibleSlotIds,
  selectedSlotId,
  onSlotClick,
  className,
}: FormationPitchProps) {
  const slots = FORMATIONS[formation];
  const placedBySlot = new Map(placed.map((p) => [p.slotId, p]));
  const eligible = new Set(eligibleSlotIds ?? []);

  return (
    <div
      className={`pitch-stripes relative aspect-[3/4] w-full overflow-hidden rounded-3xl border border-emerald-300/20 bg-gradient-to-b from-pitch-600 to-pitch-800 ${className ?? ''}`}
    >
      {/* Field markings */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
        <div className="absolute left-0 right-0 top-1/2 border-t border-white/20" />
        <div className="absolute left-1/2 top-0 h-14 w-32 -translate-x-1/2 border-x border-b border-white/20" />
        <div className="absolute bottom-0 left-1/2 h-14 w-32 -translate-x-1/2 border-x border-t border-white/20" />
      </div>

      {slots.map((slot) => (
        <SlotNode
          key={slot.id}
          slot={slot}
          placed={placedBySlot.get(slot.id)}
          highlightOpen={highlightOpen && !placedBySlot.get(slot.id)}
          eligible={eligible.has(slot.id)}
          selected={selectedSlotId === slot.id}
          onClick={onSlotClick ? () => onSlotClick(slot.id) : undefined}
        />
      ))}
    </div>
  );
}

function SlotNode({
  slot,
  placed,
  highlightOpen,
  eligible,
  selected,
  onClick,
}: {
  slot: Slot;
  placed?: PlacedPlayer;
  highlightOpen?: boolean;
  eligible?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center ${onClick ? 'cursor-pointer' : ''}`}
      style={{ left: `${slot.x}%`, top: `${slot.y}%`, width: '24%' }}
    >
      {placed ? (
        <>
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-display shadow-lg transition ${
              selected
                ? 'border-gold-400 bg-gold-400 text-pitch-900 scale-110'
                : eligible
                  ? 'border-sky-300 bg-sky-500/30 text-sky-100 animate-pulse'
                  : placed.outOfPosition
                    ? 'border-amber-300 bg-amber-500/30 text-amber-100'
                    : 'border-white/70 bg-pitch-900 text-gold-400'
            }`}
            title={placed.outOfPosition ? 'Fora de posição' : 'Na posição'}
          >
            {placed.player.overall}
          </div>
          <span className="mt-0.5 max-w-full truncate rounded bg-black/55 px-1 text-[10px] font-semibold leading-tight text-white">
            {placed.player.name}
          </span>
        </>
      ) : (
        <>
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed text-[10px] font-bold transition ${
              eligible
                ? 'border-emerald-300 bg-emerald-400/25 text-emerald-100 animate-pulse scale-110'
                : highlightOpen
                  ? 'border-gold-400 bg-gold-400/10 text-gold-300'
                  : 'border-white/30 text-white/40'
            }`}
          >
            {slot.label}
          </div>
          <span className="mt-0.5 text-[9px] uppercase tracking-wide text-white/35">{eligible ? 'colocar' : 'vazio'}</span>
        </>
      )}
    </Tag>
  );
}
