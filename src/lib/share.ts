// ============================================================================
// Serialization for sharing / persistence (Section 12).
// A finished game is fully reproducible from: seed + config + the ordered picks
// (slotId + playerId) + skips. The campaign is deterministic by seed, so we only
// store the user's choices and re-run the engine to rebuild everything.
// ============================================================================

import {
  computeFinalScore,
  computeTeamStrength,
  evaluateFit,
  FORMATIONS,
  simulateCampaignInterativa,
  type CampaignResult,
  type DirecaoPenalti,
  type Edition,
  type FinalScore,
  type PlacedPlayer,
  type Player,
  type TeamSnapshot,
} from '../engine';
import type { SetupConfig } from '../game/useGameStore';

const VERSION = 2;
const STORAGE_KEY = 'copa-dos-sonhos:last';

interface SharePayload {
  v: number;
  seed: string;
  config: SetupConfig;
  picks: { slotId: string; playerId: string }[];
  skips: number;
  /** Cantos escolhidos pelo usuário nas disputas de pênaltis (em ordem). v2+. */
  penaltis?: DirecaoPenalti[];
}

export interface RebuiltResult {
  config: SetupConfig;
  seed: string;
  team: TeamSnapshot;
  campaign: CampaignResult;
  finalScore: FinalScore;
  escolhasPenaltis: DirecaoPenalti[];
}

function toPayload(
  seed: string,
  config: SetupConfig,
  placed: PlacedPlayer[],
  skips: number,
  penaltis: DirecaoPenalti[],
): SharePayload {
  return {
    v: VERSION,
    seed,
    config,
    picks: placed.map((p) => ({ slotId: p.slotId, playerId: p.player.id })),
    skips,
    penaltis,
  };
}

export function encodeResult(
  seed: string,
  config: SetupConfig,
  placed: PlacedPlayer[],
  skips: number,
  penaltis: DirecaoPenalti[] = [],
): string {
  const json = JSON.stringify(toPayload(seed, config, placed, skips, penaltis));
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodePayload(code: string): SharePayload | null {
  try {
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b64)));
    const payload = JSON.parse(json) as SharePayload;
    // Aceita v1 (sem pênaltis → automático) e v2 (com as escolhas do usuário).
    if (payload.v < 1 || payload.v > VERSION || !payload.picks?.length) return null;
    return payload;
  } catch {
    return null;
  }
}

function indexPlayers(editions: Edition[]): Map<string, Player> {
  const map = new Map<string, Player>();
  for (const e of editions) for (const p of e.players) map.set(p.id, p);
  return map;
}

function rebuild(payload: SharePayload, editions: Edition[]): RebuiltResult | null {
  const byId = indexPlayers(editions);
  const slots = FORMATIONS[payload.config.formation];
  const placed: PlacedPlayer[] = [];

  for (const pick of payload.picks) {
    const player = byId.get(pick.playerId);
    const slot = slots.find((s) => s.id === pick.slotId);
    if (!player || !slot) return null;
    const fit = evaluateFit(player, slot.position);
    placed.push({ slotId: slot.id, player, fitMultiplier: fit.fitMultiplier, outOfPosition: fit.outOfPosition });
  }

  const strength = computeTeamStrength(placed, payload.config.formation);
  const team: TeamSnapshot = { formation: payload.config.formation, style: payload.config.style, placed, strength };
  const escolhasPenaltis = payload.penaltis ?? [];
  // Re-roda a campanha com as escolhas guardadas → reproduz exatamente o jogo.
  const { campaign } = simulateCampaignInterativa(
    { name: payload.config.teamName, flag: '⭐', style: payload.config.style, strength, placed },
    editions,
    payload.seed,
    escolhasPenaltis,
  );
  const finalScore = computeFinalScore({ campaign, strength, placed, skipsUsed: payload.skips });

  return { config: payload.config, seed: payload.seed, team, campaign, finalScore, escolhasPenaltis };
}

export function decodeResult(code: string, editions: Edition[]): RebuiltResult | null {
  const payload = decodePayload(code);
  return payload ? rebuild(payload, editions) : null;
}

/** Read the share code from the URL hash (#g=...), if any. */
export function readShareFromUrl(): string | null {
  const hash = window.location.hash;
  const m = hash.match(/[#&]g=([^&]+)/);
  return m ? m[1] : null;
}

export function buildShareUrl(code: string): string {
  const base = window.location.origin + window.location.pathname;
  return `${base}#g=${code}`;
}

export function clearShareUrl(): void {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

// ---- localStorage persistence ----

export function saveLast(
  seed: string,
  config: SetupConfig,
  placed: PlacedPlayer[],
  skips: number,
  penaltis: DirecaoPenalti[] = [],
): void {
  try {
    localStorage.setItem(STORAGE_KEY, encodeResult(seed, config, placed, skips, penaltis));
  } catch {
    /* storage may be unavailable; ignore */
  }
}

export function loadLast(editions: Edition[]): RebuiltResult | null {
  try {
    const code = localStorage.getItem(STORAGE_KEY);
    return code ? decodeResult(code, editions) : null;
  } catch {
    return null;
  }
}
