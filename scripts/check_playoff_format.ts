// The playoffs each season really had (src/eraYear.playoffFormatFor), played
// from the end of a real regular season to the champion:
//   - 1980-81: 12 teams, the top two of each conference on a bye, first round
//     best of 3;
//   - 1989-90: 16 teams, first round best of 5;
//   - 2009-10: 16 teams, everything best of 7, no play-in;
//   - the live league: the play-in for seeds 7-10.
// And the deciding game of a best of 5 written back as 3-2, not 4-3.
//
// Run like diagnose_season (see its header), then:
//   node .check/scripts/check_playoff_format.js [runsPerSeason]
import './harness';
import type { Team, Player, SeasonState, PlayoffSeries } from '../types';
import { ERAS, eraById } from '../data/eras';
import { teamsData, playersData } from '../constants';
import { simulationEngine } from '../services/simulationService';
import { generateSchedule } from '../services/scheduleService';
import { simulateOneDay } from '../services/seasonRunner';
import { buildSeasonOwner } from '../services/ownerService';
import { initCoaches } from '../services/coachService';
import { initialPickAssets } from '../services/draftService';
import { seasonResult } from '../services/historyService';
import { playoffFormatOf } from '../src/eraYear';

declare const process: { argv: string[] };
const RUNS = Number(process.argv[2] || 3);

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failures++; console.log(`  FAIL ${label} ${detail}`); }
};

const build = (eraId: string | null): SeasonState => {
  const era = eraId ? eraById(eraId)! : undefined;
  const seedTeams = (era ? era.teams : teamsData) as Team[];
  const seedPlayers = (era ? era.players : playersData) as { [k: string]: Player };
  const initial = initialPickAssets(seedTeams.map(t => ({
    ...t, wins: 0, losses: 0, momentum: 0,
    stats: { ppg: 0, oppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, tpg: 0 },
    performanceHistory: [{ gamesPlayed: 0, wins: 0 }],
  })), 1);
  const { coaches, teams } = initCoaches(initial);
  const players = JSON.parse(JSON.stringify(seedPlayers));
  // Nobody's GM: no decision ever stops the clock, no decider pauses a series.
  const userTeamId = '__nobody__';
  return {
    status: 'active', playoffStage: 'none', gamesPlayed: 0, teams, players,
    events: [], playoff: null, awards: null, userTeamId,
    gmLegacy: { seasons: 0, titles: 0 }, awardHistory: [],
    owner: buildSeasonOwner(teams[0], teams, players),
    schedule: generateSchedule(teams), coaches,
    era: era ? { id: era.id, label: era.label, seasonLabel: era.seasonLabel } : undefined,
    eraChainIndex: era ? ERAS.findIndex(e => e.id === era.id) : undefined,
  };
};

const maxWins = (s: PlayoffSeries) => Math.max(...(s.s ?? '0-0').split('-').map(Number));

const cases: { id: string | null; label: string; byes: number; playIn: boolean; firstRoundWins: number }[] = [
  { id: 'celtics-first-ring-1980-81', label: '1980-81', byes: 2, playIn: false, firstRoundWins: 2 },
  { id: 'pistons-repeat-1989-90', label: '1989-90', byes: 0, playIn: false, firstRoundWins: 3 },
  { id: 'lakers-celtics-rematch-2009-10', label: '2009-10', byes: 0, playIn: false, firstRoundWins: 4 },
  { id: null, label: 'liga atual', byes: 0, playIn: true, firstRoundWins: 4 },
];

for (const c of cases) {
  if (c.id && !eraById(c.id)) { console.log(`  (sem a era ${c.id})`); continue; }
  for (let run = 0; run < RUNS; run++) {
    let s = build(c.id);
    let guard = 0;
    while (s.status === 'active' && guard++ < 400) { s = simulateOneDay(s).season; s = { ...s, decisions: [] }; }
    const p0 = s.playoff!;
    check(`${c.label}: playoffs montados`, !!p0, s.status);
    if (!p0) continue;
    const fmt = playoffFormatOf(s);
    if (run === 0) console.log(`${c.label}: ${fmt.playIn ? 'play-in, ' : ''}${fmt.seedsPerConf * 2} times, séries ${fmt.bestOf.join('/')}`);
    for (const conf of [p0.east, p0.west]) {
      check(`${c.label}: play-in`, !!conf.playIn === c.playIn);
      if (!c.playIn) {
        const byes = conf.bracket.round1.filter(x => x.bye).length;
        check(`${c.label}: folgas na 1ª rodada`, byes === c.byes, `${byes}`);
        check(`${c.label}: 4 vagas na 1ª rodada`, conf.bracket.round1.length === 4, `${conf.bracket.round1.length}`);
      }
    }
    let p = p0;
    let champion: Team | undefined;
    for (let i = 0; i < 20 && !champion; i++) {
      const r = simulationEngine.advancePlayoffRound(p, s.players, s.coaches, s.userTeamId);
      p = r.updatedPlayoff;
      champion = r.newChampion;
    }
    check(`${c.label}: campeão coroado`, !!champion);
    for (const conf of [p.east, p.west]) {
      conf.bracket.round1.filter(x => !x.bye).forEach(x => check(`${c.label}: 1ª rodada termina em ${c.firstRoundWins} vitórias`, maxWins(x) === c.firstRoundWins, x.s));
      conf.bracket.round2.forEach(x => check(`${c.label}: semifinal em melhor de 7`, maxWins(x) === 4, x.s));
    }
    check(`${c.label}: final em melhor de 7`, !!p.finals && maxWins(p.finals) === 4, p.finals?.s);
    // A bye team's season reads as at least the conference semis, never "play-in".
    const byeTeam = p.east.bracket.round1.find(x => x.bye)?.m[0];
    if (byeTeam) check(`${c.label}: quem folgou não conta como play-in`, seasonResult(p, byeTeam.id, champion!.id) !== 'playin', seasonResult(p, byeTeam.id, champion!.id));
    const ninth = p.east.initialSeeds[8];
    if (!c.playIn) check(`${c.label}: sem play-in, só ${p.east.initialSeeds.length} cabeças de chave`, !ninth, ninth?.id);
  }
}

// The deciding game of a best of 5 (round 1 in 1989-90) goes back as 3-2.
{
  let s = build('pistons-repeat-1989-90');
  let guard = 0;
  while (s.status === 'active' && guard++ < 400) { s = simulateOneDay(s).season; s = { ...s, decisions: [] }; }
  const p = { ...s.playoff!, pendingDecider: { scope: 'conference' as const, conf: 'east' as const, round: 'round1' as const, index: 1 } };
  const [a, b] = p.east.bracket.round1[1].m as Team[];
  const after = simulationEngine.applyDeciderResult(p, a, b, a.id);
  check('jogo 5 decisivo vira 3-2', after.east.bracket.round1[1].s === '3-2', after.east.bracket.round1[1].s);
  check('melhor de 5 na 1ª rodada', simulationEngine.seriesBestOf(p, p.pendingDecider) === 5);
}

console.log(failures ? `\n${failures} falhas.` : '\nSem falhas.');
