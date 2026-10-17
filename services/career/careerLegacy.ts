// Your legacy (PLANO-CARREIRA.md, fase 4): what the career adds up to.
//   - Hall of Fame: the same score the league's own Hall uses
//     (historyService.hallOfFameScore), shown as you go, with how far it is.
//   - Retirement: yours to call. The summer never retires you (keepIds in the
//     offseason); the body tells you when it is time -- age, the rating
//     slipping from its peak, injuries -- and at 41 it is over.
//   - The legends: where your totals rank among the real careers the league
//     carries (seeded from the real NBA) and the ones played in this save.
//   - A retired number: the teams you gave your best years to hang your jersey.
import type { Player, PlayerCareer } from '../../types';
import { hallOfFameScore, HALL_OF_FAME_SCORE } from '../historyService';
import { accumulateCareers } from '../careerService';
import type { CareerState } from './careerTypes';

/** The oldest you play: past this the summer retires you, choice or not. */
export const LAST_AGE = 41;

const myCareerNow = (s: CareerState): PlayerCareer | undefined => s.league.players[s.meId]?.career;

/** Hall of Fame score so far and how it reads. */
export const hallOfFameProgress = (s: CareerState) => {
  const score = hallOfFameScore(myCareerNow(s));
  const frac = Math.min(1, score / HALL_OF_FAME_SCORE);
  const label = score >= HALL_OF_FAME_SCORE ? 'Vaga garantida'
    : score >= HALL_OF_FAME_SCORE * 0.7 ? 'Muito perto'
      : score >= HALL_OF_FAME_SCORE * 0.4 ? 'No caminho'
        : score >= HALL_OF_FAME_SCORE * 0.15 ? 'Ainda longe' : 'Começando';
  return { score, needed: HALL_OF_FAME_SCORE, frac, label };
};

/** What the body is saying, or null while it says nothing. */
export const bodyWarning = (s: CareerState): string | null => {
  const p = s.league.players[s.meId];
  if (!p) return null;
  const peak = Math.max(p.career?.peakOvr ?? p.ovr, ...s.seasons.map((x) => x.ovr));
  const drop = peak - p.ovr;
  if (p.age >= LAST_AGE) return 'O corpo não aguenta mais uma temporada. É hora de parar.';
  if (p.age >= 36 && drop >= 6) return `Aos ${p.age}, ${drop} pontos abaixo do seu auge. As pernas já não respondem.`;
  if (p.age >= 34 && drop >= 4) return `O atletismo cai a cada verão: ${drop} pontos abaixo do auge.`;
  if (p.age >= 33 && (p.load ?? 0) > 60) return 'O desgaste acumula mais rápido do que antes.';
  return null;
};

/** You can hang it up between seasons (the champion crowned, summer not run). */
export const canRetire = (s: CareerState) => s.phase !== 'retired' && s.league.status === 'offseason';

export interface LegendRank {
  stat: 'pts' | 'reb' | 'ast';
  label: string;
  total: number;
  rank: number;
  /** The career just above yours, to chase. */
  next?: { name: string; total: number };
}

/**
 * Your career totals among every career the league holds: the real ones it was
 * seeded with (sync_careers: active players' real totals) and the ones played
 * in this save, retired players included.
 */
export const legendRanks = (s: CareerState): LegendRank[] => {
  const mine = myCareerNow(s);
  const all = Object.values(s.league.players).filter((p): p is Player & { career: PlayerCareer } => !!p.career && p.id !== s.meId);
  const stats: { stat: LegendRank['stat']; label: string }[] = [
    { stat: 'pts', label: 'Pontos' }, { stat: 'reb', label: 'Rebotes' }, { stat: 'ast', label: 'Assistências' },
  ];
  return stats.map(({ stat, label }) => {
    const total = mine?.[stat] ?? 0;
    const above = all.filter((p) => p.career[stat] > total).sort((a, b) => a.career[stat] - b.career[stat]);
    const next = above[0];
    return { stat, label, total, rank: above.length + 1, next: next ? { name: next.name, total: next.career[stat] } : undefined };
  });
};

/** Teams that retire your number: where you gave them years, or a ring. */
export const jerseyRetiredBy = (s: CareerState): string[] => {
  const byTeam = new Map<string, { seasons: number; titles: number }>();
  s.seasons.forEach((l) => {
    const e = byTeam.get(l.teamId) ?? { seasons: 0, titles: 0 };
    e.seasons += 1;
    if (l.honors.includes('Campeão')) e.titles += 1;
    byTeam.set(l.teamId, e);
  });
  const hof = hallOfFameProgress(s).score >= HALL_OF_FAME_SCORE;
  return [...byTeam.entries()]
    .filter(([, e]) => e.seasons >= 8 || (e.seasons >= 5 && (e.titles >= 1 || hof)) || (e.seasons >= 3 && e.titles >= 2))
    .map(([id]) => id);
};

export interface RetirementSummary {
  label: string;
  age: number;
  seasons: number;
  hofScore: number;
  inducted: boolean;
  jerseys: string[];
}

/**
 * Hang it up. The season just played counts first -- the same bookkeeping the
 * summer would have done (accumulateCareers), so the totals and the Hall see
 * the whole career -- then the player leaves the league for good.
 */
export const retire = (s: CareerState, seasonLine: CareerState['seasons'][number] | null): CareerState => {
  const lg = s.league;
  const p = lg.players[s.meId];
  if (!p || lg.status !== 'offseason') return s;
  const last = lg.awardHistory[lg.awardHistory.length - 1];
  const champTeam = lg.teams.find((t) => t.id === last?.championId);
  const counted = accumulateCareers(
    { [s.meId]: p },
    champTeam?.roster ?? [],
    lg.awards,
    lg.playoff?.awards.finalsMVP ?? last?.finalsMvp,
    [...(lg.allStar?.eastRoster ?? []), ...(lg.allStar?.westRoster ?? [])],
  )[s.meId];
  const seasons = seasonLine ? [...s.seasons, seasonLine] : s.seasons;
  const done: CareerState = {
    ...s,
    seasons,
    league: {
      ...lg,
      players: { ...lg.players, [s.meId]: { ...counted, retired: true, contractYears: 0, retiredFrom: { teamId: lg.teams.find((t) => t.roster.includes(s.meId))?.id, season: lg.awardHistory.length } } },
      teams: lg.teams.map((t) => (t.roster.includes(s.meId) ? { ...t, roster: t.roster.filter((id) => id !== s.meId) } : t)),
    },
  };
  const hof = hallOfFameScore(counted.career);
  const summary: RetirementSummary = {
    label: seasonLine?.label ?? '',
    age: p.age,
    seasons: seasons.length,
    hofScore: hof,
    inducted: hof >= HALL_OF_FAME_SCORE,
    jerseys: jerseyRetiredBy({ ...done, league: { ...done.league } }),
  };
  return {
    ...done,
    phase: 'retired',
    retirement: summary,
    feed: [{ day: 0, text: `Você se aposentou aos ${p.age}, depois de ${seasons.length} temporadas.` }, ...s.feed].slice(0, 40),
  };
};
