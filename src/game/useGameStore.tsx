// ============================================================================
// Game store — thin React layer over the pure engine. Holds the flow phase and
// dispatches engine calls. All heavy logic lives in src/engine.
// ============================================================================

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  computeTeamStrength,
  createDraft,
  choosePlayer as engineChoose,
  isComplete,
  registerSkip,
  roll as engineRoll,
  randomSeed,
  simulateCampaign,
  computeFinalScore,
  type CampaignResult,
  type DraftState,
  type Edition,
  type FinalScore,
  type Formation,
  type GameMode,
  type PlayStyle,
  type Player,
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
  };
}

interface GameContextValue extends GameState {
  editions: Edition[];
  goHome: () => void;
  goToSetup: () => void;
  startDraft: (config: SetupConfig) => void;
  rollDice: () => Edition | null;
  confirmPlayer: (player: Player) => void;
  skipRoll: () => void;
  finishDraft: () => void;
  runSimulation: () => void;
  goFinal: () => void;
  restart: () => void;
  loadSharedResult: (state: {
    config: SetupConfig;
    seed: string;
    team: TeamSnapshot;
    campaign: CampaignResult;
    finalScore: FinalScore;
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

  const skipRoll = useCallback(() => {
    setState((s) => ({ ...s, draft: registerSkip(s.draft), rolledEdition: null }));
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

  const runSimulation = useCallback(() => {
    setState((s) => {
      if (!s.team) return s;
      const campaign = simulateCampaign(
        {
          name: s.config.teamName,
          flag: '⭐',
          style: s.config.style,
          strength: s.team.strength,
          placed: s.team.placed,
        },
        EDITIONS,
        s.seed,
      );
      const finalScore = computeFinalScore({
        campaign,
        strength: s.team.strength,
        placed: s.team.placed,
        skipsUsed: s.draft.skipsUsed,
      });
      // Stay on the simulating phase so the screen can animate the campaign.
      return { ...s, campaign, finalScore };
    });
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
      skipRoll,
      finishDraft,
      runSimulation,
      goFinal,
      restart,
      loadSharedResult,
    }),
    [state, goHome, goToSetup, startDraft, rollDice, confirmPlayer, skipRoll, finishDraft, runSimulation, goFinal, restart, loadSharedResult],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
