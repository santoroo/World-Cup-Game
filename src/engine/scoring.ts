// ============================================================================
// Final scoring & ranking — Section 11.
// ============================================================================

import { MAX_FREE_SKIPS } from './draft';
import type { CampaignResult, FinalScore, PlacedPlayer, TeamStrength } from './types';

export interface ScoringInput {
  campaign: CampaignResult;
  strength: TeamStrength;
  placed: PlacedPlayer[];
  skipsUsed: number;
}

export function computeFinalScore({ campaign, strength, placed, skipsUsed }: ScoringInput): FinalScore {
  let pts = 0;

  pts += campaign.wins * 10;
  pts += campaign.draws * 3;
  pts += campaign.goalsFor * 3;
  pts -= campaign.goalsAgainst * 2;

  if (campaign.biggestWin) {
    pts += (campaign.biggestWin.homeGoals - campaign.biggestWin.awayGoals) * 5;
  }

  pts += Math.round((strength.chemistry - 50) * 1.2);
  pts += Math.round(strength.overall * 1.5);

  if (campaign.champion) pts += 120;
  if (campaign.hadSeteAZero) pts += 200; // bônus máximo

  const outOfPos = placed.filter((p) => p.outOfPosition).length;
  pts -= outOfPos * 8;

  const extraSkips = Math.max(0, skipsUsed - MAX_FREE_SKIPS);
  pts -= extraSkips * 10;

  pts = Math.max(0, Math.round(pts));

  const { rankTitle, rankBlurb } = rank(campaign, pts);
  return { points: pts, rankTitle, rankBlurb };
}

function rank(campaign: CampaignResult, pts: number): { rankTitle: string; rankBlurb: string } {
  if (campaign.champion && campaign.hadSeteAZero) {
    return { rankTitle: 'Lenda da Copa', rankBlurb: 'Campeão com um 7 a 0 na bagagem. Nome gravado na história.' };
  }
  if (campaign.champion) {
    return { rankTitle: 'Campeão dominante', rankBlurb: 'Levantou a taça com autoridade. Você montou uma máquina.' };
  }
  if (campaign.eliminatedAt === 'Fase de grupos') {
    return { rankTitle: 'Bagre histórico', rankBlurb: 'Esse time não saía da fase de grupos. Bola pra frente.' };
  }
  if (pts >= 220) {
    return { rankTitle: 'Time forte, faltou equilíbrio', rankBlurb: 'Elenco de respeito, mas faltou o último passo.' };
  }
  return { rankTitle: 'Eliminado com honra', rankBlurb: 'Caiu lutando. Faltou pouco pra ir mais longe.' };
}
