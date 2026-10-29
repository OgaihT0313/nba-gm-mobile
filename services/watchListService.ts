// The watch list (ROADMAP Q6): players the GM wants to hear about. Pure: it
// compares a season before and after any step -- a simulated day, a part of
// the offseason -- and says what changed for the players on the list. The
// news goes into the user's own feed (teamIds carries his team, the feed's
// filter), and during the season it is a toast too (seasonRunner).

import type { Event, Player, SeasonState } from '../types';

/** An absence this long is news (rollInjury's "estiramento" tier and up). */
const INJURY_NEWS_GAMES = 6;
/** An OVR move this big is news (the offseason progression). */
const OVR_NEWS = 2;

const teamOfMap = (s: SeasonState) => {
  const m = new Map<string, string>();
  s.teams.forEach((t) => t.roster.forEach((id) => m.set(id, t.id)));
  return m;
};

export const isWatched = (s: SeasonState, playerId: string) => (s.watchList ?? []).includes(playerId);

export function watchNews(before: SeasonState, after: SeasonState): Event[] {
  const ids = after.watchList ?? [];
  if (!ids.length) return [];
  const teamBefore = teamOfMap(before);
  const teamAfter = teamOfMap(after);
  const nameOfTeam = (id?: string) => after.teams.find((t) => t.id === id)?.name ?? id ?? '';
  const out: Event[] = [];
  const say = (message: string) => out.push({ message: `👁️ OBSERVADO: ${message}`, type: 'info', teamIds: [after.userTeamId] });

  ids.forEach((id) => {
    const was: Player | undefined = before.players[id];
    const now: Player | undefined = after.players[id];
    if (!was || !now) return;
    const from = teamBefore.get(id);
    const to = teamAfter.get(id);
    if (!was.retired && now.retired) { say(`${now.name} se aposentou.`); return; }
    if (from && to && from !== to) say(`${now.name} foi do ${nameOfTeam(from)} para o ${nameOfTeam(to)}.`);
    else if (from && !to) say(`${now.name} está sem time: dá para contratar.`);
    else if (!from && to) say(`${now.name} fechou com o ${nameOfTeam(to)}.`);

    const absBefore = from ? before.teams.find((t) => t.id === from)?.playerAbsences?.[id] : undefined;
    const absAfter = to ? after.teams.find((t) => t.id === to)?.playerAbsences?.[id] : undefined;
    if (absAfter?.reason === 'injury' && !absBefore && absAfter.duration >= INJURY_NEWS_GAMES) {
      say(`${now.name} se machucou e perde ${absAfter.duration} jogos.`);
    }
    if (Math.abs(now.ovr - was.ovr) >= OVR_NEWS) {
      say(`${now.name} ${now.ovr > was.ovr ? 'subiu' : 'caiu'} de ${was.ovr} para ${now.ovr} de OVR.`);
    }
  });
  return out;
}

/** `after` with the watch-list news since `before` at the top of its feed. */
export const withWatchNews = (before: SeasonState, after: SeasonState): SeasonState => {
  const news = watchNews(before, after);
  return news.length ? { ...after, events: [...news, ...after.events].slice(0, 60) } : after;
};

/** Watched players a team could sign right now (no team, not retired, not a prospect). */
export const watchedFreeAgents = (s: SeasonState): Player[] => {
  const rostered = new Set(s.teams.flatMap((t) => t.roster));
  return (s.watchList ?? []).map((id) => s.players[id]).filter((p): p is Player => !!p && !p.retired && !p.prospect && !rostered.has(p.id));
};
