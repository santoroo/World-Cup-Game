import type { MatchResult } from '../engine';

export function MatchCard({ match, teamName }: { match: MatchResult; teamName: string }) {
  const result = match.win ? 'V' : match.draw ? 'E' : 'D';
  const resultColor = match.win
    ? 'bg-emerald-500 text-emerald-950'
    : match.draw
      ? 'bg-yellow-400 text-yellow-950'
      : 'bg-rose-500 text-rose-950';

  return (
    <div className="animate-card-in rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-white/45">
        <span>{match.stage}</span>
        <span className={`rounded px-1.5 py-0.5 font-bold ${resultColor}`}>{result}</span>
      </div>

      <div className="flex items-center justify-center gap-3 text-center">
        <div className="flex-1 text-right">
          <p className="font-display text-lg leading-tight text-white">⭐ {teamName}</p>
        </div>
        <div className="flex items-center gap-2 font-display text-4xl text-gold-400">
          <span>{match.homeGoals}</span>
          <span className="text-white/40">×</span>
          <span>{match.awayGoals}</span>
        </div>
        <div className="flex-1 text-left">
          <p className="font-display text-lg leading-tight text-white">{match.opponent.flag} {match.opponent.name}</p>
        </div>
      </div>

      <p className="mt-2 text-center text-sm italic text-white/65">“{match.blurb}”</p>

      <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-white/55">
        <span>
          {match.homeScorers.length > 0
            ? `⚽ ${match.homeScorers.map((s) => `${s.name} ${s.minute}'`).join(', ')}`
            : 'Sem gols nossos'}
        </span>
        <span className="text-gold-300">Destaque: {match.manOfTheMatch}</span>
      </div>

      {(match.homeRedCards.length > 0 || match.awayRedCards.length > 0) && (
        <p className="mt-1 text-[11px] text-rose-300">
          🟥 {[...match.homeRedCards, ...match.awayRedCards]
            .sort((a, b) => a.minute - b.minute)
            .map((c) => `${c.name} ${c.minute}'`)
            .join(', ')}
        </p>
      )}
    </div>
  );
}
