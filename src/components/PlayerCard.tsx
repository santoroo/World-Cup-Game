import type { Player } from '../engine';
import { positionLabel, rarityLabel, siglaPosicao } from '../lib/messages';

const RARITY_STYLES: Record<string, { ring: string; chip: string; glow: string }> = {
  lenda: { ring: 'ring-amber-300/80', chip: 'bg-amber-300 text-amber-950', glow: 'shadow-[0_0_28px_-6px_rgba(245,197,66,0.7)]' },
  craque: { ring: 'ring-purple-300/70', chip: 'bg-purple-300 text-purple-950', glow: 'shadow-[0_0_22px_-8px_rgba(216,180,254,0.6)]' },
  raro: { ring: 'ring-sky-300/60', chip: 'bg-sky-300 text-sky-950', glow: '' },
  comum: { ring: 'ring-white/20', chip: 'bg-white/20 text-white', glow: '' },
};

interface PlayerCardProps {
  player: Player;
  /** Hide the overall (Almanaque mode). */
  hideOverall?: boolean;
  selected?: boolean;
  onClick?: () => void;
  /** Optional fit info when shown as a draft option. */
  fit?: { label: string; perfect: boolean };
  compact?: boolean;
  /** Esmaecido e não-clicável (dá pra ver, mas não escolher). */
  indisponivel?: boolean;
  /** Rótulo do porquê está indisponível (ex.: "Sem vaga", "Já escolhido"). */
  motivoIndisponivel?: string;
}

export function PlayerCard({ player, hideOverall, selected, onClick, fit, compact, indisponivel, motivoIndisponivel }: PlayerCardProps) {
  const style = RARITY_STYLES[player.rarity] ?? RARITY_STYLES.comum;
  const clickable = !!onClick && !indisponivel;

  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      aria-disabled={indisponivel}
      className={[
        'relative w-full rounded-2xl border border-white/10 bg-gradient-to-b from-pitch-700/90 to-pitch-900/95 p-3 text-left ring-1 transition',
        style.ring,
        indisponivel ? '' : style.glow,
        indisponivel
          ? 'cursor-not-allowed opacity-40 grayscale'
          : clickable
            ? 'cursor-pointer hover:-translate-y-1 hover:border-white/30'
            : 'cursor-default',
        selected ? 'outline outline-2 outline-gold-400 -translate-y-1' : '',
        'animate-card-in',
      ].join(' ')}
    >
      {indisponivel && motivoIndisponivel && (
        <span className="absolute right-1.5 top-1.5 z-10 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/80">
          {motivoIndisponivel}
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-white/60">
            <span className="text-base leading-none">{player.flag}</span>
            <span className="truncate">{player.country} · {player.year}</span>
          </div>
          <h3 className={`mt-1 font-display ${compact ? 'text-lg' : 'text-2xl'} leading-none text-white`}>
            {player.name}
          </h3>
          <div className="mt-1 flex flex-wrap gap-1">
            {player.positions.map((p) => (
              <span key={p} className="rounded-md bg-black/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/80">
                {siglaPosicao(p)}
              </span>
            ))}
          </div>
        </div>
        {!hideOverall && (
          <div className="flex shrink-0 flex-col items-center">
            <span className="font-display text-3xl leading-none text-gold-400">{player.overall}</span>
            <span className={`mt-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${style.chip}`}>
              {rarityLabel(player.rarity)}
            </span>
          </div>
        )}
        {hideOverall && (
          <span className="shrink-0 rounded-lg bg-black/40 px-2 py-1 text-xs font-semibold text-white/50">?</span>
        )}
      </div>

      {!compact && !hideOverall && <p className="mt-2 line-clamp-2 text-xs text-white/55">{player.desc}</p>}

      {!compact && !hideOverall && (
        <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-white/70">
          <Stat label="ATA" value={player.attack} />
          <Stat label="MEI" value={player.midfield} />
          <Stat label="DEF" value={player.defense} />
          <Stat label="TÉC" value={player.technique} />
          <Stat label="FÍS" value={player.physical} />
          <Stat label="DEC" value={player.clutch} />
        </div>
      )}

      {fit && (
        <div className={`mt-2 rounded-lg px-2 py-1 text-[11px] font-semibold ${fit.perfect ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
          {fit.label}
        </div>
      )}

      <span className="pointer-events-none absolute right-2 top-2 text-[10px] uppercase tracking-widest text-white/20">
        {positionLabel(player.positions[0])}
      </span>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded bg-black/20 px-1.5 py-0.5">
      <span className="text-white/40">{label}</span>
      <span className="font-semibold text-white/85">{value}</span>
    </div>
  );
}
