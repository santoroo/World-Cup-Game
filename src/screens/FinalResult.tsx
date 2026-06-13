import { useEffect, useMemo } from 'react';
import { Button } from '../components/Button';
import { FormationPitch } from '../components/FormationPitch';
import { MatchCard } from '../components/MatchCard';
import { ShareCard } from '../components/ShareCard';
import { TeamSummary } from '../components/TeamSummary';
import { useGame } from '../game/useGameStore';
import { buildShareUrl, encodeResult, saveLast } from '../lib/share';

export function FinalResult() {
  const { config, seed, team, campaign, finalScore, draft, restart, goHome } = useGame();

  // Persist + build the share URL once we have a result.
  const shareUrl = useMemo(() => {
    if (!team) return '';
    const code = encodeResult(seed, config, team.placed, draft.skipsUsed);
    return buildShareUrl(code);
  }, [team, seed, config, draft.skipsUsed]);

  useEffect(() => {
    if (team && campaign) saveLast(seed, config, team.placed, draft.skipsUsed);
  }, [team, campaign, seed, config, draft.skipsUsed]);

  if (!team || !campaign || !finalScore) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-white/60">Nada por aqui. <button className="underline" onClick={goHome}>Voltar ao início</button></p>
      </div>
    );
  }

  const best = [...team.placed].sort((a, b) => b.player.overall - a.player.overall)[0];
  const worst = [...team.placed].sort((a, b) => a.player.overall - b.player.overall)[0];
  const finalMatch = campaign.matches.find((m) => m.stage === 'Final');

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Hero */}
      <div className={`mb-6 rounded-3xl border p-6 text-center ${campaign.champion ? 'border-gold-400/50 bg-gradient-to-b from-gold-500/20 to-transparent' : 'border-white/10 bg-black/25'}`}>
        <p className="text-sm uppercase tracking-widest text-white/50">{config.teamName}</p>
        <h1 className="mt-1 font-display text-5xl text-gold-400 sm:text-6xl">{finalScore.rankTitle}</h1>
        <p className="mx-auto mt-2 max-w-lg text-white/75">{finalScore.rankBlurb}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm text-white/70">
          <span>{campaign.champion ? '🥇 Campeão' : `Eliminado: ${campaign.eliminatedAt}`}</span>
          <span>Nota: <b className="text-gold-300">{finalScore.points}</b> pts</span>
          {campaign.hadSeteAZero && <span className="font-bold text-rose-300">🔥 Fez um 7 a 0!</span>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <FormationPitch formation={team.formation} placed={team.placed} />
          <TeamSummary strength={team.strength} />
        </div>

        <div className="space-y-4">
          {/* Stat grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Vitórias" value={`${campaign.wins}`} />
            <Stat label="Empates" value={`${campaign.draws}`} />
            <Stat label="Derrotas" value={`${campaign.losses}`} />
            <Stat label="Gols feitos" value={`${campaign.goalsFor}`} />
            <Stat label="Gols sofridos" value={`${campaign.goalsAgainst}`} />
            <Stat
              label="Maior goleada"
              value={campaign.biggestWin ? `${campaign.biggestWin.homeGoals}x${campaign.biggestWin.awayGoals}` : '—'}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Highlight emoji="⭐" title="Melhor escolha" name={`${best.player.name} (${best.player.overall})`} note={best.player.desc} />
            <Highlight emoji="😬" title="Pior escolha" name={`${worst.player.name} (${worst.player.overall})`} note="Faz parte, ninguém acerta todas." />
          </div>

          {finalMatch && (
            <div>
              <h3 className="mb-2 font-display text-xl text-white">A grande final</h3>
              <MatchCard match={finalMatch} teamName={config.teamName} />
            </div>
          )}

          <ShareCard
            teamName={config.teamName}
            campaign={campaign}
            finalScore={finalScore}
            strength={team.strength}
            shareUrl={shareUrl}
          />

          <div className="flex flex-wrap gap-3">
            <Button variant="gold" className="flex-1" onClick={restart}>🔁 Jogar de novo</Button>
            <Button variant="secondary" onClick={goHome}>🏠 Início</Button>
          </div>
        </div>
      </div>

      {/* Full campaign log */}
      <div className="mt-8">
        <h3 className="mb-3 font-display text-2xl text-white">Toda a campanha</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {campaign.matches.map((m, i) => (
            <MatchCard key={i} match={m} teamName={config.teamName} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-center">
      <div className="font-display text-3xl text-white">{value}</div>
      <div className="text-xs text-white/50">{label}</div>
    </div>
  );
}

function Highlight({ emoji, title, name, note }: { emoji: string; title: string; name: string; note: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <p className="text-xs uppercase tracking-wide text-white/45">{title}</p>
      <p className="font-display text-lg text-white">{emoji} {name}</p>
      <p className="line-clamp-2 text-xs text-white/55">{note}</p>
    </div>
  );
}
