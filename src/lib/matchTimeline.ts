// ============================================================================
// Match timeline — turns a finished match (campaign PvE or bracket PvP) into a
// normalized, minute-sorted event stream the LiveMatch component can play back.
// Pure (no React): types, tempo constants, persistence and the two builders.
// ============================================================================

import type { BracketMatch, ChutePenalti, MatchResult, MpPlayer } from '../engine';

export type SimSpeed = 'lento' | 'normal' | 'rapido';

export const SIM_SPEEDS: { id: SimSpeed; label: string; emoji: string }[] = [
  { id: 'lento', label: 'Lento', emoji: '🐢' },
  { id: 'normal', label: 'Normal', emoji: '⚽' },
  { id: 'rapido', label: 'Rápido', emoji: '⚡' },
];

/** Milliseconds the clock spends on each in-game minute (drives the tempo). */
export const MS_PER_MINUTE: Record<SimSpeed, number> = {
  lento: 95, // ~8.5s for a 90' match
  normal: 42, // ~3.8s
  rapido: 16, // ~1.4s
};

/** Pause on the final whistle before advancing to the next match. */
export const END_PAUSE_MS: Record<SimSpeed, number> = {
  lento: 1500,
  normal: 900,
  rapido: 450,
};

const SPEED_KEY = 'copa-dos-sonhos:sim-speed';

export function loadSimSpeed(): SimSpeed {
  try {
    const v = localStorage.getItem(SPEED_KEY);
    if (v === 'lento' || v === 'normal' || v === 'rapido') return v;
  } catch {
    /* storage unavailable */
  }
  return 'normal';
}

export function saveSimSpeed(speed: SimSpeed): void {
  try {
    localStorage.setItem(SPEED_KEY, speed);
  } catch {
    /* storage unavailable */
  }
}

export type LiveSideKey = 'home' | 'away';

export interface LiveEvent {
  minute: number;
  kind: 'goal' | 'red';
  side: LiveSideKey;
  label: string;
}

export interface LiveSide {
  name: string;
  /** Flag emoji (PvE opponents / user) or player avatar (PvP). */
  icon: string;
  goals: number;
}

export interface LiveMatchData {
  /** Stable id — also resets the playback animation when it changes. */
  key: string;
  stageLabel: string;
  home: LiveSide;
  away: LiveSide;
  /** Minute-sorted goals + red cards. */
  events: LiveEvent[];
  blurb: string;
  penalties: boolean;
  winner: LiveSideKey | 'draw';
  /** Sequência da disputa de pênaltis pra tocar após o 0'→90' (solo). 'a' = home. */
  penaltis?: { golsA: number; golsB: number; historico: ChutePenalti[]; vencedorLado: 'a' | 'b' } | null;
}

/** Merge scorers + red cards of both sides into one minute-sorted stream. */
function buildEvents(
  home: { goals: { name: string; minute: number }[]; reds: { name: string; minute: number }[] },
  away: { goals: { name: string; minute: number }[]; reds: { name: string; minute: number }[] },
): LiveEvent[] {
  const events: LiveEvent[] = [
    ...home.goals.map((s): LiveEvent => ({ minute: s.minute, kind: 'goal', side: 'home', label: s.name })),
    ...away.goals.map((s): LiveEvent => ({ minute: s.minute, kind: 'goal', side: 'away', label: s.name })),
    ...home.reds.map((c): LiveEvent => ({ minute: c.minute, kind: 'red', side: 'home', label: c.name })),
    ...away.reds.map((c): LiveEvent => ({ minute: c.minute, kind: 'red', side: 'away', label: c.name })),
  ];
  // Sort by minute; on a tie show the goal before the card.
  return events.sort((a, b) => a.minute - b.minute || (a.kind === 'goal' ? -1 : 1));
}

/** Build live data for a campaign (PvE) match. The user is always "home". */
export function liveFromMatch(match: MatchResult, teamName: string, index: number): LiveMatchData {
  // A knockout that ends level but is marked a win went to penalties.
  const penalties = match.homeGoals === match.awayGoals && !match.draw;
  return {
    key: `pve-${index}-${match.stage}`,
    stageLabel: match.stage,
    home: { name: teamName, icon: '⭐', goals: match.homeGoals },
    away: { name: match.opponent.name, icon: match.opponent.flag, goals: match.awayGoals },
    events: buildEvents(
      { goals: match.homeScorers, reds: match.homeRedCards },
      { goals: match.awayScorers, reds: match.awayRedCards },
    ),
    blurb: match.blurb,
    penalties,
    winner: match.win ? 'home' : match.draw ? 'draw' : 'away',
    penaltis: match.penaltis ?? null,
  };
}

/** Build live data for a played bracket (PvP) tie. Returns null for byes. */
export function liveFromBracket(match: BracketMatch, byId: Map<string, MpPlayer>): LiveMatchData | null {
  const res = match.result;
  if (!res || !match.aId || !match.bId) return null;
  const a = byId.get(match.aId);
  const b = byId.get(match.bId);
  return {
    key: match.id,
    stageLabel: match.stageLabel,
    home: { name: a?.name ?? '?', icon: a?.avatar ?? '⚽', goals: res.a.goals },
    away: { name: b?.name ?? '?', icon: b?.avatar ?? '⚽', goals: res.b.goals },
    events: buildEvents(
      { goals: res.a.scorers, reds: res.a.redCards },
      { goals: res.b.scorers, reds: res.b.redCards },
    ),
    blurb: res.blurb,
    penalties: res.penalties,
    winner: res.a.goals === res.b.goals ? 'draw' : res.winnerId === match.aId ? 'home' : 'away',
  };
}
