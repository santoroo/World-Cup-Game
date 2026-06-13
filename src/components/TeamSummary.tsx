import type { TeamStrength } from '../engine';

interface TeamSummaryProps {
  strength: TeamStrength;
  compact?: boolean;
}

export function TeamSummary({ strength, compact }: TeamSummaryProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-white">Força do time</h3>
        <div className="flex items-baseline gap-1">
          <span className="text-xs text-white/50">OVR</span>
          <span className="font-display text-4xl leading-none text-gold-400">{strength.overall}</span>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <Meter label="Ataque" value={strength.attack} />
        <Meter label="Meio-campo" value={strength.midfield} />
        <Meter label="Defesa" value={strength.defense} />
        <Meter label="Goleiro" value={strength.goalkeeper} />
        <Meter label="Química" value={strength.chemistry} accent />
      </div>

      {!compact && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">Pontos fortes</p>
            <ul className="space-y-1">
              {strength.strengths.map((s) => (
                <li key={s} className="text-sm text-white/80">✅ {s}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-rose-300">Pontos fracos</p>
            <ul className="space-y-1">
              {strength.weaknesses.map((w) => (
                <li key={w} className="text-sm text-white/80">⚠️ {w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function Meter({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  // Visually cap the bar at 100 but show the real (possibly >99) number.
  const pct = Math.max(4, Math.min(100, value));
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-xs">
        <span className="text-white/60">{label}</span>
        <span className="font-semibold text-white/90">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/40">
        <div
          className={`h-full rounded-full ${accent ? 'bg-gradient-to-r from-emerald-400 to-teal-300' : 'bg-gradient-to-r from-gold-500 to-gold-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
