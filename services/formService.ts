import { Team, Player, ScheduleGame } from '../types';

// Derived views of a team's schedule that several redesigned screens need but
// nothing in the sim stores: the last-N results strip on the season hero, the
// current streak chip, the next fixture, and a win projection for it.
//
// All of it is read straight off SeasonState.schedule (the sim writes scores
// back onto each ScheduleGame as it plays), so there is no new state to keep in
// sync and it stays correct after a load, a trade, or a mid-season jump.

export interface GameResult {
  won: boolean;
  /** Points for / against, from the user team's perspective. */
  pf: number;
  pa: number;
  opponentId: string;
  home: boolean;
  day: number;
}

/** Completed games for `teamId`, oldest first. */
export const teamResults = (schedule: ScheduleGame[], teamId: string): GameResult[] =>
  schedule
    .filter((g) => g.played && (g.homeTeamId === teamId || g.awayTeamId === teamId))
    .sort((a, b) => a.day - b.day)
    .map((g) => {
      const home = g.homeTeamId === teamId;
      const pf = (home ? g.homeScore : g.awayScore) ?? 0;
      const pa = (home ? g.awayScore : g.homeScore) ?? 0;
      return { won: pf > pa, pf, pa, home, day: g.day, opponentId: home ? g.awayTeamId : g.homeTeamId };
    });

/** The most recent `n` results, oldest first — the V/D strip on the hero. */
export const recentForm = (schedule: ScheduleGame[], teamId: string, n = 5): GameResult[] =>
  teamResults(schedule, teamId).slice(-n);

/**
 * Current run, signed: +3 = three straight wins, -2 = two straight losses,
 * 0 = no games played yet.
 */
export const currentStreak = (schedule: ScheduleGame[], teamId: string): number => {
  const results = teamResults(schedule, teamId);
  if (results.length === 0) return 0;
  const { won } = results[results.length - 1];
  let run = 0;
  for (let i = results.length - 1; i >= 0 && results[i].won === won; i--) run++;
  return won ? run : -run;
};

/** The next unplayed fixture for `teamId`, or null once the season is done. */
export const nextGame = (schedule: ScheduleGame[], teamId: string): ScheduleGame | null =>
  schedule
    .filter((g) => !g.played && (g.homeTeamId === teamId || g.awayTeamId === teamId))
    .sort((a, b) => a.day - b.day)[0] ?? null;

/** Mean OVR of the eight players the sim actually gives rotation minutes to. */
export const rotationStrength = (team: Team, players: { [key: string]: Player }): number => {
  const top = team.roster
    .map((id) => players[id]?.ovr ?? 0)
    .sort((a, b) => b - a)
    .slice(0, 8);
  return top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
};

/**
 * A single 0-99 roster rating for a team, weighting the best players hardest
 * (a top-eight mean flattens the whole league into 80-85 and tells you
 * nothing). Used as the "OVR" badge on the franchise picker.
 */
export const teamRating = (team: Team, players: { [key: string]: Player }): number => {
  const ovrs = team.roster
    .map((id) => players[id]?.ovr ?? 0)
    .sort((a, b) => b - a)
    .slice(0, 10);
  if (!ovrs.length) return 0;
  const decay = 0.82;
  let num = 0;
  let den = 0;
  ovrs.forEach((v, i) => {
    const w = Math.pow(decay, i);
    num += v * w;
    den += w;
  });
  return Math.round(num / den);
};

export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * How hard this franchise is to win with, straight off the data's own league
 * ranking — picking the Wizards is not the same job as picking the Thunder,
 * and the picker says so before you commit.
 */
export const teamDifficulty = (team: Team): Difficulty =>
  team.powerRank <= 10 ? 'easy' : team.powerRank <= 20 ? 'medium' : 'hard';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Fácil',
  medium: 'Médio',
  hard: 'Difícil',
};

/**
 * Rough win probability for `team` against `opponent`, as a display-only
 * projection (a logistic on the rotation-strength gap plus home court). It is
 * deliberately NOT the match engine's own math — that resolves a game with
 * fatigue, morale, tactics and randomness, none of which is knowable before
 * tip-off. Labeled as a projection everywhere it's shown.
 */
export const winProbability = (
  team: Team,
  opponent: Team,
  players: { [key: string]: Player },
  atHome: boolean,
): number => {
  const gap = rotationStrength(team, players) - rotationStrength(opponent, players) + (atHome ? 2.5 : -2.5);
  return 1 / (1 + Math.exp(-gap / 6));
};
