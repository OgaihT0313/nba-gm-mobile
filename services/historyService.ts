// The save's memory across seasons: one SeasonRecord per finished season, and
// everything the Legado screen derives from it -- records, the Hall of Fame and
// the GM's achievements. Pure functions over SeasonState; nothing here touches
// the feed or the sim.
import {
  Player, PlayerCareer, PlayoffState, SeasonLeader, SeasonRecord, SeasonResult, SeasonState, Team,
} from '../types';
import { SALARY_CAP, getTeamSalary } from '../constants';

type PlayerMap = { [key: string]: Player };

// The NBA's 65-game rule is for awards; a leader needs a real season too.
const LEADER_MIN_GP = 50;

const inSeries = (series: { m: (Team | null)[] }[] | undefined, teamId: string) =>
  !!series?.some((s) => s.m.some((t) => t?.id === teamId));

export const seasonResult = (playoff: PlayoffState, teamId: string, championId: string): SeasonResult => {
  if (championId === teamId) return 'champion';
  if (playoff.finals?.m.some((t) => t?.id === teamId)) return 'finals';
  const confs = [playoff.east, playoff.west];
  if (confs.some((c) => inSeries(c.bracket.round3, teamId))) return 'conf_finals';
  if (confs.some((c) => inSeries(c.bracket.round2, teamId))) return 'round2';
  if (confs.some((c) => inSeries(c.bracket.round1, teamId))) return 'round1';
  if (confs.some((c) => c.initialSeeds.slice(6, 10).some((t) => t.id === teamId))) return 'playin';
  return 'missed';
};

const leaderOf = (players: PlayerMap, teams: Team[], stat: 'ppg' | 'rpg' | 'apg'): SeasonLeader | undefined => {
  const teamOf = new Map<string, string>();
  teams.forEach((t) => t.roster.forEach((id) => teamOf.set(id, t.id)));
  let best: SeasonLeader | undefined;
  for (const p of Object.values(players)) {
    const s = p.seasonStats;
    if (!s || s.gp < LEADER_MIN_GP) continue;
    if (!best || s[stat] > best.value) best = { playerId: p.id, teamId: teamOf.get(p.id), value: s[stat] };
  }
  return best;
};

// Built from the state at the moment the champion is crowned: standings and
// stat lines are still the season's, the offseason has not touched them.
export const buildSeasonRecord = (prev: SeasonState, playoff: PlayoffState, champion: Team): SeasonRecord => {
  const user = prev.teams.find((t) => t.id === prev.userTeamId);
  const seeds = playoff[user?.conference === 'West' ? 'west' : 'east'].initialSeeds;
  const seedIdx = seeds.findIndex((t) => t.id === prev.userTeamId);
  const finals = playoff.finals?.m ?? [];
  const runnerUp = finals.find((t) => t && t.id !== champion.id);
  const best = [...prev.teams].sort((a, b) => (b.wins || 0) - (a.wins || 0))[0];
  return {
    season: prev.gmLegacy.seasons + 1,
    userTeamId: prev.userTeamId,
    wins: user?.wins || 0,
    losses: user?.losses || 0,
    seed: seedIdx >= 0 ? seedIdx + 1 : undefined,
    result: seasonResult(playoff, prev.userTeamId, champion.id),
    payroll: user ? getTeamSalary(user, prev.players) : 0,
    mandate: prev.owner.mandate,
    championId: champion.id,
    runnerUpId: runnerUp?.id,
    bestRecord: { teamId: best.id, wins: best.wins || 0, losses: best.losses || 0 },
    leaders: {
      pts: leaderOf(prev.players, prev.teams, 'ppg'),
      reb: leaderOf(prev.players, prev.teams, 'rpg'),
      ast: leaderOf(prev.players, prev.teams, 'apg'),
    },
  };
};

export const RESULT_LABEL: Record<SeasonResult, string> = {
  missed: 'Fora',
  playin: 'Play-in',
  round1: '1ª rodada',
  round2: 'Semi de conf.',
  conf_finals: 'Final de conf.',
  finals: 'Finais',
  champion: 'Campeão',
};

const RESULT_RANK: Record<SeasonResult, number> = {
  missed: 0, playin: 1, round1: 2, round2: 3, conf_finals: 4, finals: 5, champion: 6,
};
export const resultAtLeast = (r: SeasonResult, floor: SeasonResult) => RESULT_RANK[r] >= RESULT_RANK[floor];

// ---------------------------------------------------------------- Hall of Fame

// Weighted honors plus longevity. Calibrated on the seeded real careers: four
// MVPs alone clear it; a long All-Star career with All-NBA nods clears it; a
// role player with two rings and 8,000 points does not.
export const hallOfFameScore = (c: PlayerCareer | undefined): number => {
  if (!c) return 0;
  return c.mvp * 10 + c.finalsMvp * 6 + c.dpoy * 4 + c.allNba * 3 + c.allStar * 1.5
    + c.titles * 2 + c.roy + c.smoy + c.mip + c.pts / 2000;
};
export const HALL_OF_FAME_SCORE = 25;

export const hallOfFame = (players: PlayerMap): Player[] =>
  Object.values(players)
    .filter((p) => p.retired && hallOfFameScore(p.career) >= HALL_OF_FAME_SCORE)
    .sort((a, b) => hallOfFameScore(b.career) - hallOfFameScore(a.career));

// Retired players whose last team was the user's: the ones whose jersey the
// franchise can raise. Only players who retired inside this save know where
// they retired from.
export const jerseyCandidates = (season: SeasonState): Player[] => {
  const raised = new Set((season.retiredJerseys ?? []).map((j) => j.playerId));
  return Object.values(season.players)
    .filter((p) => p.retired && p.retiredFrom?.teamId === season.userTeamId && !raised.has(p.id))
    .sort((a, b) => hallOfFameScore(b.career) - hallOfFameScore(a.career));
};

// --------------------------------------------------------------------- records

export interface RecordLine { label: string; playerId?: string; teamId?: string; value: string; season?: number }

const careerLeaders = (players: PlayerMap, stat: 'pts' | 'reb' | 'ast', n = 5) =>
  Object.values(players)
    .filter((p) => p.career && p.career[stat] > 0)
    .sort((a, b) => b.career![stat] - a.career![stat])
    .slice(0, n);

export const leagueRecords = (season: SeasonState) => {
  const history = season.seasonHistory ?? [];
  const bestSingle = (key: 'pts' | 'reb' | 'ast') => {
    let best: (SeasonLeader & { season: number }) | undefined;
    history.forEach((h) => {
      const l = h.leaders[key];
      if (l && (!best || l.value > best.value)) best = { ...l, season: h.season };
    });
    return best;
  };
  const bestTeam = history.reduce<SeasonRecord | undefined>(
    (acc, h) => (!acc || h.bestRecord.wins > acc.bestRecord.wins ? h : acc), undefined);
  return {
    single: { pts: bestSingle('pts'), reb: bestSingle('reb'), ast: bestSingle('ast') },
    bestTeam: bestTeam ? { ...bestTeam.bestRecord, season: bestTeam.season } : undefined,
    career: {
      pts: careerLeaders(season.players, 'pts'),
      reb: careerLeaders(season.players, 'reb'),
      ast: careerLeaders(season.players, 'ast'),
    },
  };
};

// Every finished season, oldest first, with whatever the save remembers of it:
// the full SeasonRecord when one was kept, and always the champion and MVP.
// awardHistory reaches back to season 1; seasonHistory only to the update
// that added it, and a save's earlier titles must still count.
export interface SeasonEntry { season: number; championId: string | null; mvp?: string; record?: SeasonRecord }
export const seasonEntries = (season: SeasonState): SeasonEntry[] => {
  const recs = new Map((season.seasonHistory ?? []).map((h) => [h.season, h]));
  return season.awardHistory.map((a) => ({ season: a.season, championId: a.championId, mvp: a.mvp, record: recs.get(a.season) }));
};
const userTitle = (season: SeasonState) => (e: SeasonEntry) => e.championId === season.userTeamId;

export const franchiseRecords = (season: SeasonState) => {
  const mine = (season.seasonHistory ?? []).filter((h) => h.userTeamId === season.userTeamId);
  const best = mine.reduce<SeasonRecord | undefined>((acc, h) => (!acc || h.wins > acc.wins ? h : acc), undefined);
  const worst = mine.reduce<SeasonRecord | undefined>((acc, h) => (!acc || h.wins < acc.wins ? h : acc), undefined);
  return {
    seasons: mine.length,
    titles: seasonEntries(season).filter(userTitle(season)).length,
    finals: mine.filter((h) => resultAtLeast(h.result, 'finals')).length,
    playoffs: mine.filter((h) => resultAtLeast(h.result, 'round1')).length,
    wins: mine.reduce((a, h) => a + h.wins, 0),
    losses: mine.reduce((a, h) => a + h.losses, 0),
    best,
    worst,
  };
};

// ---------------------------------------------------------------- achievements

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  // Season number it was first earned, when known.
  season?: number;
  // "2/3" style progress toward it while locked.
  progress?: string;
}

// The longest run of consecutive seasons satisfying `ok`, and the season it
// first reached `target` (if it did).
const streak = <T extends { season: number }>(mine: T[], ok: (h: T) => boolean, target: number) => {
  let run = 0;
  let best = 0;
  let at: number | undefined;
  mine.forEach((h) => {
    run = ok(h) ? run + 1 : 0;
    best = Math.max(best, run);
    if (at === undefined && run >= target) at = h.season;
  });
  return { best, current: run, at };
};

export const evaluateAchievements = (season: SeasonState): Achievement[] => {
  const mine = (season.seasonHistory ?? []).filter((h) => h.userTeamId === season.userTeamId);
  // Titles come from every season, not only the recorded ones (see seasonEntries).
  const entries = seasonEntries(season);
  const won = userTitle(season);
  const titles = entries.filter(won);
  const firstWhere = (ok: (h: SeasonRecord) => boolean) => mine.find(ok)?.season;
  const draftedByUs = (id?: string) => !!id && season.players[id]?.draftInfo?.teamId === season.userTeamId;

  // Three titles inside any five-season window.
  let dynastyAt: number | undefined;
  let dynastyBest = 0;
  entries.forEach((_, i) => {
    const window = entries.slice(Math.max(0, i - 4), i + 1);
    const n = window.filter(won).length;
    dynastyBest = Math.max(dynastyBest, n);
    if (dynastyAt === undefined && n >= 3) dynastyAt = entries[i].season;
  });

  // A bottom season (30 wins or fewer) turned into a conference final within
  // three seasons.
  let rebuildAt: number | undefined;
  mine.forEach((h, i) => {
    if (rebuildAt !== undefined || h.wins > 30) return;
    const turn = mine.slice(i + 1, i + 4).find((n) => resultAtLeast(n.result, 'conf_finals'));
    if (turn) rebuildAt = turn.season;
  });

  const homegrownMvp = season.awardHistory.find((a) => draftedByUs(a.mvp));
  const homegrownRoy = season.awardHistory.find((a) => draftedByUs(a.roy));
  const backToBack = streak(entries, won, 2);
  const playoffRun = streak(mine, (h) => resultAtLeast(h.result, 'round1'), 5);
  const bestRecordAt = firstWhere((h) => h.bestRecord.teamId === season.userTeamId);

  return [
    {
      id: 'first_title', title: 'Primeiro anel', description: 'Ganhar um título da NBA.',
      unlocked: titles.length > 0, season: titles[0]?.season,
    },
    {
      id: 'back_to_back', title: 'Bicampeão', description: 'Ganhar dois títulos seguidos.',
      unlocked: backToBack.at !== undefined, season: backToBack.at,
      progress: `${Math.min(backToBack.current, 2)}/2`,
    },
    {
      id: 'dynasty', title: 'Dinastia', description: 'Três títulos em cinco temporadas.',
      unlocked: dynastyAt !== undefined, season: dynastyAt, progress: `${Math.min(dynastyBest, 3)}/3`,
    },
    {
      id: 'rebuild', title: 'Reconstrução', description: 'De 30 vitórias ou menos a uma final de conferência em até três temporadas.',
      unlocked: rebuildAt !== undefined, season: rebuildAt,
    },
    {
      id: 'bargain_title', title: 'Título econômico', description: 'Ser campeão com a folha abaixo do teto salarial.',
      unlocked: mine.some((h) => h.result === 'champion' && h.payroll <= SALARY_CAP),
      season: mine.find((h) => h.result === 'champion' && h.payroll <= SALARY_CAP)?.season,
    },
    {
      id: 'homegrown_mvp', title: 'Cria da casa', description: 'Um jogador draftado por você ganha o MVP.',
      unlocked: !!homegrownMvp, season: homegrownMvp?.season,
    },
    {
      id: 'draft_hit', title: 'Olho bom', description: 'Um jogador draftado por você ganha o Calouro do Ano.',
      unlocked: !!homegrownRoy, season: homegrownRoy?.season,
    },
    {
      id: 'sixty', title: '60 vitórias', description: 'Vencer 60 jogos numa temporada regular.',
      unlocked: mine.some((h) => h.wins >= 60), season: firstWhere((h) => h.wins >= 60),
      progress: mine.length ? `recorde ${Math.max(...mine.map((h) => h.wins))}` : undefined,
    },
    {
      id: 'best_record', title: 'Melhor campanha', description: 'Terminar com a melhor campanha da liga.',
      unlocked: bestRecordAt !== undefined, season: bestRecordAt,
    },
    {
      id: 'cinderella', title: 'Zebra', description: 'Chegar às Finais saindo do play-in ou do 5º lugar para baixo.',
      unlocked: mine.some((h) => resultAtLeast(h.result, 'finals') && (h.seed ?? 0) >= 5),
      season: firstWhere((h) => resultAtLeast(h.result, 'finals') && (h.seed ?? 0) >= 5),
    },
    {
      id: 'playoff_run', title: 'Presença garantida', description: 'Cinco temporadas seguidas nos playoffs.',
      unlocked: playoffRun.at !== undefined, season: playoffRun.at, progress: `${Math.min(playoffRun.current, 5)}/5`,
    },
    {
      id: 'longevity', title: 'Longevidade', description: 'Completar dez temporadas no cargo.',
      unlocked: mine.length >= 10, season: mine[9]?.season, progress: `${Math.min(mine.length, 10)}/10`,
    },
  ];
};
