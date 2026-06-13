import { useState } from 'react';
import { Button } from './Button';
import type { CampaignResult, FinalScore, TeamStrength } from '../engine';

interface ShareCardProps {
  teamName: string;
  campaign: CampaignResult;
  finalScore: FinalScore;
  strength: TeamStrength;
  shareUrl: string;
}

function buildShareText(p: ShareCardProps): string {
  const { teamName, campaign, finalScore, strength } = p;
  const status = campaign.champion ? '🥇 CAMPEÃO DO MUNDO!' : `Eliminado: ${campaign.eliminatedAt ?? 'mata-mata'}`;
  const biggest = campaign.biggestWin
    ? `${campaign.biggestWin.homeGoals}x${campaign.biggestWin.awayGoals} vs ${campaign.biggestWin.opponent.name}`
    : '—';
  const lines = [
    `⚽ Copa dos Sonhos 🏆`,
    `${teamName} — ${finalScore.rankTitle}`,
    status,
    `Overall ${strength.overall} · Química ${strength.chemistry}`,
    `${campaign.wins}V ${campaign.draws}E ${campaign.losses}D · Gols ${campaign.goalsFor}-${campaign.goalsAgainst}`,
    `Maior goleada: ${biggest}`,
    campaign.hadSeteAZero ? '🔥 Fez um 7 a 0!' : '',
    `Nota final: ${finalScore.points} pts`,
  ].filter(Boolean);
  return lines.join('\n');
}

export function ShareCard(props: ShareCardProps) {
  const [copied, setCopied] = useState<'text' | 'link' | null>(null);

  const copy = async (kind: 'text' | 'link') => {
    const value = kind === 'text' ? `${buildShareText(props)}\n${props.shareUrl}` : props.shareUrl;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <h3 className="mb-2 font-display text-xl text-white">Compartilhar</h3>
      <pre className="mb-3 whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-sm text-white/80">
        {buildShareText(props)}
      </pre>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => copy('text')}>
          {copied === 'text' ? '✅ Copiado!' : '📋 Copiar resumo'}
        </Button>
        <Button variant="ghost" onClick={() => copy('link')}>
          {copied === 'link' ? '✅ Link copiado!' : '🔗 Copiar link'}
        </Button>
      </div>
    </div>
  );
}
