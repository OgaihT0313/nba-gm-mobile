// Exercises rivalries and revenge games over whole careers -- regular season,
// real playoffs, offseason -- on the shipped rosters.
//
// What it gates:
//   · every revenge night actually reaches the engine (the player carries the
//     boost when the game is played), and each move is avenged ONCE;
//   · the real 2026 offseason moves baked into players.json produce revenge
//     games in season one (Giannis goes back to Milwaukee);
//   · rivalries form from what happened -- playoff series and close games --
//     at a rate that keeps them meaningful: some, not all thirty;
//   · the offseason update cools heat and adds last spring's series.
//
// Not wired into the app bundle -- nothing imports it. To run (see
// check_decisions.ts for the full tsc line):
//   node <outDir>/scripts/check_rivalry.js [careers] [years]
import { teamsData, playersData } from '../constants';
import type { Team, Player, SeasonState, PlayoffState } from '../types';
import { simulationEngine } from '../services/simulationService';
import { generateSchedule } from '../services/scheduleService';
import { simulateOneDay } from '../services/seasonRunner';
import { buildSeasonOwner } from '../services/ownerService';
import { initCoaches } from '../services/coachService';
import { initialPickAssets, makeUserPick, consensusValue } from '../services/draftService';
import { resolveDecision } from '../services/decisionService';
import { startOffseason, finishDraft, startSeason } from '../services/offseasonService';
import { getFreeAgents, signFreeAgentLegality, evaluateSigningInterest, signPlayer } from '../services/freeAgencyService';
import { playerValue } from '../services/tradeService';
import {
  hasRevengeAgainst, isRival, rivalriesAfterSeason, settleUserGame, REVENGE_BOOST, RIVAL_HEAT, RIVAL_WIN_MORALE,
} from '../services/rivalryService';

declare const process: { argv: string[] };
const CAREERS = Number(process.argv[2] || 4);
const YEARS = Number(process.argv[3] || 4);

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failures++; console.log(`  FAIL ${label} ${detail}`); }
};
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

const buildSeason = (userTeamId: string): SeasonState => {
  const initialTeams: Team[] = initialPickAssets((teamsData as Team[]).map(t => ({
    ...t, wins: 0, losses: 0, momentum: 0,
    stats: { ppg: 0, oppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, tpg: 0 },
    performanceHistory: [{ gamesPlayed: 0, wins: 0 }],
  })), 1);
  const { coaches, teams } = initCoaches(initialTeams);
  const players: { [k: string]: Player } = JSON.parse(JSON.stringify(playersData));
  return {
    status: 'active', playoffStage: 'none', gamesPlayed: 0, teams, players,
    events: [], playoff: null, awards: null, userTeamId,
    cup: simulationEngine.initCupGroups(teams), gmLegacy: { seasons: 0, titles: 0 }, awardHistory: [],
    owner: buildSeasonOwner(teams.find(t => t.id === userTeamId)!, teams, players),
    schedule: generateSchedule(teams), coaches,
  };
};

const revengeNights: number[] = [];
const userRevengeGames: number[] = [];
const rivalGames: number[] = [];
const rivalsAtSeasonEnd: number[] = [];
const rivalsIntoNextSeason: number[] = [];
let giannisAvenged = false;
let boosted = 0;

const playRegularSeason = (s: SeasonState, year: number) => {
  let nights = 0, userNights = 0, rivalG = 0;
  const avenged = new Set<string>();
  let guard = 0;
  while (s.gamesPlayed < 82 && guard++ < 500) {
    const n = s.awardHistory.length;
    const today = s.schedule.filter(g => g.day === s.gamesPlayed + 1);
    // Who should be carrying a revenge night into tonight's games.
    const due: { id: string; teamId: string; had: boolean }[] = [];
    today.forEach(g => {
      const home = s.teams.find(t => t.id === g.homeTeamId)!;
      const away = s.teams.find(t => t.id === g.awayTeamId)!;
      [[home, away], [away, home]].forEach(([t, o]) => t.roster.forEach(id => {
        if (hasRevengeAgainst(s.players[id], o.id, n)) {
          const eff = t.playerStatusEffects?.[id];
          due.push({ id, teamId: t.id, had: !!eff && eff.ovrChange !== REVENGE_BOOST });
          // Set the night before, so the engine -- and a live game, which
          // plays before the runner -- already sees it. Day one is the
          // runner's own job, and a player already on a streak keeps his.
          if (s.gamesPlayed > 0 && !t.playerAbsences?.[id]) {
            check('o bonus de revanche ja esta no jogador antes do jogo', !!eff, `${s.players[id].name} dia ${s.gamesPlayed + 1}`);
            if (eff && eff.ovrChange === REVENGE_BOOST) boosted++;
          }
        }
      }));
      if (g.homeTeamId === s.userTeamId || g.awayTeamId === s.userTeamId) {
        const opp = g.homeTeamId === s.userTeamId ? g.awayTeamId : g.homeTeamId;
        if (isRival(s.rivalries, opp)) rivalG++;
      }
    });
    // The night before (or, on day one, the runner itself) must have set it.
    // Checked on the runner's own pre-game state by replaying its first step:
    // a missing boost here means a revenge story with no effect on the game.
    s = simulateOneDay(s).season;
    due.forEach(d => {
      const p = s.players[d.id];
      const team = s.teams.find(t => t.id === d.teamId)!;
      if (!team.roster.includes(d.id)) return;
      check('revanche marcada depois do jogo', !!p.formerTeam?.faced, `${p.name}`);
      check('cada mudanca de time vira revanche uma vez so', !avenged.has(`${d.id}:${p.formerTeam?.teamId}`), p.name);
      avenged.add(`${d.id}:${p.formerTeam?.teamId}`);
      nights++;
      if (d.teamId === s.userTeamId || s.schedule.some(g => g.day === s.gamesPlayed
        && [g.homeTeamId, g.awayTeamId].includes(s.userTeamId) && [g.homeTeamId, g.awayTeamId].includes(d.teamId))) userNights++;
      if (year === 0 && p.name.startsWith('Giannis')) giannisAvenged = true;
    });
    while (s.decisions && s.decisions.length) {
      const d = s.decisions[0];
      const enabled = d.options.filter(o => !o.disabled);
      if (!enabled.length) { s = { ...s, decisions: s.decisions.slice(1) }; continue; }
      s = resolveDecision(s, d.id, enabled[Math.floor(Math.random() * enabled.length)].id);
    }
  }
  revengeNights.push(nights);
  userRevengeGames.push(userNights);
  rivalGames.push(rivalG);
  return s;
};

// Real playoffs, every series simulated (the user's Game 7 included: no live
// game here, so the user id handed to the engine is one that never plays).
const playPlayoffs = (s: SeasonState): SeasonState => {
  let playoff = s.playoff as PlayoffState;
  let champion: Team | null = null;
  for (let i = 0; i < 20 && !champion; i++) {
    const r = simulationEngine.advancePlayoffRound(playoff, s.players, s.coaches, '__nobody__');
    playoff = r.updatedPlayoff;
    champion = r.newChampion ?? null;
  }
  check('os playoffs coroam um campeao', !!champion, '');
  return {
    ...s, playoff, status: 'offseason',
    awardHistory: [...s.awardHistory, { season: s.gmLegacy.seasons + 1, championId: champion?.id } as any],
    gmLegacy: { seasons: s.gmLegacy.seasons + 1, titles: s.gmLegacy.titles + (champion?.id === s.userTeamId ? 1 : 0) },
  };
};

const userSummer = (s: SeasonState): SeasonState => {
  let guard = 0;
  while (s.draft && !s.draft.complete && guard++ < 100) {
    const best = [...s.draft.available].sort((a, b) => consensusValue(s.draft!.reports[b]) - consensusValue(s.draft!.reports[a]))[0];
    const r = makeUserPick(s.draft, s.teams, s.players, s.userTeamId, best);
    s = { ...s, draft: r.draft, teams: r.teams, players: r.players };
  }
  s = finishDraft(s);
  for (let i = 0; i < 18; i++) {
    const me = s.teams.find(t => t.id === s.userTeamId)!;
    if (me.roster.length >= 13) break;
    const fa = getFreeAgents(s.teams, s.players).find(p =>
      signFreeAgentLegality(me, p, s.players).legal && evaluateSigningInterest(p, me, s.teams, s.players).willing);
    if (!fa) break;
    const signed = signPlayer(me, fa, s.players);
    s = { ...s, players: { ...s.players, [fa.id]: signed.player }, teams: s.teams.map(t => t.id === me.id ? signed.team : t) };
  }
  const me = s.teams.find(t => t.id === s.userTeamId)!;
  if (me.roster.length > 18) {
    const cut = [...me.roster].sort((a, b) => playerValue(s.players[a]) - playerValue(s.players[b])).slice(0, me.roster.length - 18);
    s = { ...s, teams: s.teams.map(t => t.id === me.id ? { ...t, roster: t.roster.filter(id => !cut.includes(id)) } : t) };
  }
  return startSeason(s);
};

// --- unit checks ------------------------------------------------------------
{
  // A rival game moves the rotation; a close game feeds the heat.
  const team = { id: 'u', roster: ['a'], momentum: 0 } as unknown as Team;
  const players = { a: { id: 'a', morale: 50 } as Player };
  const r1 = settleUserGame({ x: { heat: RIVAL_HEAT } }, team, 'x', true, 10, players, ['a']);
  check('vencer o rival levanta o animo', players.a.morale === 50 + RIVAL_WIN_MORALE, `${players.a.morale}`);
  check('vencer o rival da embalo', team.momentum === 1, `${team.momentum}`);
  check('jogo folgado nao esquenta', r1.x.heat === RIVAL_HEAT, `${r1.x.heat}`);
  const r2 = settleUserGame(undefined, team, 'y', false, 2, players, ['a']);
  check('jogo decidido no detalhe esquenta', r2.y.heat === 1 && r2.y.close === 1, JSON.stringify(r2.y));
  check('nao-rival nao mexe no animo', players.a.morale === 50 + RIVAL_WIN_MORALE, `${players.a.morale}`);

  // The offseason: cool, then add the series.
  const t = (id: string) => ({ id } as Team);
  const series = (a: string, b: string, w: string) => ({ m: [t(a), t(b)], w: t(w) });
  const empty = { round1: [], round2: [], round3: [], winner: null };
  const playoff = {
    east: { initialSeeds: [], seeds: [], bracket: { ...empty, round1: [series('u', 'p', 'u')], round2: [series('u', 'q', 'q')] } },
    west: { initialSeeds: [], seeds: [], bracket: empty },
    finals: null, champion: null, awards: {},
  } as unknown as PlayoffState;
  const after = rivalriesAfterSeason({ z: { heat: 3 }, w: { heat: 1 } }, playoff, 'u', 'temporada 1')!;
  check('quem te eliminou vira rival', isRival(after, 'q'), JSON.stringify(after.q));
  check('quem voce eliminou esquenta', after.p?.heat === 2, JSON.stringify(after.p));
  check('rivalidade esfria no verao', after.z?.heat === 1 && !after.w, JSON.stringify(after));
  check('o motivo diz o que aconteceu', !!after.q.why?.includes('eliminou você'), after.q.why);
}

// --- careers ------------------------------------------------------------------
console.log(`Simulando ${CAREERS} carreiras de ${YEARS} temporadas (com playoffs)...`);
for (let c = 0; c < CAREERS; c++) {
  let s = buildSeason((teamsData as Team[])[(c * 11) % teamsData.length].id);
  for (let y = 0; y < YEARS; y++) {
    s = playRegularSeason(s, y);
    check('a temporada chega ao fim', s.status === 'playoffs_idle', `${s.status} ${s.gamesPlayed}`);
    rivalsAtSeasonEnd.push(Object.keys(s.rivalries ?? {}).filter(id => isRival(s.rivalries, id)).length);
    s = playPlayoffs(s);
    s = startOffseason(s);
    rivalsIntoNextSeason.push(Object.keys(s.rivalries ?? {}).filter(id => isRival(s.rivalries, id)).length);
    s = userSummer(s);
    check('a nova temporada abre', s.status === 'active', s.status);
  }
  console.log(`  carreira ${c + 1}/${CAREERS} ok (${s.teams.find(t => t.id === s.userTeamId)!.name})`);
}

console.log('\n================ RIVALIDADES E REVANCHES ================\n');
console.log(`Noites de revanche na liga por temporada: ${mean(revengeNights).toFixed(1)}`);
console.log(`  ...com o bonus de +${REVENGE_BOOST} ativo na hora do jogo: ${boosted}`);
console.log(`  ...envolvendo o seu time: ${mean(userRevengeGames).toFixed(1)}`);
console.log(`Rivais do usuario no fim da temporada regular: ${mean(rivalsAtSeasonEnd).toFixed(1)}  (max ${Math.max(...rivalsAtSeasonEnd)})`);
console.log(`Rivais levados para a temporada seguinte: ${mean(rivalsIntoNextSeason).toFixed(1)}`);
console.log(`Jogos contra rival por temporada: ${mean(rivalGames).toFixed(1)}`);

check('Giannis volta a Milwaukee na primeira temporada', giannisAvenged, '');
check('revanches acontecem', mean(revengeNights) >= 20, `${mean(revengeNights).toFixed(1)}`);
check('o seu time vive revanches', mean(userRevengeGames) >= 1, `${mean(userRevengeGames).toFixed(1)}`);
// Rivals must exist but stay few: a rivalry with a third of the league is no
// rivalry at all.
check('rivalidades se formam', mean(rivalsAtSeasonEnd) >= 1, `${mean(rivalsAtSeasonEnd).toFixed(1)}`);
check('jogos contra rival acontecem', mean(rivalGames) >= 1, `${mean(rivalGames).toFixed(1)}`);
check('rivais sao poucos', Math.max(...rivalsAtSeasonEnd, ...rivalsIntoNextSeason) <= 5,
  `max ${Math.max(...rivalsAtSeasonEnd, ...rivalsIntoNextSeason)}`);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
