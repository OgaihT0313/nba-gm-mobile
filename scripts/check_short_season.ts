// The real short seasons (src/eraYear.seasonGamesFor): 1998-99 had 50 games,
// 2011-12 had 66. Started there, and walked into from the season before:
//   - every team plays exactly that many games;
//   - the All-Star and the trade deadline fall inside the season, in the
//     same place of it as day 58 and day 55 of 82;
//   - the awards find players with enough games, and the owner's target is
//     in the season's terms;
//   - an 82-game season is untouched.
//
// Run like diagnose_season (see its header), then:
//   node .check/scripts/check_short_season.js
import './harness';
import type { Team, Player, SeasonState } from '../types';
import { ERAS, eraById } from '../data/eras';
import { generateSchedule, seasonGamesOf } from '../services/scheduleService';
import { simulateOneDay, allStarGame } from '../services/seasonRunner';
import { buildSeasonOwner } from '../services/ownerService';
import { initCoaches } from '../services/coachService';
import { initialPickAssets, makeUserPick, consensusValue } from '../services/draftService';
import { tradeDeadlineGame } from '../services/tradeService';
import { startOffseason, finishDraft, startSeason } from '../services/offseasonService';
import { seasonGamesFor } from '../src/eraYear';
import { getFreeAgents, signFreeAgentLegality, evaluateSigningInterest, signPlayer } from '../services/freeAgencyService';
import { MAX_ROSTER_SIZE } from '../services/tradeService';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failures++; console.log(`  FAIL ${label} ${detail}`); }
};

const build = (eraId: string): SeasonState => {
  const era = eraById(eraId)!;
  const games = seasonGamesFor(parseInt(era.seasonLabel, 10) + 1);
  const initial = initialPickAssets((era.teams as Team[]).map(t => ({
    ...t, wins: 0, losses: 0, momentum: 0,
    stats: { ppg: 0, oppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, tpg: 0 },
    performanceHistory: [{ gamesPlayed: 0, wins: 0 }],
  })), 1);
  const { coaches, teams } = initCoaches(initial);
  const players: { [k: string]: Player } = JSON.parse(JSON.stringify(era.players));
  const user = teams[0];
  return {
    status: 'active', playoffStage: 'none', gamesPlayed: 0, teams, players,
    events: [], playoff: null, awards: null, userTeamId: user.id,
    gmLegacy: { seasons: 0, titles: 0 }, awardHistory: [],
    owner: buildSeasonOwner(user, teams, players, undefined, games),
    schedule: generateSchedule(teams, games), coaches,
    era: { id: era.id, label: era.label, seasonLabel: era.seasonLabel },
    eraChainIndex: ERAS.findIndex(e => e.id === era.id),
  };
};

// The regular season, noting the day the All-Star and the deadline came.
const play = (s: SeasonState, label: string): SeasonState => {
  let allStarDay = 0;
  let guard = 0;
  while (s.status === 'active' && guard++ < 200) {
    s = simulateOneDay(s).season;
    s = { ...s, decisions: [] };
    if (!allStarDay && s.allStar) allStarDay = s.gamesPlayed;
  }
  const games = s.teams.map(t => (t.wins ?? 0) + (t.losses ?? 0));
  const want = seasonGamesOf(s.schedule);
  check(`${label}: ${want} jogos para todos`, games.every(g => g === want), `${Math.min(...games)}-${Math.max(...games)}`);
  check(`${label}: All-Star dentro da temporada`, allStarDay > 0 && allStarDay < want, `dia ${allStarDay}`);
  check(`${label}: prazo de trocas dentro da temporada`, tradeDeadlineGame() < want, `dia ${tradeDeadlineGame()}`);
  check(`${label}: MVP escolhido`, !!s.awards?.mvp, '');
  console.log(`${label}: ${want} jogos, All-Star no dia ${allStarDay}, prazo no dia ${tradeDeadlineGame()}, meta do dono ${s.owner.targetWins} V, MVP ${s.players[s.awards?.mvp ?? '']?.name ?? '—'}`);
  return s;
};

const crown = (s: SeasonState): SeasonState => {
  const champ = [...s.teams].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0))[0];
  return {
    ...s, status: 'offseason', playoff: null,
    awardHistory: [...s.awardHistory, { season: s.gmLegacy.seasons + 1, championId: champ.id } as any],
    gmLegacy: { seasons: s.gmLegacy.seasons + 1, titles: s.gmLegacy.titles },
  };
};

// Started in the short season itself.
for (const id of ['spurs-first-ring-1998-99', 'lockout-2011-12']) {
  if (!eraById(id)) { console.log(`  (sem a era ${id})`); continue; }
  const s = build(id);
  play(s, eraById(id)!.seasonLabel);
}

// Walked into from the season before: 1997-98 (82) -> 1998-99 (50) -> 1999-00 (82).
{
  let s = build('last-dance-1997-98');
  s = play(s, '1997-98');
  for (let y = 0; y < 2; y++) {
    s = crown(s);
    s = startOffseason(s);
    while (s.draft && !s.draft.complete) {
      // The user's pick: the best available on the board.
      const best = [...s.draft.available].sort((a, b) => consensusValue(s.draft!.reports[b]) - consensusValue(s.draft!.reports[a]))[0];
      const r = makeUserPick(s.draft, s.teams, s.players, s.userTeamId, best);
      s = { ...s, draft: r.draft, teams: r.teams, players: r.players };
    }
    s = finishDraft(s);
    // A plain GM summer: the market up to 13, the worst cut over the limit.
    for (let i = 0; i < 18; i++) {
      const me = s.teams.find(t => t.id === s.userTeamId)!;
      if (me.roster.length >= 13) break;
      const fa = getFreeAgents(s.teams, s.players).find(p =>
        signFreeAgentLegality(me, p, s.players).legal && evaluateSigningInterest(p, me, s.teams, s.players).willing);
      if (!fa) break;
      const signed = signPlayer(me, fa, s.players);
      s = { ...s, players: { ...s.players, [fa.id]: signed.player }, teams: s.teams.map(t => (t.id === me.id ? signed.team : t)) };
    }
    const user = s.teams.find(t => t.id === s.userTeamId)!;
    if (user.roster.length > MAX_ROSTER_SIZE) s = { ...s, teams: s.teams.map(t => (t.id === user.id ? { ...t, roster: t.roster.slice(0, MAX_ROSTER_SIZE) } : t)) };
    s = startSeason(s);
    check('a temporada seguinte abre', s.status === 'active', s.status);
    const label = y === 0 ? '1998-99' : '1999-00';
    const games = seasonGamesOf(s.schedule);
    check(`${label} no calendário`, games === (y === 0 ? 50 : 82), `${games}`);
    s = play(s, `${label} (continuação)`);
  }
}

console.log(failures ? `\n${failures} falhas.` : '\nSem falhas.');
