// ============================================================================
// LiveMatch — plays a finished match back as a live broadcast: a clock ticks
// 0'→90' at the chosen tempo, goals and red cards pop in at their minute, and the
// scoreline climbs as they land. Shared by the solo campaign and the online
// bracket. The result is already decided (deterministic by seed) — this is pure
// presentation over MS_PER_MINUTE, so changing speed mid-match just re-paces it.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  END_PAUSE_MS,
  loadSimSpeed,
  MS_PER_MINUTE,
  saveSimSpeed,
  SIM_SPEEDS,
  type LiveEvent,
  type LiveMatchData,
  type SimSpeed,
} from '../lib/matchTimeline';
import { DisputaPenaltis, type DadosDisputaPenaltis } from './DisputaPenaltis';

/** Speed selector state, persisted to localStorage. */
export function useSimSpeed(): [SimSpeed, (s: SimSpeed) => void] {
  const [speed, setSpeed] = useState<SimSpeed>(loadSimSpeed);
  const set = useCallback((s: SimSpeed) => {
    setSpeed(s);
    saveSimSpeed(s);
  }, []);
  return [speed, set];
}

export function SpeedSelector({ speed, onChange }: { speed: SimSpeed; onChange: (s: SimSpeed) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-black/30 p-1">
      <span className="px-1.5 text-[11px] uppercase tracking-wide text-white/40">Velocidade</span>
      {SIM_SPEEDS.map((s) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          className={`rounded-lg px-2.5 py-1 text-sm font-semibold transition ${
            speed === s.id ? 'bg-gold-400 text-pitch-900' : 'text-white/70 hover:text-white'
          }`}
        >
          {s.emoji} {s.label}
        </button>
      ))}
    </div>
  );
}

export function LiveMatch({ data, speed, onDone }: { data: LiveMatchData; speed: SimSpeed; onDone: () => void }) {
  const [minute, setMinute] = useState(0);

  // Latest callback / speed via refs so the clock effect only restarts per match,
  // not on every speed change or parent re-render.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  // Com pênaltis (solo), a conclusão fica a cargo da disputa, não do apito final.
  const temPenaltisRef = useRef(!!data.penaltis);
  temPenaltisRef.current = !!data.penaltis;

  useEffect(() => {
    let cancelled = false;
    let m = 0;
    let timer: ReturnType<typeof setTimeout>;
    setMinute(0);
    const tick = () => {
      if (cancelled) return;
      m += 1;
      setMinute(m);
      if (m >= 90) {
        if (!temPenaltisRef.current) {
          timer = setTimeout(() => {
            if (!cancelled) onDoneRef.current();
          }, END_PAUSE_MS[speedRef.current]);
        }
        return;
      }
      timer = setTimeout(tick, MS_PER_MINUTE[speedRef.current]);
    };
    timer = setTimeout(tick, MS_PER_MINUTE[speedRef.current]);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [data.key]);

  const finished = minute >= 90;
  const shown = data.events.filter((e) => e.minute <= minute);
  const homeGoals = shown.filter((e) => e.kind === 'goal' && e.side === 'home').length;
  const awayGoals = shown.filter((e) => e.kind === 'goal' && e.side === 'away').length;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
      {/* Stage + clock */}
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-white/45">
        <span>{data.stageLabel}</span>
        <span className={`font-display text-lg ${finished ? 'text-white/70' : 'text-emerald-300'}`}>
          {finished ? 'FIM' : `${minute}'`}
        </span>
      </div>

      {/* Clock progress */}
      <div className="mb-3 h-1 overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300"
          style={{ width: `${Math.min(100, (minute / 90) * 100)}%`, transition: 'width 120ms linear' }}
        />
      </div>

      {/* Scoreboard */}
      <div className="flex items-center justify-center gap-3 text-center">
        <div className="flex-1 text-right">
          <p className="truncate font-display text-lg leading-tight text-white">{data.home.icon} {data.home.name}</p>
        </div>
        <div className="flex items-center gap-2 font-display text-4xl text-gold-400">
          <span key={`h${homeGoals}`} className="animate-pop">{homeGoals}</span>
          <span className="text-white/40">×</span>
          <span key={`a${awayGoals}`} className="animate-pop">{awayGoals}</span>
        </div>
        <div className="flex-1 text-left">
          <p className="truncate font-display text-lg leading-tight text-white">{data.away.icon} {data.away.name}</p>
        </div>
      </div>

      {/* Event feed */}
      <div className="mt-3 min-h-[2.5rem] space-y-1">
        {shown.length === 0 && !finished && (
          <p className="text-center text-xs text-white/40">Bola rolando…</p>
        )}
        {shown.map((e, i) => (
          <EventRow key={`${e.minute}-${e.kind}-${e.side}-${i}`} event={e} />
        ))}
      </div>

      {/* Disputa de pênaltis (solo) — só após o apito final */}
      {finished && data.penaltis && (
        <div className="mt-3">
          <DisputaPenaltis dados={dadosReplayPenaltis(data)} onConcluido={onDone} />
        </div>
      )}

      {/* Final whistle (sem pênaltis) */}
      {finished && !data.penaltis && (
        <div className="mt-2 animate-card-in text-center">
          {data.penalties && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">decidido nos pênaltis</p>
          )}
          <p className="text-sm italic text-white/65">“{data.blurb}”</p>
        </div>
      )}
    </div>
  );
}

/** Monta o view-model de replay da disputa (solo) a partir do LiveMatchData. */
function dadosReplayPenaltis(data: LiveMatchData): DadosDisputaPenaltis {
  return {
    stageLabel: data.stageLabel,
    ladoA: { nome: data.home.name, icon: data.home.icon },
    ladoB: { nome: data.away.name, icon: data.away.icon },
    historico: data.penaltis!.historico,
    encerrada: true,
    vencedorLado: data.penaltis!.vencedorLado,
    pendente: null,
    meuLado: null,
  };
}

function EventRow({ event }: { event: LiveEvent }) {
  const isHome = event.side === 'home';
  const icon = event.kind === 'goal' ? '⚽' : '🟥';
  return (
    <div className={`flex animate-card-in items-center gap-2 text-sm ${isHome ? '' : 'flex-row-reverse text-right'}`}>
      <span className="shrink-0 text-base">{icon}</span>
      <span className="text-white/45">{event.minute}'</span>
      <span className={`truncate ${event.kind === 'red' ? 'text-rose-300' : 'text-white/85'}`}>{event.label}</span>
    </div>
  );
}
