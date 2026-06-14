// ============================================================================
// Game store — thin React layer over the pure engine. Holds the flow phase and
// dispatches engine calls. All heavy logic lives in src/engine.
// ============================================================================

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  computeTeamStrength,
  createDraft,
  choosePlayer as engineChoose,
  placeInSlot as enginePlaceInSlot,
  movePlayer as engineMove,
  swapPlayers as engineSwap,
  freeSkipsLeft,
  isComplete,
  registerSkip,
  roll as engineRoll,
  randomSeed,
  simulateCampaignInterativa,
  computeFinalScore,
  type CampaignResult,
  type DirecaoPenalti,
  type DisputaPenaltis,
  type DraftState,
  type Edition,
  type FinalScore,
  type Formation,
  type GameMode,
  type PlayStyle,
  type Player,
  type Slot,
  type TeamSnapshot,
} from '../engine';
import { EDITIONS } from '../lib/editions';

export type Phase = 'home' | 'setup' | 'draft' | 'simulating' | 'final';

export interface SetupConfig {
  teamName: string;
  formation: Formation;
  mode: GameMode;
  style: PlayStyle;
}

interface GameState {
  phase: Phase;
  seed: string;
  config: SetupConfig;
  draft: DraftState;
  rolledEdition: Edition | null;
  team: TeamSnapshot | null;
  campaign: CampaignResult | null;
  finalScore: FinalScore | null;
  /** Cantos escolhidos pelo usuário nas disputas de pênaltis (em ordem). */
  escolhasPenaltis: DirecaoPenalti[];
  /** Disputa de pênaltis aguardando a escolha do usuário (solo). */
  disputaPenaltis: DisputaPenaltis | null;
}

/** Recalcula a campanha interativa a partir das escolhas de pênalti acumuladas. */
function reduzirCampanha(s: GameState, escolhas: DirecaoPenalti[]): GameState {
  if (!s.team) return s;
  const user = { name: s.config.teamName, flag: '⭐', style: s.config.style, strength: s.team.strength, placed: s.team.placed };
  const { campaign, disputa } = simulateCampaignInterativa(user, EDITIONS, s.seed, escolhas);
  const finalScore = disputa
    ? null
    : computeFinalScore({ campaign, strength: s.team.strength, placed: s.team.placed, skipsUsed: s.draft.skipsUsed });
  return { ...s, escolhasPenaltis: escolhas, campaign, disputaPenaltis: disputa, finalScore };
}

const DEFAULT_CONFIG: SetupConfig = {
  teamName: 'Seleção dos Sonhos',
  formation: '4-3-3',
  mode: 'classico',
  style: 'equilibrado',
};

function freshState(): GameState {
  const seed = randomSeed();
  return {
    phase: 'home',
    seed,
    config: DEFAULT_CONFIG,
    draft: createDraft(seed, DEFAULT_CONFIG.formation),
    rolledEdition: null,
    team: null,
    campaign: null,
    finalScore: null,
    escolhasPenaltis: [],
    disputaPenaltis: null,
  };
}

interface GameContextValue extends GameState {
  editions: Edition[];
  goHome: () => void;
  goToSetup: () => void;
  startDraft: (config: SetupConfig) => void;
  rollDice: () => Edition | null;
  confirmPlayer: (player: Player) => void;
  confirmPlayerInSlot: (player: Player, slot: Slot) => void;
  repositionPlayer: (fromSlotId: string, toSlotId: string) => void;
  swapPlacedPlayers: (slotIdA: string, slotIdB: string) => void;
  skipRoll: () => void;
  finishDraft: () => void;
  runSimulation: () => void;
  escolherPenaltiSolo: (dir: DirecaoPenalti) => void;
  goFinal: () => void;
  restart: () => void;
  loadSharedResult: (state: {
    config: SetupConfig;
    seed: string;
    team: TeamSnapshot;
    campaign: CampaignResult;
    finalScore: FinalScore;
    escolhasPenaltis?: DirecaoPenalti[];
  }) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(freshState);

  const goHome = useCallback(() => setState((s) => ({ ...s, phase: 'home' })), []);
  const goToSetup = useCallback(() => setState((s) => ({ ...s, phase: 'setup' })), []);

  const startDraft = useCallback((config: SetupConfig) => {
    setState((s) => ({
      ...s,
      config,
      draft: createDraft(s.seed, config.formation),
      rolledEdition: null,
      team: null,
      campaign: null,
      finalScore: null,
      escolhasPenaltis: [],
      disputaPenaltis: null,
      phase: 'draft',
    }));
  }, []);

  const rollDice = useCallback((): Edition | null => {
    let rolled: Edition | null = null;
    setState((s) => {
      const { state: nextDraft, edition } = engineRoll(s.draft, EDITIONS, {
        chaos: s.config.mode === 'caos',
      });
      rolled = edition;
      return { ...s, draft: nextDraft, rolledEdition: edition };
    });
    return rolled;
  }, []);

  const confirmPlayer = useCallback((player: Player) => {
    setState((s) => ({
      ...s,
      draft: engineChoose(s.draft, player),
      rolledEdition: null,
    }));
  }, []);

  const confirmPlayerInSlot = useCallback((player: Player, slot: Slot) => {
    setState((s) => ({
      ...s,
      draft: enginePlaceInSlot(s.draft, player, slot),
      rolledEdition: null,
    }));
  }, []);

  const repositionPlayer = useCallback((fromSlotId: string, toSlotId: string) => {
    setState((s) => ({ ...s, draft: engineMove(s.draft, fromSlotId, toSlotId) }));
  }, []);

  const swapPlacedPlayers = useCallback((slotIdA: string, slotIdB: string) => {
    setState((s) => ({ ...s, draft: engineSwap(s.draft, slotIdA, slotIdB) }));
  }, []);

  const skipRoll = useCallback(() => {
    setState((s) => {
      // Hard limit: ignore once free skips are exhausted.
      if (freeSkipsLeft(s.draft) <= 0) return s;
      return { ...s, draft: registerSkip(s.draft), rolledEdition: null };
    });
  }, []);

  const finishDraft = useCallback(() => {
    setState((s) => {
      if (!isComplete(s.draft)) return s;
      const strength = computeTeamStrength(s.draft.placed, s.config.formation);
      const team: TeamSnapshot = {
        formation: s.config.formation,
        style: s.config.style,
        placed: s.draft.placed,
        strength,
      };
      return { ...s, team, phase: 'simulating' };
    });
  }, []);

  // Inicia a campanha interativa (sem escolhas ainda; pausa na 1ª disputa, se houver).
  const runSimulation = useCallback(() => {
    setState((s) => reduzirCampanha(s, []));
  }, []);

  // O usuário escolheu um canto numa disputa de pênaltis (cobrar ou defender).
  const escolherPenaltiSolo = useCallback((dir: DirecaoPenalti) => {
    setState((s) => (s.disputaPenaltis ? reduzirCampanha(s, [...s.escolhasPenaltis, dir]) : s));
  }, []);

  const goFinal = useCallback(() => setState((s) => ({ ...s, phase: 'final' })), []);

  const restart = useCallback(() => setState(freshState()), []);

  const loadSharedResult = useCallback<GameContextValue['loadSharedResult']>((shared) => {
    setState((s) => ({
      ...s,
      config: shared.config,
      seed: shared.seed,
      team: shared.team,
      campaign: shared.campaign,
      finalScore: shared.finalScore,
      escolhasPenaltis: shared.escolhasPenaltis ?? [],
      disputaPenaltis: null,
      phase: 'final',
    }));
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      ...state,
      editions: EDITIONS,
      goHome,
      goToSetup,
      startDraft,
      rollDice,
      confirmPlayer,
      confirmPlayerInSlot,
      repositionPlayer,
      swapPlacedPlayers,
      skipRoll,
      finishDraft,
      runSimulation,
      escolherPenaltiSolo,
      goFinal,
      restart,
      loadSharedResult,
    }),
    [state, goHome, goToSetup, startDraft, rollDice, confirmPlayer, confirmPlayerInSlot, repositionPlayer, swapPlacedPlayers, skipRoll, finishDraft, runSimulation, escolherPenaltiSolo, goFinal, restart, loadSharedResult],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
