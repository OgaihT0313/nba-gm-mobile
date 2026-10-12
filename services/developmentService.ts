// The GM's hand in player development: the minutes promised to a young player.
// (Training focus is a field on the player, read by runPlayerProgression.)
// Like the press promise, it only matters because it turns into numbers the
// game reads: a kept promise speeds his development and lifts his morale, a
// broken one sinks his morale far enough to put a trade request in play.
import type { Player, SeasonState } from '../types';

type PlayerMap = { [key: string]: Player };

/** The youngest a promise can go to is anyone; the oldest is this. */
export const PROMISE_MAX_AGE = 23;
/** Minutes a game that count as keeping it. */
export const PROMISE_MPG = 24;
/** Promises are made in the offseason or the first weeks of the season. */
export const PROMISE_DEADLINE_GAME = 15;
/** Development multiplier for the player when the promise is kept. */
export const PROMISE_DEV_BONUS = 1.25;
const KEPT_MORALE = 12;
// Low enough that the season's own morale swings can carry him under
// TRADE_REQUEST_MORALE (25) if the next year doesn't go his way either.
const BROKEN_MORALE_CAP = 30;

/** The season a promise made now would cover. */
export const promiseSeason = (season: SeasonState) => season.awardHistory.length + 1;

export const canPromiseMinutes = (season: SeasonState, p: Player): { ok: boolean; why?: string } => {
  const current = season.minutesPromise?.season === promiseSeason(season) ? season.minutesPromise : undefined;
  if (current) {
    const who = season.players[current.playerId]?.name ?? 'outro jogador';
    return { ok: false, why: current.playerId === p.id ? 'Prometido nesta temporada.' : `Já prometido a ${who} nesta temporada.` };
  }
  if (p.age > PROMISE_MAX_AGE) return { ok: false, why: `Só para jovens de até ${PROMISE_MAX_AGE} anos.` };
  if (season.status === 'active') {
    if (season.gamesPlayed > PROMISE_DEADLINE_GAME) {
      return { ok: false, why: `Só até o jogo ${PROMISE_DEADLINE_GAME}. A próxima chance é no draft, para a temporada que vem.` };
    }
  } else if (season.status !== 'draft' && season.status !== 'free_agency') {
    return { ok: false, why: 'A próxima chance é no draft, para a temporada que vem.' };
  }
  return { ok: true };
};

export interface SettledPromise { playerId: string; kept: boolean; mpg: number }

export const settleMinutesPromise = (
  prev: SeasonState, teamOf: { [playerId: string]: string },
): SettledPromise | null => {
  const pr = prev.minutesPromise;
  if (!pr || pr.season !== prev.awardHistory.length) return null;
  const p = prev.players[pr.playerId];
  // Traded away or gone: nobody left to keep it to.
  if (!p || teamOf[p.id] !== prev.userTeamId) return null;
  const mpg = p.seasonStats?.mpg ?? 0;
  const kept = mpg >= PROMISE_MPG;
  return {
    playerId: p.id,
    kept,
    mpg,
  };
};

export const applyPromiseMorale = (players: PlayerMap, s: SettledPromise): PlayerMap => {
  const p = players[s.playerId];
  if (!p) return players;
  const cur = p.morale ?? 70;
  const morale = s.kept ? Math.min(100, cur + KEPT_MORALE) : Math.min(cur, BROKEN_MORALE_CAP);
  return { ...players, [s.playerId]: { ...p, morale } };
};
